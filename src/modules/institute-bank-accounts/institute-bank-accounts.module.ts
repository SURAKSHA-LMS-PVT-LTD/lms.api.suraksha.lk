import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InstituteBankAccountEntity } from './entities/institute-bank-account.entity';
import { InstituteBankAccountsService } from './services/institute-bank-accounts.service';
import { InstituteBankAccountsController } from './controllers/institute-bank-accounts.controller';

@Module({
  imports: [TypeOrmModule.forFeature([InstituteBankAccountEntity])],
  controllers: [InstituteBankAccountsController],
  providers: [InstituteBankAccountsService],
  exports: [InstituteBankAccountsService],
})
export class InstituteBankAccountsModule {}
