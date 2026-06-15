import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InstituteApiKeyEntity } from './entities/institute-api-key.entity';
import { InstituteClassAttendanceSessionEntity } from '../attendance/entities/institute-class-attendance-session.entity';
import { AttendanceRecordEntity } from '../attendance/entities/attendance-record.entity';
import { InstituteClassStudentEntity } from '../institute_class_modules/institute_class_student/entities/institute_class_student.entity';
import { UserEntity } from '../user/entities/user.entity';
import { StudentEntity } from '../student/entities/student.entity';
import { InstituteUserEntity } from '../institute_mudules/institue_user/entities/institue_user.entity';
import { InstituteClassEntity } from '../institute_mudules/institue_class/entities/institue_class.entity';
import { InstituteApiKeyGuard } from './guards/institute-api-key.guard';
import { InstituteApiKeyService } from './services/institute-api-key.service';
import { ExternalAttendanceService } from './services/external-attendance.service';
import { ExternalStudentService } from './services/external-student.service';
import { ExternalClassService } from './services/external-class.service';
import { InstituteApiKeyManagementController } from './controllers/institute-api-key-management.controller';
import { ExternalAttendanceController } from './controllers/external-attendance.controller';
import { ExternalStudentController } from './controllers/external-student.controller';
import { ExternalClassController } from './controllers/external-class.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      InstituteApiKeyEntity,
      InstituteClassAttendanceSessionEntity,
      AttendanceRecordEntity,
      InstituteClassStudentEntity,
      UserEntity,
      StudentEntity,
      InstituteUserEntity,
      InstituteClassEntity,
    ]),
  ],
  controllers: [
    InstituteApiKeyManagementController,
    ExternalAttendanceController,
    ExternalStudentController,
    ExternalClassController,
  ],
  providers: [
    InstituteApiKeyGuard,
    InstituteApiKeyService,
    ExternalAttendanceService,
    ExternalStudentService,
    ExternalClassService,
  ],
  exports: [InstituteApiKeyGuard, InstituteApiKeyService],
})
export class InstituteApiKeysModule {}
