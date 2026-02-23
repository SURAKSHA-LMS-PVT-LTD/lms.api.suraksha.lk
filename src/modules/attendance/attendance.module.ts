import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { SmsModule } from '../sms/sms.module';
import { DynamoDBAttendanceService } from './services/dynamodb-attendance.service';
import { DynamoDBAttendanceServiceV2 } from './services/dynamodb-attendance.service.v2';
import { AttendanceNotificationService } from './services/attendance-notification.service';
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

@Module({
  imports: [
    SmsModule,
    CacheModule,
    ConfigModule,
    InstituteModule, // Import for calendar services
    forwardRef(() => require('../advertisement/advertisement.module').AdvertisementModule),
    TypeOrmModule.forFeature([
      StudentEntity,
      ParentEntity,
      UserEntity,
      StudentBookhireEnrollmentEntity,
      InstituteUserEntity,
      AdvertisementEntity,
      UserFcmTokenEntity
    ])
  ],
  controllers: [AttendanceController],
  providers: [
    AttendanceService,
    DynamoDBAttendanceService,
    DynamoDBAttendanceServiceV2,
    AttendanceNotificationService,
    CloudStorageService,
    FcmNotificationService,
    EnhancedEmailService,
    UserFcmTokenRepository
  ],
  exports: [AttendanceService, DynamoDBAttendanceService, DynamoDBAttendanceServiceV2, AttendanceNotificationService]
})
export class AttendanceModule {}


