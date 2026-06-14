import { Injectable } from '@nestjs/common';
import { PaymentGatewayProvider } from './payment-gateway.interface';
import { PayHereAdapter } from './payhere.adapter';

/**
 * Registry that resolves a named provider.
 * To add SmartPay: implement PaymentGatewayProvider, inject here, add a case.
 * To swap the default: change DEFAULT_PROVIDER env var or the fallback below.
 */
@Injectable()
export class PaymentGatewayRegistry {
  constructor(private readonly payhere: PayHereAdapter) {}

  resolve(provider = 'PAYHERE'): PaymentGatewayProvider {
    switch (provider.toUpperCase()) {
      case 'PAYHERE': return this.payhere;
      default: return this.payhere; // fallback
    }
  }
}
