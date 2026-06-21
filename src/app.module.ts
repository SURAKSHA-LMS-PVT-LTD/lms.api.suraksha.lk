import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { ApiKeyThrottlerGuard } from './common/guards/api-key-throttler.guard';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { CommonModule } from './common/common.module';
import { SecurityHeadersMiddleware } from './common/middleware/security-headers.middleware';
import { CSRFProtectionMiddleware } from './common/middleware/csrf-protection.middleware';
import { RequestLoggerMiddleware } from './common/middleware/request-logger.middleware';
import { AuditLogInterceptor } from './common/interceptors/audit-log.interceptor';
import { DataMaskingInterceptor } from './common/interceptors/data-masking.interceptor';
import { UrlTransformInterceptor } from './common/interceptors/url-transform.interceptor';
import { DateTransformInterceptor } from './common/interceptors/date-transform.interceptor';
import { UserEntity } from './modules/user/entities/user.entity';
import { InstituteModule } from './modules/institute/institute.module';
import { UsersModule } from './modules/user/user.module';
import { ParentEntity } from './modules/parent/entities/parent.entity';
import { StudentModule } from './modules/student/student.module';
import { ParentModule } from './modules/parent/parent.module';
import { SubjectModule } from './modules/subject/subject.module';
import { StudentEntity } from './modules/student/entities/student.entity';
import { SubjectEntity } from './modules/subject/entities/subject.entity';
import { InstituteEntity } from './modules/institute/entities/institute.entity';
import { InstitueUserModule } from './modules/institute_mudules/institue_user/institue_user.module';
import { InstitueClassModule } from './modules/institute_mudules/institue_class/institue_class.module';
import { InstitueLecturesModule } from './modules/institute_mudules/institue_lectures/institue_lectures.module';
import { InstituteClassLecturesModule } from './modules/institute_mudules/institute_class_lectures/institute_class_lectures.module';
import { InstituteClassStudentModule } from './modules/institute_class_modules/institute_class_student/institute_class_student.module';
import { InstituteClassSubjectModule } from './modules/institute_class_modules/institute_class_subject/institute_class_subject.module';
import { InstituteClassSubjectExamsModule } from './modules/institute_class_subject_modules/institute_class_subject_exams/institute_class_subject_exams.module';
import { InstituteClassSubjectLecturesModule } from './modules/institute_class_subject_modules/institute_class_subject_lectures/institute_class_subject_lectures.module';
import { SubjectRecordingsModule } from './modules/institute_class_subject_modules/institute_class_subject_recordings/subject_recordings.module';
import { InstituteClassSubjectResaultsModule } from './modules/institute_class_subject_modules/institute_class_subject_resaults/institute_class_subject_resaults.module';
import { InstituteClassSubjectStudentsModule } from './modules/institute_class_subject_modules/institute_class_subject_students/institute_class_subject_students.module';
import { InstituteClassSubjectHomeworksModule } from './modules/institute_class_subject_modules/institute_class_subject_homeworks/institute_class_subject_homeworks.module';
import { InstituteClassSubjectHomeworksSubmissionsModule } from './modules/institute_class_subject_modules/institute_class_subject_homeworks_submissions/institute_class_subject_homeworks_submissions.module';
import { StudyMaterialsModule } from './modules/institute_class_subject_modules/institute_class_subject_study_materials/study_materials.module';
import { InstituteClassSubjectEntity } from './modules/institute_class_modules/institute_class_subject/entities/institute_class_subject.entity';
import { InstituteClassEntity } from './modules/institute_mudules/institue_class/entities/institue_class.entity';
import { UserOtpEntity } from './modules/user/entities/user-otp.entity';
import { PasswordResetTokenEntity, UserFirstLoginLogEntity } from './auth/entities/password-reset.entity';
import { SystemConfigEntity } from './common/entities/system-config.entity';
import { PushNotificationEntity } from './modules/push-notifications/entities/push-notification.entity';
import { PaymentModule } from './modules/payment/payment.module';
import { ApiFrontendModule } from './modules/api-frontend/api-frontend.module';
import { FileModule } from './modules/files/file.module';
import { SecurityModule } from './common/security.module';
import { SmsModule } from './modules/sms/sms.module';
import { OrganizationModule } from './modules/organization/organization.module';
import { AdvertisementModule } from './modules/advertisement/advertisement.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { PrivateTransportationModule } from './modules/private-transportation/private-transportation.module';
import { StructuredLecturesModule } from './modules/structured-lectures/structured-lectures.module';
import { UserCardManagementModule } from './modules/user-card-management/user-card-management.module';
import { PushNotificationModule } from './modules/push-notifications/push-notification.module';
import { GoogleAuthModule } from './modules/google-auth/google-auth.module';
import { UserDriveAccessModule } from './modules/user-drive-access/user-drive-access.module';
import { InstituteDriveModule } from './modules/institute-drive/institute-drive.module';
import { AttendanceDeviceModule } from './modules/attendance-device/attendance-device.module';
import { AccountDeletionModule } from './modules/account-deletion/account-deletion.module';
import { InstituteHouseModule } from './modules/institute_mudules/institute_house/institute_house.module';
import { TenantModule } from './modules/tenant/tenant.module';
import { NotificationCreditsModule } from './modules/notification-credits/notification-credits.module';
import { FeaturesModule } from './modules/features/features.module';
import { RbacModule } from './modules/rbac/rbac.module';
import { FinanceModule } from './modules/finance/finance.module';
import { InstituteApiKeysModule } from './modules/institute-api-keys/institute-api-keys.module';
import { InstituteBankAccountsModule } from './modules/institute-bank-accounts/institute-bank-accounts.module';
import { ErrorReportsModule } from './modules/error-reports/error-reports.module';
import { InstituteDesignsModule } from './modules/institute-designs/institute-designs.module';
import { PaymentGatewayModule } from './modules/payment-gateway/payment-gateway.module';
import { WhatsAppBroadcastModule } from './modules/whatsapp-broadcast/whatsapp-broadcast.module';
import { ScheduleModule } from '@nestjs/schedule';
import { OriginValidationGuard } from './common/guards/origin-validation.guard';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    // API Frontend Module - MUST BE FIRST for security gateway
    ApiFrontendModule,
    CommonModule, // Add audit logging module
    SecurityModule, // Add security module for interceptors and guards
    ConfigModule.forRoot({ isGlobal: true }),
    
    // 🔒 RATE LIMITING: Protect against brute force and DoS attacks
    ThrottlerModule.forRoot([{
      name: 'short',
      ttl: 1000,    // 1 second
      limit: 3,     // 3 requests per second per IP
    }, {
      name: 'medium',
      ttl: 10000,   // 10 seconds  
      limit: 20,    // 20 requests per 10 seconds per IP
    }, {
      name: 'long',
      ttl: 60000,   // 1 minute
      limit: 100,   // 100 requests per minute per IP
    }]),
    
    // MySQL 8.x Database Configuration with MySQL2 Driver
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const dbHost = config.get('DB_HOST') || '';
        // Cloud SQL via the connector uses a Unix socket (/cloudsql/PROJECT:REGION:INSTANCE).
        // Over that socket the connection is already secured by the proxy, so app-level
        // TLS must be OFF (enabling ssl on a socket throws a handshake error).
        const isCloudSqlSocket = dbHost.startsWith('/cloudsql/');
        return {
        type: 'mysql', // Uses MySQL2 driver automatically for MySQL 8.x compatibility
        host: isCloudSqlSocket ? undefined : dbHost,
        port: +config.get('DB_PORT'),
        username: config.get('DB_USERNAME'),
        password: config.get('DB_PASSWORD'),
        database: config.get('DB_DATABASE'),
        entities: [
          // __dirname + '/entities/institue/*.entity{.ts,.js}',
          // __dirname + '/entities/institue_class/*.entity{.ts,.js}',
          // __dirname + '/entities/institute_class_subject/*.entity{.ts,.js}',
          __dirname + '/modules/**/entities/*.entity{.ts,.js}',
          __dirname + '/auth/entities/*.entity{.ts,.js}',
          __dirname + '/modules/institute_mudules/institue_class/entities/*.entity{.ts,.js}',
          __dirname + '/common/entities/*.entity{.ts,.js}',
          InstituteEntity, ParentEntity, UserEntity, StudentEntity, SubjectEntity, InstituteClassSubjectEntity, InstituteClassEntity,
          UserOtpEntity, SystemConfigEntity, PushNotificationEntity,
          PasswordResetTokenEntity, UserFirstLoginLogEntity
        ],
        synchronize: false, // ⚠️ DISABLED - Prevents auto schema sync to avoid foreign key constraint issues
        logging: false, // Disabled for performance
        // SSL configuration moved to extra section for MySQL 8.x compatibility
        // MySQL 8.x optimized connection pool configuration
        poolSize: 15, // Production-ready connection pool
        connectTimeout: 10000, // 10 seconds (faster timeout)
        timeout: 10000,
        retryAttempts: 2,
        retryDelay: 1000,
        extra: {
          // MySQL2 driver optimized for MySQL 8.x
          charset: 'utf8mb4_unicode_ci',
          timezone: '+05:30', // Sri Lanka Time (UTC+5:30)
          connectionLimit: 15, // Match pool size
          connectTimeout: 10000, // 10 seconds
          // Performance optimizations for MySQL 8.x
          supportBigNumbers: true,
          bigNumberStrings: true,
          dateStrings: false,
          debug: false, // Always disabled in production
          // Cloud SQL connector socket (when DB_HOST=/cloudsql/...)
          ...(isCloudSqlSocket ? { socketPath: dbHost } : {}),
          // MySQL 8.x SSL configuration.
          // - Socket (Cloud SQL connector): no app-level TLS — the proxy secures it.
          // - TCP in prod: TLS on. rejectUnauthorized can be turned off via
          //   DB_SSL_REJECT_UNAUTHORIZED=false for servers (e.g. Cloud SQL public IP)
          //   whose CA isn't in the container trust store.
          ssl: isCloudSqlSocket
            ? false
            : config.get('NODE_ENV') === 'production'
              ? {
                  rejectUnauthorized: config.get('DB_SSL_REJECT_UNAUTHORIZED', 'true') === 'true',
                  minVersion: 'TLSv1.2',
                }
              : false,
        },
        };
      },
    }),
    AuthModule,
    TypeOrmModule.forFeature([UserEntity]),
    InstituteModule,
    UsersModule,
    StudentModule,
    ParentModule,
    SubjectModule,
    InstitueUserModule,
    InstitueClassModule,
    InstitueLecturesModule,
    InstituteClassLecturesModule,
    InstituteClassStudentModule,
    InstituteClassSubjectModule,
    InstituteClassSubjectExamsModule,
    InstituteClassSubjectLecturesModule,
    SubjectRecordingsModule,
    InstituteClassSubjectResaultsModule,
    InstituteClassSubjectStudentsModule,
    InstituteClassSubjectHomeworksModule,
    InstituteClassSubjectHomeworksSubmissionsModule,
    StudyMaterialsModule,
    GoogleAuthModule, // Add Google OAuth 2.0 for Drive integration (legacy - online tokens)
    UserDriveAccessModule, // Secure Google Drive access with persistent encrypted tokens
    InstituteDriveModule,   // Institute-owned Google Drive (persists across staff changes)
    PaymentModule, // Add payment module with file uploads and admin verification
    FileModule, // Add file proxy module for custom domain serving
    SmsModule, // Add SMS module with payment and verification workflow
    NotificationCreditsModule, // Centralized institute credit balance management
    OrganizationModule, // Add organization module for managing organizations
    AdvertisementModule, // Add advertisement module with caching and matching
    AttendanceModule, // Add attendance module with DynamoDB and notifications
    PrivateTransportationModule, // Add private transportation (bookhire) module
    StructuredLecturesModule, // Add structured lectures module for educational content
    UserCardManagementModule, // Add user card management for NFC/PVC/Temporary cards with RFID
    PushNotificationModule, // Add push notification module for FCM notifications
    AttendanceDeviceModule, // Add device management for attendance marking devices
    AccountDeletionModule, // Google Play compliant account deletion with 30-day grace period
    InstituteHouseModule, // Institute house management with member enrollment
    TenantModule, // Multi-tenant subdomain/custom domain management with billing
    FeaturesModule, // Institute feature toggles catalog
    RbacModule, // Dynamic RBAC: user types + per-feature permission matrices
    FinanceModule, // Suraksha Finance: accounts, ledger, teacher wallets, analytics
    InstituteApiKeysModule, // Per-institute API keys for external system integrations
    InstituteBankAccountsModule, // Institute-level bank accounts for payment collection
    ScheduleModule.forRoot(), // Enable @Cron decorators for scheduled sync jobs
    ErrorReportsModule, // User error reporting with admin status management
    InstituteDesignsModule, // Design template approval, credit-billed generation, multi-output
    PaymentGatewayModule,   // Real-time credit top-up via payment gateway (PayHere, etc.)
    WhatsAppBroadcastModule, // System-admin WhatsApp broadcast portal (filter → count → send)
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // 🔒 GLOBAL ORIGIN VALIDATION: Block all direct browser/Postman access
    {
      provide: APP_GUARD,
      useClass: OriginValidationGuard,
    },
    // 🔒 GLOBAL JWT AUTHENTICATION: Require valid JWT token on all routes
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    // 🔒 GLOBAL RATE LIMITING: per-API-key when API-key authenticated, else per-IP (M3)
    {
      provide: APP_GUARD,
      useClass: ApiKeyThrottlerGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: DateTransformInterceptor, // Transform dates to ISO strings globally
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: UrlTransformInterceptor, // Transform relative URLs to full URLs globally
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditLogInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: DataMaskingInterceptor,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(
        RequestLoggerMiddleware,
        SecurityHeadersMiddleware, 
        CSRFProtectionMiddleware
      )
      .forRoutes('*'); // Apply security middleware to all routes
  }
}

