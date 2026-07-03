import { Module, Global } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditService } from './services/audit.service';
import { AuditLogInterceptor } from './interceptors/audit-log.interceptor';
import { GlobalExceptionFilter } from './filters/global-exception.filter';
import { CloudStorageService } from './services/cloud-storage.service';
import { InputValidationService } from './services/input-validation.service';
import { InputSanitizationService } from './services/input-sanitization.service';
import { PackageUpgradeService } from './services/package-upgrade.service';
import { FcmNotificationService } from './services/fcm-notification.service';
import { SystemConfigService } from './services/system-config.service';
import { UserEntity } from '../modules/user/entities/user.entity';
import { UserFcmTokenEntity } from '../modules/user/entities/user-fcm-token.entity';
import { UserOtpEntity } from '../modules/user/entities/user-otp.entity';
import { WhatsAppOtpService } from './services/whatsapp-otp.service';
import { SystemConfigEntity } from './entities/system-config.entity';
import { UserFcmTokenRepository } from '../modules/user/repositories/user-fcm-token.repository';
import { CacheModule } from './modules/cache.module';
import { EnhancedAccessGuard } from './guards/enhanced-access.guard';
import { EnhancedValidationGuard } from './guards/enhanced-validation.guard';
import { UploadController } from './controllers/upload.controller';
import { PublicUploadController } from './controllers/public-upload.controller';
import { SystemConfigAdminController } from './controllers/system-config-admin.controller';
import { UrlTransformerHelper } from './helpers/url-transformer.helper';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserEntity,
      UserFcmTokenEntity,
      SystemConfigEntity,
      UserOtpEntity,
    ]),
    CacheModule,
  ],
  providers: [
    AuditService, 
    AuditLogInterceptor,
    CloudStorageService,
    PackageUpgradeService,
    InputValidationService,
    InputSanitizationService,
    FcmNotificationService,
    SystemConfigService,
    UserFcmTokenRepository,
    EnhancedAccessGuard,
    EnhancedValidationGuard,
    UrlTransformerHelper,
    WhatsAppOtpService,
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
  ],
  controllers: [UploadController, PublicUploadController, SystemConfigAdminController],
  exports: [
    AuditService,
    AuditLogInterceptor,
    CloudStorageService,
    PackageUpgradeService,
    InputValidationService,
    InputSanitizationService,
    FcmNotificationService,
    SystemConfigService,
    UserFcmTokenRepository,
    EnhancedAccessGuard,
    EnhancedValidationGuard,
    UrlTransformerHelper,
    WhatsAppOtpService,
  ],
})
export class CommonModule {}
