import {
  Injectable, Logger, BadRequestException,
  NotFoundException, ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';

import { GatewayPaymentOrderEntity, GatewayOrderStatus } from './entities/gateway-payment-order.entity';
import { PaymentGatewayRegistry } from './providers/payment-gateway.registry';
import { InitiateGatewayPaymentDto, InitiateUserPackageCheckoutDto } from './dto/payment-gateway.dto';
import { TenantService } from '../tenant/tenant.service';
import {
  TenantServicePaymentStatus,
  TenantServiceType,
} from '../tenant/entities/tenant-billing-payment.entity';
import { now, nowTimestamp } from '../../common/utils/timezone.util';
import { PackageDefinitionEntity } from '../payment/entities/package-definition.entity';
import { UserEntity } from '../user/entities/user.entity';
import { UserManagementService } from '../../common/services/cache-user-management.service';

/** LKR credit pricing — 1 credit = CREDIT_PRICE_LKR */
const CREDIT_PRICE_LKR = 1.0;

@Injectable()
export class PaymentGatewayService {
  private readonly logger = new Logger(PaymentGatewayService.name);

  constructor(
    @InjectRepository(GatewayPaymentOrderEntity)
    private readonly orderRepo: Repository<GatewayPaymentOrderEntity>,
    @InjectRepository(PackageDefinitionEntity)
    private readonly packageRepo: Repository<PackageDefinitionEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    private readonly registry: PaymentGatewayRegistry,
    private readonly tenantService: TenantService,
    private readonly userManagementService: UserManagementService,
    private readonly config: ConfigService,
    private readonly dataSource: DataSource,
  ) {}

  private get appBaseUrl(): string {
    return this.config.get<string>('APP_BASE_URL') ?? 'https://lms.suraksha.lk';
  }

  private get apiBaseUrl(): string {
    return this.config.get<string>('API_BASE_URL') ?? 'https://lmsapi.suraksha.lk';
  }

  /** Returns true only when PAYMENT_GATEWAY_SUPPORTIVE=true in env */
  isGatewayEnabled(): boolean {
    return this.config.get<string>('PAYMENT_GATEWAY_SUPPORTIVE') === 'true';
  }

  /** Throws 503 if PAYMENT_GATEWAY_SUPPORTIVE is not exactly "true" */
  private assertGatewayEnabled(): void {
    if (!this.isGatewayEnabled()) {
      throw new ServiceUnavailableException('Payment gateway is not enabled on this server');
    }
  }

  /**
   * Step 1 — institute admin calls this to get checkout fields.
   * We create a PENDING order, generate the provider hash server-side,
   * and return the fields for the frontend to POST to the gateway.
   */
  async initiateCheckout(
    instituteId: string,
    userId: string,
    dto: InitiateGatewayPaymentDto,
  ) {
    this.assertGatewayEnabled();
    const provider = this.registry.resolve(dto.provider ?? 'PAYHERE');
    const orderId  = uuidv4();
    const amount   = dto.credits * CREDIT_PRICE_LKR;
    const currency = 'LKR';

    // Persist PENDING order first — idempotency anchor
    const order = this.orderRepo.create({
      id: orderId,
      instituteId,
      submittedBy: userId,
      provider: provider.name,
      serviceType: TenantServiceType.CREDITS,
      amount,
      currency,
      requestedCredits: dto.credits,
      status: GatewayOrderStatus.PENDING,
      creditsGranted: false,
    });
    await this.orderRepo.save(order);

    const result = await provider.buildCheckout({
      orderId,
      amount,
      currency,
      items:      `${dto.credits} Platform Credits`,
      firstName:  'Institute',
      lastName:   'Admin',
      email:      'admin@institute.lk',
      phone:      '0000000000',
      address:    'N/A',
      city:       'Colombo',
      country:    'Sri Lanka',
      notifyUrl:  `${this.apiBaseUrl}/payment-gateway/webhook/${provider.name.toLowerCase()}`,
      returnUrl:  `${dto.returnBaseUrl ?? this.appBaseUrl}/payment/return?order_id=${orderId}`,
      cancelUrl:  `${dto.returnBaseUrl ?? this.appBaseUrl}/payment/cancel?order_id=${orderId}`,
      custom1:    instituteId,
      custom2:    TenantServiceType.CREDITS,
      platform:   dto.platform ?? 'web',
    });

    this.logger.log(`Checkout initiated: order=${orderId} provider=${provider.name} credits=${dto.credits} amount=${amount}`);

    return {
      orderId,
      gatewayUrl: result.gatewayUrl,
      fields: result.fields,
      provider: result.provider,
    };
  }

  /**
   * Step 2 — called by webhook endpoint.
   * Verifies signature, grants credits exactly once (idempotency via creditsGranted flag).
   */
  async handleWebhook(
    providerName: string,
    rawBody: Record<string, string>,
  ): Promise<void> {
    const provider = this.registry.resolve(providerName);
    const verified = await provider.verifyWebhook(rawBody);

    if (!verified.valid) {
      this.logger.warn(`Invalid webhook from ${providerName}: ${JSON.stringify(rawBody)}`);
      return; // return 200 anyway — PayHere will retry on non-200
    }

    const { orderId, statusCode, gatewayPaymentId, amount, currency, method } = verified;

    const order = await this.orderRepo.findOne({ where: { id: orderId } });
    if (!order) {
      this.logger.warn(`Webhook for unknown order ${orderId}`);
      return;
    }

    // Update gateway fields regardless of outcome
    order.gatewayPaymentId = gatewayPaymentId;
    order.gatewayMethod    = method;
    order.webhookPayload   = rawBody;

    if (statusCode === 2) {
      // SUCCESS
      await this.handleSuccess(order, amount, currency);
    } else if (statusCode === 0) {
      order.status = GatewayOrderStatus.PENDING; // still waiting
      await this.orderRepo.save(order);
    } else if (statusCode === -1) {
      order.status = GatewayOrderStatus.CANCELLED;
      await this.orderRepo.save(order);
    } else if (statusCode === -3) {
      order.status = GatewayOrderStatus.CHARGEDBACK;
      await this.orderRepo.save(order);
    } else {
      order.status = GatewayOrderStatus.FAILED;
      await this.orderRepo.save(order);
    }
  }

  private async handleSuccess(
    order: GatewayPaymentOrderEntity,
    paidAmount: number,
    currency: string,
  ): Promise<void> {
    if (order.creditsGranted) {
      this.logger.warn(`Duplicate webhook for already-granted order ${order.id} — skipped`);
      return;
    }

    // Validate amount matches what we stored (tamper protection)
    const expected = Number(order.amount);
    if (Math.abs(paidAmount - expected) > 0.01) {
      this.logger.error(`Amount mismatch on order ${order.id}: expected ${expected}, got ${paidAmount}`);
      order.status = GatewayOrderStatus.FAILED;
      await this.orderRepo.save(order);
      return;
    }

    if (order.targetPlan && order.userId) {
      // ── User package purchase: activate subscription directly ──────────────
      await this.handleUserPackageSuccess(order);
    } else {
      // ── Institute credit top-up ────────────────────────────────────────────
      await this.handleInstituteCreditsSuccess(order);
    }
  }

  private async handleInstituteCreditsSuccess(order: GatewayPaymentOrderEntity): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const billingMonth = new Date().toISOString().slice(0, 7);

      const submitted = await this.tenantService.submitServicePayment(
        order.instituteId,
        order.submittedBy,
        {
          serviceType:        TenantServiceType.CREDITS,
          serviceDescription: `${order.requestedCredits} credits via ${order.provider} gateway`,
          paymentAmount:      Number(order.amount),
          paymentMethod:      'ONLINE_PAYMENT' as any,
          paymentReference:   order.gatewayPaymentId,
          requestedQuantity:  order.requestedCredits,
          billingMonth,
          paymentDate:        new Date().toISOString().slice(0, 10),
        },
      );

      await this.tenantService.verifyServicePayment(submitted.id, 'SYSTEM', {
        status:           TenantServicePaymentStatus.VERIFIED,
        grantedQuantity:  order.requestedCredits,
        notes:            `Auto-verified via ${order.provider} gateway. Payment ID: ${order.gatewayPaymentId}`,
      });

      await manager.update(GatewayPaymentOrderEntity, order.id, {
        status:          GatewayOrderStatus.SUCCESS,
        creditsGranted:  true,
        tenantPaymentId: submitted.id,
      });
    });

    this.logger.log(
      `✅ Institute credits success: order=${order.id} credits=${order.requestedCredits} institute=${order.instituteId}`,
    );
  }

  private async handleUserPackageSuccess(order: GatewayPaymentOrderEntity): Promise<void> {
    const validityMs    = (order.targetValidityDays ?? 30) * 24 * 60 * 60 * 1000;
    const expiresAt     = new Date(nowTimestamp() + validityMs);

    await this.dataSource.transaction(async (manager) => {
      await manager.update(UserEntity, order.userId!, {
        subscriptionPlan: order.targetPlan as any,
        paymentExpiresAt: expiresAt,
        updatedAt:        new Date(),
      });

      await manager.update(GatewayPaymentOrderEntity, order.id, {
        status:         GatewayOrderStatus.SUCCESS,
        creditsGranted: true, // re-use as "fulfilled" flag for idempotency
      });
    });

    // Refresh user cache outside transaction (non-critical)
    try {
      await this.userManagementService.refreshUserCache(order.userId!);
    } catch (e) {
      this.logger.warn(`Cache refresh failed after package activation for user ${order.userId}: ${e.message}`);
    }

    this.logger.log(
      `✅ User package success: order=${order.id} userId=${order.userId} plan=${order.targetPlan} expiresAt=${expiresAt.toISOString()}`,
    );
  }

  /**
   * User package checkout — authenticated user buys a subscription plan via gateway.
   * On webhook SUCCESS the plan is activated instantly (no admin review).
   */
  async initiateUserPackageCheckout(
    userId: string,
    dto: InitiateUserPackageCheckoutDto,
  ) {
    this.assertGatewayEnabled();
    const pkg = await this.packageRepo.findOne({ where: { id: dto.packageId, isActive: true } });
    if (!pkg) throw new NotFoundException('Package not found or inactive');

    const quantity     = dto.quantity ?? 1;
    const totalPrice   = Number(pkg.price) * quantity;
    const totalDays    = pkg.validityDays * quantity;
    const provider     = this.registry.resolve(dto.provider ?? 'PAYHERE');
    const orderId      = uuidv4();
    const currency     = 'LKR';

    const user = await this.userRepo.findOne({ where: { id: userId } });
    const firstName = user?.firstName ?? 'User';
    const lastName  = user?.lastName  ?? '';
    const email     = user?.email     ?? 'user@suraksha.lk';
    const phone     = (user as any)?.phoneNumber ?? '0000000000';

    const order = this.orderRepo.create({
      id:                 orderId,
      instituteId:        'USER_PACKAGE',   // placeholder — not institute-scoped
      submittedBy:        userId,
      userId,
      provider:           provider.name,
      serviceType:        'USER_PACKAGE',
      amount:             totalPrice,
      currency,
      requestedCredits:   0,
      status:             GatewayOrderStatus.PENDING,
      creditsGranted:     false,
      targetPlan:         pkg.subscriptionPlan,
      targetValidityDays: totalDays,
    });
    await this.orderRepo.save(order);

    const result = await provider.buildCheckout({
      orderId,
      amount:    totalPrice,
      currency,
      items:     `${pkg.name} × ${quantity}`,
      firstName,
      lastName,
      email,
      phone,
      address:   'N/A',
      city:      'Colombo',
      country:   'Sri Lanka',
      notifyUrl: `${this.apiBaseUrl}/payment-gateway/webhook/${provider.name.toLowerCase()}`,
      returnUrl: `${dto.returnBaseUrl ?? this.appBaseUrl}/payment/return?order_id=${orderId}&type=package`,
      cancelUrl: `${dto.returnBaseUrl ?? this.appBaseUrl}/payment/cancel?order_id=${orderId}&type=package`,
      custom1:   userId,
      custom2:   'USER_PACKAGE',
      platform:  dto.platform ?? 'web',
    });

    this.logger.log(`User package checkout: order=${orderId} userId=${userId} plan=${pkg.subscriptionPlan} amount=${totalPrice}`);

    return { orderId, gatewayUrl: result.gatewayUrl, fields: result.fields, provider: result.provider };
  }

  /** Poll user package order status (user-scoped) */
  async getUserPackageOrderStatus(orderId: string, userId: string) {
    const order = await this.orderRepo.findOne({ where: { id: orderId } });
    if (!order || order.userId !== userId) throw new NotFoundException('Order not found');
    return {
      orderId:            order.id,
      status:             order.status,
      subscriptionPlan:   order.targetPlan,
      validityDays:       order.targetValidityDays,
      amount:             order.amount,
      currency:           order.currency,
      provider:           order.provider,
      createdAt:          order.createdAt,
    };
  }

  /** Polling endpoint — frontend calls this after return_url redirect */
  async getOrderStatus(orderId: string, instituteId: string) {
    const order = await this.orderRepo.findOne({ where: { id: orderId } });
    if (!order || order.instituteId !== instituteId) {
      throw new NotFoundException('Order not found');
    }
    return {
      orderId:        order.id,
      status:         order.status,
      creditsGranted: order.creditsGranted,
      credits:        order.requestedCredits,
      amount:         order.amount,
      currency:       order.currency,
      provider:       order.provider,
      createdAt:      order.createdAt,
    };
  }

  /** List orders for an institute */
  async listOrders(instituteId: string, page = 1, limit = 20) {
    const [data, total] = await this.orderRepo.findAndCount({
      where: { instituteId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total, page, limit };
  }

  // ─── Admin endpoints ────────────────────────────────────────────────────────

  /** Admin: list all gateway orders across all institutes with filters */
  async adminListOrders(params: {
    instituteId?: string;
    status?: string;
    provider?: string;
    page?: number;
    limit?: number;
  }) {
    const { instituteId, status, provider, page = 1, limit = 20 } = params;
    const where: any = {};
    if (instituteId) where.instituteId = instituteId;
    if (status)      where.status      = status;
    if (provider)    where.provider    = provider;

    const [data, total] = await this.orderRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total, page, limit };
  }

  /** Admin: get a single order with full webhook payload */
  async adminGetOrder(orderId: string) {
    const order = await this.orderRepo.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  /** Admin: aggregated stats across all orders */
  async adminGetStats() {
    const raw = await this.orderRepo
      .createQueryBuilder('o')
      .select('o.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .addSelect('SUM(o.amount)', 'totalAmount')
      .addSelect('SUM(o.requestedCredits)', 'totalCredits')
      .groupBy('o.status')
      .getRawMany();

    const byStatus: Record<string, { count: number; totalAmount: number; totalCredits: number }> = {};
    for (const row of raw) {
      byStatus[row.status] = {
        count:        Number(row.count),
        totalAmount:  Number(row.totalAmount  ?? 0),
        totalCredits: Number(row.totalCredits ?? 0),
      };
    }

    const totalRevenue   = raw.filter(r => r.status === GatewayOrderStatus.SUCCESS).reduce((s, r) => s + Number(r.totalAmount ?? 0), 0);
    const totalOrders    = raw.reduce((s, r) => s + Number(r.count), 0);
    const successOrders  = byStatus[GatewayOrderStatus.SUCCESS]?.count ?? 0;
    const pendingOrders  = byStatus[GatewayOrderStatus.PENDING]?.count  ?? 0;
    const failedOrders   = (byStatus[GatewayOrderStatus.FAILED]?.count ?? 0) + (byStatus[GatewayOrderStatus.CANCELLED]?.count ?? 0);

    return { byStatus, totalRevenue, totalOrders, successOrders, pendingOrders, failedOrders };
  }

  /**
   * Admin: manually grant credits for a stuck PENDING order.
   * Useful when webhook was missed but payment is confirmed in PayHere dashboard.
   */
  async adminManualGrant(orderId: string, adminId: string) {
    const order = await this.orderRepo.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.creditsGranted) throw new ConflictException('Credits already granted for this order');

    // Force SUCCESS path
    const fakeAmount = Number(order.amount);
    order.status = GatewayOrderStatus.SUCCESS;
    await this.handleSuccess(order, fakeAmount, order.currency);

    this.logger.warn(`Admin manual grant: order=${orderId} by admin=${adminId}`);
    return { message: 'Credits granted', orderId };
  }

  /** Admin: cancel/void a PENDING order without granting credits */
  async adminCancel(orderId: string, reason?: string) {
    const order = await this.orderRepo.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.creditsGranted) throw new ConflictException('Cannot cancel — credits already granted');

    await this.orderRepo.update(orderId, {
      status: GatewayOrderStatus.CANCELLED,
      webhookPayload: { ...(order.webhookPayload ?? {}), adminCancelReason: reason, adminCancelledAt: now().toISOString() },
    });
    return { message: 'Order cancelled', orderId };
  }
}
