import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Entities
import { PushNotificationEntity } from './entities/push-notification.entity';
import { NotificationReadEntity } from './entities/notification-read.entity';
import { NotificationRecipientEntity } from './entities/notification-recipient.entity';
import { InstituteUserEntity } from '../institute_mudules/institue_user/entities/institue_user.entity';
import { InstituteClassStudentEntity } from '../institute_class_modules/institute_class_student/entities/institute_class_student.entity';
import { InstituteClassSubjectStudent } from '../institute_class_subject_modules/institute_class_subject_students/entities/institute_class_subject_student.entity';
import { InstituteClassSubjectEntity } from '../institute_class_modules/institute_class_subject/entities/institute_class_subject.entity';
import { StudentEntity } from '../student/entities/student.entity';
import { UserEntity } from '../user/entities/user.entity';
import { UserFcmTokenEntity } from '../user/entities/user-fcm-token.entity';

// Controllers
import { PushNotificationAdminController } from './controllers/push-notification-admin.controller';
import { PushNotificationUserController } from './controllers/push-notification-user.controller';

// Services
import { PushNotificationService } from './services/push-notification.service';
import { PushNotificationSchedulerService } from './services/push-notification-scheduler.service';

// Repositories
import { PushNotificationRepository } from './repositories/push-notification.repository';
import { UserFcmTokenRepository } from '../user/repositories/user-fcm-token.repository';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PushNotificationEntity,
      NotificationReadEntity,
      NotificationRecipientEntity,
      InstituteUserEntity,
      InstituteClassStudentEntity,
      InstituteClassSubjectStudent,
      InstituteClassSubjectEntity,
      StudentEntity,
      UserEntity,
      UserFcmTokenEntity,
    ]),
  ],
  controllers: [
    PushNotificationAdminController,
    PushNotificationUserController,
  ],
  providers: [
    PushNotificationService,
    PushNotificationSchedulerService,
    PushNotificationRepository,
    UserFcmTokenRepository,
  ],
  exports: [
    PushNotificationService,
    PushNotificationRepository,
  ],
})
export class PushNotificationModule {}
