import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ErrorReportEntity } from './entities/error-report.entity';
import { ErrorReportsService } from './services/error-reports.service';
import { ErrorReportsController } from './controllers/error-reports.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ErrorReportEntity])],
  controllers: [ErrorReportsController],
  providers: [ErrorReportsService],
  exports: [ErrorReportsService],
})
export class ErrorReportsModule {}
