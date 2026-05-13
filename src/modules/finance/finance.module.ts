import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FinanceAccountEntity } from './entities/finance-account.entity';
import { FinanceCategoryEntity } from './entities/finance-category.entity';
import { TeacherWalletEntity } from './entities/teacher-wallet.entity';
import { FinanceLedgerEntity } from './entities/finance-ledger.entity';
import { FinanceService } from './services/finance.service';
import { FinanceController } from './finance.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      FinanceAccountEntity,
      FinanceCategoryEntity,
      TeacherWalletEntity,
      FinanceLedgerEntity,
    ]),
  ],
  controllers: [FinanceController],
  providers: [FinanceService],
  exports: [FinanceService],
})
export class FinanceModule {}
