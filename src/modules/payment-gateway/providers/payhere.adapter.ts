import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import {
  PaymentGatewayProvider,
  CheckoutParams,
  CheckoutInitResult,
  WebhookVerifyResult,
} from './payment-gateway.interface';

/**
 * PayHere adapter — dual-secret support.
 *
 * PayHere issues one merchant_id (1236300) with two domain/app entries,
 * each carrying its own secret:
 *   PAYHERE_MERCHANT_SECRET_WEB  — suraksha.lk     (browser checkout)
 *   PAYHERE_MERCHANT_SECRET_APP  — lk.suraksha.lms (Capacitor in-app browser)
 *
 * Checkout: picks the correct secret from the `platform` field on CheckoutParams
 *   ('web' → WEB secret, 'app' → APP secret, default → WEB).
 *
 * Webhook: PayHere sends one notify_url for both platforms. We verify against
 *   BOTH secrets and accept if either matches — covers the case where the hash
 *   was built with the app secret but the webhook hits the same endpoint.
 *
 * Hash formula (PayHere spec):
 *   innerHash = MD5(secret).toUpperCase()
 *   hash      = MD5(merchant_id + order_id + amount_2dp + currency + innerHash).toUpperCase()
 *
 * Webhook md5sig:
 *   MD5(merchant_id + order_id + payhere_amount + payhere_currency + status_code + innerHash).toUpperCase()
 */
@Injectable()
export class PayHereAdapter implements PaymentGatewayProvider {
  readonly name = 'PAYHERE';
  private readonly logger = new Logger(PayHereAdapter.name);

  private readonly merchantId: string;
  private readonly secretWeb: string;
  private readonly secretApp: string;
  private readonly mode: 'sandbox' | 'live';

  constructor(private readonly config: ConfigService) {
    this.merchantId = config.getOrThrow<string>('PAYHERE_MERCHANT_ID');
    this.secretWeb  = config.getOrThrow<string>('PAYHERE_MERCHANT_SECRET_WEB');
    this.secretApp  = config.getOrThrow<string>('PAYHERE_MERCHANT_SECRET_APP');
    this.mode = (config.get<string>('PAYHERE_MODE') ?? 'sandbox') as 'sandbox' | 'live';
    this.logger.log(`PayHere adapter initialised in ${this.mode.toUpperCase()} mode (merchant ${this.merchantId})`);
  }

  private get baseUrl(): string {
    return this.mode === 'live'
      ? 'https://www.payhere.lk'
      : 'https://sandbox.payhere.lk';
  }

  private formatAmount(amount: number): string {
    return amount.toFixed(2);
  }

  private md5Upper(input: string): string {
    return crypto.createHash('md5').update(input).digest('hex').toUpperCase();
  }

  private secretFor(platform?: string): string {
    return platform === 'app' ? this.secretApp : this.secretWeb;
  }

  private buildHash(orderId: string, amount: number, currency: string, secret: string): string {
    const inner = this.md5Upper(secret);
    return this.md5Upper(this.merchantId + orderId + this.formatAmount(amount) + currency + inner);
  }

  private buildWebhookHash(
    orderId: string, amount: string, currency: string, statusCode: string, secret: string,
  ): string {
    const inner = this.md5Upper(secret);
    return this.md5Upper(this.merchantId + orderId + amount + currency + statusCode + inner);
  }

  async buildCheckout(params: CheckoutParams): Promise<CheckoutInitResult> {
    const secret = this.secretFor(params.platform);
    const hash   = this.buildHash(params.orderId, params.amount, params.currency, secret);

    const fields: Record<string, string> = {
      merchant_id: this.merchantId,
      return_url:  params.returnUrl,
      cancel_url:  params.cancelUrl,
      notify_url:  params.notifyUrl,
      order_id:    params.orderId,
      items:       params.items,
      currency:    params.currency,
      amount:      this.formatAmount(params.amount),
      first_name:  params.firstName,
      last_name:   params.lastName,
      email:       params.email,
      phone:       params.phone,
      address:     params.address,
      city:        params.city,
      country:     params.country,
      hash,
    };

    if (params.custom1) fields['custom_1'] = params.custom1;
    if (params.custom2) fields['custom_2'] = params.custom2;

    return {
      gatewayUrl: `${this.baseUrl}/pay/checkout`,
      fields,
      provider: this.name,
    };
  }

  async verifyWebhook(payload: Record<string, string>): Promise<WebhookVerifyResult> {
    const {
      merchant_id, order_id, payhere_amount, payhere_currency,
      status_code, md5sig, payment_id, method,
    } = payload;

    if (!merchant_id || !order_id || !payhere_amount || !payhere_currency || !status_code || !md5sig) {
      this.logger.warn('PayHere webhook missing required fields');
      return this.invalidResult(payload);
    }

    if (merchant_id !== this.merchantId) {
      this.logger.warn(`PayHere merchant_id mismatch: got ${merchant_id}`);
      return this.invalidResult(payload);
    }

    // Try both secrets — webhook comes from the same notify_url regardless of platform
    const sigWeb = this.buildWebhookHash(order_id, payhere_amount, payhere_currency, status_code, this.secretWeb);
    const sigApp = this.buildWebhookHash(order_id, payhere_amount, payhere_currency, status_code, this.secretApp);
    const incoming = md5sig.toUpperCase();

    if (incoming !== sigWeb && incoming !== sigApp) {
      this.logger.warn(`PayHere md5sig mismatch for order ${order_id} (tried web + app secrets)`);
      return this.invalidResult(payload);
    }

    return {
      valid: true,
      orderId: order_id,
      gatewayPaymentId: payment_id ?? '',
      statusCode: Number(status_code),
      amount: parseFloat(payhere_amount),
      currency: payhere_currency,
      method: method ?? undefined,
      rawPayload: payload,
    };
  }

  private invalidResult(rawPayload: Record<string, string>): WebhookVerifyResult {
    return {
      valid: false,
      orderId: rawPayload['order_id'] ?? '',
      gatewayPaymentId: '',
      statusCode: -2,
      amount: 0,
      currency: '',
      rawPayload,
    };
  }
}
