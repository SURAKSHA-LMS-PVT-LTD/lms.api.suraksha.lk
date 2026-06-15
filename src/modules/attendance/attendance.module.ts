import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AttendanceController } from './attendance.controller';
import { AttendanceAliasController } from './attendance-alias.controller';
import { CalendarAttendanceController } from './calendar-attendance.controller';
import { ClassAttendanceSessionController } from './class-attendance-session.controller';
import { AdminWhatsAppController } from './admin-whatsapp.controller';
import { AttendanceService } from './attendance.service';
import { SmsModule } from '../sms/sms.module';
import { DynamoDBAttendanceService } from './services/dynamodb-attendance.service';
import { DynamoDBAttendanceServiceV2 } from './services/dynamodb-attendance.service.v2';
import { AttendanceNotificationService } from './services/attendance-notification.service';
import { AttendanceSyncConfigService } from './services/attendance-sync-config.service';
import { AttendanceSyncSchedulerService } from './services/attendance-sync-scheduler.service';
import { MysqlAttendanceService } from './services/mysql-attendance.service';
import { ClassAttendanceSessionService } from './services/class-attendance-session.service';
import { InstituteClassAttendanceSessionEntity } from './entities/institute-class-attendance-session.entity';
import { InstituteClassAttendanceSessionGroupEntity } from './entities/institute-class-attendance-session-group.entity';
import { CloudStorageService } from '../../common/services/cloud-storage.service';
import { FcmNotificationService } from '../../common/services/fcm-notification.service';
import { CacheModule } from '../../common/modules/cache.module';
import { ConfigModule } from '@nestjs/config';
import { StudentEntity } from '../student/entities/student.entity';
import { ParentEntity } from '../parent/entities/parent.entity';
import { UserEntity } from '../user/entities/user.entity';
import { StudentBookhireEnrollmentEntity } from '../private-transportation/entities/student-bookhire-enrollment.entity';
import { InstituteUserEntity } from '../institute_mudules/institue_user/entities/institue_user.entity';
import { AdvertisementEntity } from '../advertisement/entities/advertisement.entity';
import { UserFcmTokenRepository } from '../user/repositories/user-fcm-token.repository';
import { UserFcmTokenEntity } from '../user/entities/user-fcm-token.entity';
import { EnhancedEmailService } from '../../common/services/enhanced-email.service';
import { InstituteModule } from '../institute/institute.module';
import { AttendanceDeviceModule } from '../attendance-device/attendance-device.module';
import { AttendanceRecordEntity } from './entities/attendance-record.entity';
import { InstituteEntity } from '../institute/entities/institute.entity';
import { InstituteClassEntity } from '../institute_mudules/institue_class/entities/institue_class.entity';
import { SubjectEntity } from '../subject/entities/subject.entity';
import { InstituteClassStudentEntity } from '../institute_class_modules/institute_class_student/entities/institute_class_student.entity';
import { InstituteClassSubjectStudent } from '../institute_class_subject_modules/institute_class_subject_students/entities/institute_class_subject_student.entity';

@Module({
  imports: [
    SmsModule,
    CacheModule,
    ConfigModule,
    InstituteModule, // Import for calendar services
    AttendanceDeviceModule, // Import for device validation during marking
    forwardRef(() => require('../advertisement/advertisement.module').AdvertisementModule),
    TypeOrmModule.forFeature([
      StudentEntity,
      ParentEntity,
      UserEntity,
      StudentBookhireEnrollmentEntity,
      InstituteUserEntity,
      AdvertisementEntity,
      UserFcmTokenEntity,
      AttendanceRecordEntity,
      InstituteEntity,
      InstituteClassEntity,
      SubjectEntity,
      InstituteClassStudentEntity,
      InstituteClassSubjectStudent,
      InstituteClassAttendanceSessionEntity,
      InstituteClassAttendanceSessionGroupEntity,
    ])
  ],
  controllers: [AttendanceController, AttendanceAliasController, CalendarAttendanceController, ClassAttendanceSessionController, AdminWhatsAppController],
  providers: [
    AttendanceService,
    DynamoDBAttendanceService,
    DynamoDBAttendanceServiceV2,
    MysqlAttendanceService,
    AttendanceNotificationService,
    AttendanceSyncConfigService,
    AttendanceSyncSchedulerService,
    ClassAttendanceSessionService,
    CloudStorageService,
    FcmNotificationService,
    EnhancedEmailService,
    UserFcmTokenRepository
  ],
  exports: [AttendanceService, DynamoDBAttendanceService, DynamoDBAttendanceServiceV2, MysqlAttendanceService, AttendanceNotificationService]
})
export class AttendanceModule {}


