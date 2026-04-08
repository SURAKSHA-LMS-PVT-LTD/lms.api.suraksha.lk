import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InstituteCreditsEntity } from './entities/institute-credits.entity';
import { InstituteCreditTransactionEntity } from './entities/institute-credit-transaction.entity';
import { InstituteCreditsService } from './services/institute-credits.service';
import { InstituteCreditsController } from './controllers/institute-credits.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      InstituteCreditsEntity,
      InstituteCreditTransactionEntity,
    ]),
  ],
  controllers: [InstituteCreditsController],
  providers: [InstituteCreditsService],
  exports: [InstituteCreditsService],
})
export class NotificationCreditsModule {}
