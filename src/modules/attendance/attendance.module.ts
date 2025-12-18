import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { SmsModule } from '../sms/sms.module';
import { DynamoDBAttendanceService } from './services/dynamodb-attendance.service';
import { AttendanceNotificationService } from './services/attendance-notification.service';
import { CloudStorageService } from '../../common/services/cloud-storage.service';
import { CacheModule } from '../../common/modules/cache.module';
import { ConfigModule } from '@nestjs/config';
import { StudentEntity } from '../student/entities/student.entity';
import { ParentEntity } from '../parent/entities/parent.entity';
import { UserEntity } from '../user/entities/user.entity';
import { StudentBookhireEnrollmentEntity } from '../private-transportation/entities/student-bookhire-enrollment.entity';
import { InstituteUserEntity } from '../institute_mudules/institue_user/entities/institue_user.entity';
import { AdvertisementEntity } from '../advertisement/entities/advertisement.entity';

@Module({
  imports: [
    SmsModule,
    CacheModule,
    ConfigModule,
    forwardRef(() => require('../advertisement/advertisement.module').AdvertisementModule),
    TypeOrmModule.forFeature([
      StudentEntity,
      ParentEntity,
      UserEntity,
      StudentBookhireEnrollmentEntity,
      InstituteUserEntity,
      AdvertisementEntity
    ])
  ],
  controllers: [AttendanceController],
  providers: [
    AttendanceService,
    DynamoDBAttendanceService,
    AttendanceNotificationService,
    CloudStorageService
  ],
  exports: [AttendanceService, DynamoDBAttendanceService, AttendanceNotificationService]
})
export class AttendanceModule {}


