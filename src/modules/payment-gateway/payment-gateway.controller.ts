import {
  Controller, Post, Get, Param, Body, Req, Res,
  UseGuards, HttpCode, HttpStatus, Query,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { FlexibleAccessGuard } from '../../auth/guards/flexible-access.guard';
import { RequireAnyOfRoles } from '../../auth/decorators/flexible-access.decorator';
import { UserType } from '../user/enums/user-type.enum';
import { PaymentGatewayService } from './payment-gateway.service';
import { InitiateGatewayPaymentDto } from './dto/payment-gateway.dto';

interface JwtRequest extends Request { user: { s: string } }

@Controller('payment-gateway')
export class PaymentGatewayController {
  constructor(private readonly svc: PaymentGatewayService) {}

  /**
   * Institute admin: initiate a gateway credit top-up.
   * Returns checkout URL + pre-signed form fields to POST to gateway.
   * merchant_secret never leaves the server.
   */
  @Post('institutes/:instituteId/checkout')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ instituteAdmin: true })
  @HttpCode(HttpStatus.OK)
  async initiateCheckout(
    @Param('instituteId') instituteId: string,
    @Body() dto: InitiateGatewayPaymentDto,
    @Req() req: JwtRequest,
  ) {
    const userId = req.user.s;
    return this.svc.initiateCheckout(instituteId, userId, dto);
  }

  /**
   * Poll order status — called by frontend after return_url redirect.
   */
  @Get('institutes/:instituteId/orders/:orderId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ instituteAdmin: true })
  async getOrderStatus(
    @Param('instituteId') instituteId: string,
    @Param('orderId') orderId: string,
  ) {
    return this.svc.getOrderStatus(orderId, instituteId);
  }

  /**
   * Order history for an institute.
   */
  @Get('institutes/:instituteId/orders')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ instituteAdmin: true })
  async listOrders(
    @Param('instituteId') instituteId: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.svc.listOrders(instituteId, Number(page), Number(limit));
  }

  /**
   * PayHere server-to-server webhook (notify_url).
   * Must be publicly accessible (no auth guard — PayHere cannot send a JWT).
   * Security is via md5sig verification inside the service.
   * Always returns 200 so PayHere doesn't retry endlessly.
   */
  @Post('webhook/:provider')
  @HttpCode(HttpStatus.OK)
  async webhook(
    @Param('provider') provider: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    // PayHere sends application/x-www-form-urlencoded
    const payload = req.body as Record<string, string>;
    await this.svc.handleWebhook(provider, payload).catch(() => {
      // Never throw — always 200 to avoid PayHere retries
    });
    return res.status(200).send('OK');
  }

  // ─── Admin endpoints ────────────────────────────────────────────────────────

  /** Admin: list all gateway orders across all institutes */
  @Get('admin/gateway-orders')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
  async adminListOrders(
    @Query('instituteId') instituteId?: string,
    @Query('status')      status?: string,
    @Query('provider')    provider?: string,
    @Query('page')        page = '1',
    @Query('limit')       limit = '20',
  ) {
    return this.svc.adminListOrders({ instituteId, status, provider, page: Number(page), limit: Number(limit) });
  }

  /** Admin: aggregated stats */
  @Get('admin/gateway-orders/stats')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
  async adminGetStats() {
    return this.svc.adminGetStats();
  }

  /** Admin: get a single order with full webhook payload */
  @Get('admin/gateway-orders/:orderId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
  async adminGetOrder(@Param('orderId') orderId: string) {
    return this.svc.adminGetOrder(orderId);
  }

  /** Admin: manually grant credits for a stuck PENDING order */
  @Post('admin/gateway-orders/:orderId/manual-grant')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
  async adminManualGrant(
    @Param('orderId') orderId: string,
    @Req() req: Request & { user: { s: string } },
  ) {
    return this.svc.adminManualGrant(orderId, req.user.s);
  }

  /** Admin: cancel / void a PENDING order */
  @Post('admin/gateway-orders/:orderId/cancel')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
  async adminCancel(
    @Param('orderId') orderId: string,
    @Body('reason') reason?: string,
  ) {
    return this.svc.adminCancel(orderId, reason);
  }
}
