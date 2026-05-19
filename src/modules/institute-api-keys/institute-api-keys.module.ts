import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InstituteApiKeyEntity } from './entities/institute-api-key.entity';
import { InstituteClassAttendanceSessionEntity } from '../attendance/entities/institute-class-attendance-session.entity';
import { AttendanceRecordEntity } from '../attendance/entities/attendance-record.entity';
import { InstituteClassStudentEntity } from '../institute_class_modules/institute_class_student/entities/institute_class_student.entity';
import { InstituteApiKeyGuard } from './guards/institute-api-key.guard';
import { InstituteApiKeyService } from './services/institute-api-key.service';
import { ExternalAttendanceService } from './services/external-attendance.service';
import { InstituteApiKeyManagementController } from './controllers/institute-api-key-management.controller';
import { ExternalAttendanceController } from './controllers/external-attendance.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      InstituteApiKeyEntity,
      InstituteClassAttendanceSessionEntity,
      AttendanceRecordEntity,
      InstituteClassStudentEntity,
    ]),
  ],
  controllers: [
    InstituteApiKeyManagementController,
    ExternalAttendanceController,
  ],
  providers: [
    InstituteApiKeyGuard,
    InstituteApiKeyService,
    ExternalAttendanceService,
  ],
  exports: [InstituteApiKeyGuard, InstituteApiKeyService],
})
export class InstituteApiKeysModule {}
