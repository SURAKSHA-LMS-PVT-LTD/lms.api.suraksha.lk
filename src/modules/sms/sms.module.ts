import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';

// SMS entities
import { InstituteSmsCredentialsEntity } from './entities/institute-sms-credentials.entity';
import { InstituteSmsPaymentSubmissionEntity } from './entities/institute-sms-payment-submission.entity';
import { InstituteSmsMessageEntity } from './entities/institute-sms-message.entity';

// Related entities
import { UserEntity } from '../user/entities/user.entity';
import { InstituteEntity } from '../institute/entities/institute.entity';
import { InstituteUserEntity } from '../institute_mudules/institue_user/entities/institue_user.entity';
import { InstituteClassStudentEntity } from '../institute_class_modules/institute_class_student/entities/institute_class_student.entity';
import { InstituteClassSubjectEntity } from '../institute_class_modules/institute_class_subject/entities/institute_class_subject.entity';
import { StudentEntity } from '../student/entities/student.entity';
import { ParentEntity } from '../parent/entities/parent.entity';

// SMS services
import { SmsService } from './services/sms.service';
import { SmsProviderService } from './services/sms-provider.service';

// Common services (not exported by CommonModule, needed by SmsService)
import { NotificationLoggingService } from '../../common/services/notification-logging.service';
import { EnhancedEmailService } from '../../common/services/enhanced-email.service';
import { AsyncEmailService } from '../../common/services/async-email.service';
import { DynamoDbService } from '../../common/services/dynamodb.service';

// SMS controllers
import { SmsController } from './controllers/sms.controller';

// Common modules (already include necessary services)
import { CommonModule } from '../../common/common.module';
import { CacheModule } from '../../common/modules/cache.module';

// Centralized credits
import { NotificationCreditsModule } from '../notification-credits/notification-credits.module';

@Module({
  imports: [
    CommonModule,
    CacheModule,
    ConfigModule,
    NotificationCreditsModule,
    TypeOrmModule.forFeature([
      // SMS entities
      InstituteSmsCredentialsEntity,
      InstituteSmsPaymentSubmissionEntity,
      InstituteSmsMessageEntity,
      
      // Related entities for SMS functionality
      UserEntity,
      InstituteEntity,
      InstituteUserEntity,
      InstituteClassStudentEntity,
      InstituteClassSubjectEntity,
      StudentEntity,
      ParentEntity,
    ]),
  ],
  controllers: [
    SmsController,
  ],
  providers: [
    SmsService,
    SmsProviderService,
    NotificationLoggingService,
    EnhancedEmailService,
    AsyncEmailService,
    DynamoDbService,
  ],
  exports: [
    SmsService,
    SmsProviderService,
  ],
})
export class SmsModule {}
