import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { UsersService } from './user.service';
import { UsersController } from './user.controller';
import { UserEntity } from './entities/user.entity';
import { UserOtpEntity } from './entities/user-otp.entity';
import { UserFcmTokenEntity } from './entities/user-fcm-token.entity';
import { UserFcmTokenService } from './services/user-fcm-token.service';
import { UserOtpService } from './services/user-otp.service';
import { UserFcmTokenController } from './controllers/user-fcm-token.controller';
import { UserProfileImageController } from './controllers/user-profile-image.controller';
import { SystemAdminUserController } from './controllers/system-admin-user.controller';
import { InstituteAdminUserController } from './controllers/institute-admin-user.controller';
import { UserImageEntity } from './entities/user-image.entity';
import { UserFcmTokenRepository } from './repositories/user-fcm-token.repository';
import { AuthModule } from '../../auth/auth.module';
import { InstitueUserModule } from '../institute_mudules/institue_user/institue_user.module';
import { SmartCardsModule } from '../smart-cards/smart-cards.module';
import { InstituteEntity } from '../institute/entities/institute.entity';
import { InstituteUserEntity } from '../institute_mudules/institue_user/entities/institue_user.entity';
import { StudentEntity } from '../student/entities/student.entity';
import { ParentEntity } from '../parent/entities/parent.entity';
import { InstituteClassStudentEntity } from '../institute_class_modules/institute_class_student/entities/institute_class_student.entity';
import { InstituteClassSubjectStudent } from '../institute_class_subject_modules/institute_class_subject_students/entities/institute_class_subject_student.entity';
import { InstituteClassEntity } from '../institute_mudules/institue_class/entities/institue_class.entity';
import { CacheModule } from '../../common/modules/cache.module';
import { SmsModule } from '../sms/sms.module';
import { InstantSmsModule } from '../sms/instant-sms.module';
import { AsyncEmailService } from '../../common/services/async-email.service';
import { EnhancedEmailService } from '../../common/services/enhanced-email.service';
import { CloudStorageService } from '../../common/services/cloud-storage.service';
import { UserRoleValidationService } from './services/user-role-validation.service';
import { UserNotificationService } from './services/user-notification.service';
import { SystemAdminUserService } from './services/system-admin-user.service';
import { InstituteAdminUserService } from './services/institute-admin-user.service';
import { SmslenzProvider } from '../sms/providers/smslenz.provider';
import { InstituteHouseEntity } from '../institute_mudules/institute_house/entities/institute_house.entity';
import { InstituteHouseMemberEntity } from '../institute_mudules/institute_house/entities/institute_house_member.entity';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([
      UserEntity,
      UserOtpEntity,
      UserFcmTokenEntity,
      InstituteEntity,
      InstituteUserEntity,
      StudentEntity,
      ParentEntity,
      InstituteClassStudentEntity,
      InstituteClassSubjectStudent,
      InstituteClassEntity,
      UserImageEntity,
      InstituteHouseEntity,
      InstituteHouseMemberEntity,
    ]),
    CacheModule,
    SmsModule, // Add SMS module for welcome notifications
    InstantSmsModule, // Add InstantSmsModule for InstantSmsService
    forwardRef(() => AuthModule), // Use forwardRef to avoid circular dependency
    forwardRef(() => InstitueUserModule), // Add institute user module
    forwardRef(() => SmartCardsModule), // Smart-card assignment during user creation
  ],
  controllers: [UsersController, UserFcmTokenController, UserProfileImageController, SystemAdminUserController, InstituteAdminUserController],
  providers: [
    UsersService, 
    UserFcmTokenService, 
    UserOtpService,
    UserFcmTokenRepository, 
    EnhancedEmailService, 
    AsyncEmailService, 
    CloudStorageService, 
    UserRoleValidationService, 
    UserNotificationService,
    SystemAdminUserService,
    InstituteAdminUserService,
    SmslenzProvider,
    {
      provide: 'UserOtpService',
      useExisting: UserOtpService,
    },
  ],
  exports: [UsersService, UserFcmTokenService, UserOtpService, UserRoleValidationService, SystemAdminUserService, InstituteAdminUserService, TypeOrmModule], // Export services and TypeOrmModule for repository access
})
export class UsersModule {}
