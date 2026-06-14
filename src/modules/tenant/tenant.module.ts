import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantService } from './tenant.service';
import { TenantController } from './tenant.controller';
import { InstituteEntity } from '../institute/entities/institute.entity';
import { LoginEventEntity } from './entities/login-event.entity';
import { InstituteBillingConfigEntity } from './entities/institute-billing-config.entity';
import { MonthlyBillingSummaryEntity } from './entities/monthly-billing-summary.entity';
import { TenantServicePaymentEntity } from './entities/tenant-billing-payment.entity';
import { InstituteSmsCredentialsEntity } from '../sms/entities/institute-sms-credentials.entity';
import { SenderMaskEntity } from '../sms/entities/sender-mask.entity';
import { PackageDefinitionEntity } from '../payment/entities/package-definition.entity';
import { UserEntity } from '../user/entities/user.entity';
import { NotificationCreditsModule } from '../notification-credits/notification-credits.module';

@Module({
  imports: [
    NotificationCreditsModule,
    TypeOrmModule.forFeature([
      InstituteEntity,
      LoginEventEntity,
      InstituteBillingConfigEntity,
      MonthlyBillingSummaryEntity,
      TenantServicePaymentEntity,
      InstituteSmsCredentialsEntity,
      SenderMaskEntity,
      PackageDefinitionEntity,
      UserEntity,
    ]),
  ],
  controllers: [TenantController],
  providers: [TenantService],
  exports: [TenantService],
})
export class TenantModule {}
