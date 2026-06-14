import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { GatewayPaymentOrderEntity } from './entities/gateway-payment-order.entity';
import { PaymentGatewayService } from './payment-gateway.service';
import { PaymentGatewayController } from './payment-gateway.controller';
import { PayHereAdapter } from './providers/payhere.adapter';
import { PaymentGatewayRegistry } from './providers/payment-gateway.registry';
import { TenantModule } from '../tenant/tenant.module';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([GatewayPaymentOrderEntity]),
    TenantModule,
  ],
  controllers: [PaymentGatewayController],
  providers: [PayHereAdapter, PaymentGatewayRegistry, PaymentGatewayService],
  exports: [PaymentGatewayService],
})
export class PaymentGatewayModule {}
