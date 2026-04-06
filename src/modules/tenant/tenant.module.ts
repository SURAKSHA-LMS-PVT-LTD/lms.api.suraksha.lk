import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantService } from './tenant.service';
import { TenantController } from './tenant.controller';
import { InstituteEntity } from '../institute/entities/institute.entity';
import { LoginEventEntity } from './entities/login-event.entity';
import { InstituteBillingConfigEntity } from './entities/institute-billing-config.entity';
import { MonthlyBillingSummaryEntity } from './entities/monthly-billing-summary.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      InstituteEntity,
      LoginEventEntity,
      InstituteBillingConfigEntity,
      MonthlyBillingSummaryEntity,
    ]),
  ],
  controllers: [TenantController],
  providers: [TenantService],
  exports: [TenantService],
})
export class TenantModule {}
