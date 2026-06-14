/**
 * Provider-agnostic payment gateway interface.
 * Add a new provider (SmartPay, Stripe, etc.) by implementing this interface
 * and registering it in PaymentGatewayRegistry — nothing else changes.
 */

export interface CheckoutParams {
  orderId: string;
  amount: number;         // e.g. 1000.00
  currency: string;       // 'LKR' | 'USD' etc.
  items: string;          // short item description
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  country: string;
  notifyUrl: string;
  returnUrl: string;
  cancelUrl: string;
  custom1?: string;       // pass-through (e.g. instituteId)
  custom2?: string;       // pass-through (e.g. serviceType)
  /** 'web' uses the suraksha.lk secret; 'app' uses lk.suraksha.lms secret */
  platform?: 'web' | 'app';
}

export interface CheckoutInitResult {
  /** URL the browser/WebView should POST to */
  gatewayUrl: string;
  /** All form fields to POST (including hash — generated server-side) */
  fields: Record<string, string>;
  /** Provider identifier stored on the order record */
  provider: string;
}

export interface WebhookVerifyResult {
  valid: boolean;
  orderId: string;
  gatewayPaymentId: string;
  /** 2=success, 0=pending, -1=cancelled, -2=failed, -3=chargedback */
  statusCode: number;
  amount: number;
  currency: string;
  method?: string;
  rawPayload: Record<string, string>;
}

export interface PaymentGatewayProvider {
  readonly name: string;

  /** Build checkout form data (called by backend — never exposed raw to frontend) */
  buildCheckout(params: CheckoutParams): Promise<CheckoutInitResult>;

  /** Verify an incoming webhook notification and extract status */
  verifyWebhook(payload: Record<string, string>): Promise<WebhookVerifyResult>;
}
