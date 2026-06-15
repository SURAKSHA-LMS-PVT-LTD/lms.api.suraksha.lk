import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { AuthV2Controller } from './controllers/auth.v2.controller';
import { AuthMobileController } from './controllers/auth.mobile.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { PasswordMigrationService } from './password-migration.service';
import { DatabaseResetService } from './database-reset.service';
import { FirstLoginService } from './services/first-login.service';
import { EmailService } from './services/email.service';
import { AwsSesEmailService } from './services/aws-ses-email.service';
import { PasswordResetService } from './services/password-reset.service';
import { FirstLoginController } from './controllers/first-login.controller';
import { UserEntity } from '../modules/user/entities/user.entity';
import { InstituteUserEntity } from '../modules/institute_mudules/institue_user/entities/institue_user.entity';
import { InstituteClassStudentEntity } from '../modules/institute_class_modules/institute_class_student/entities/institute_class_student.entity';
import { InstituteClassSubjectEntity } from '../modules/institute_class_modules/institute_class_subject/entities/institute_class_subject.entity';
import { InstituteEntity } from '../modules/institute/entities/institute.entity';
import { InstituteClassEntity } from '../modules/institute_mudules/institue_class/entities/institue_class.entity';
import { SubjectEntity } from '../modules/subject/entities/subject.entity';
import { StudentEntity } from '../modules/student/entities/student.entity';
import { ParentEntity } from '../modules/parent/entities/parent.entity';
import { UserOtpEntity } from '../modules/user/entities/user-otp.entity';
import { PasswordResetTokenEntity, UserFirstLoginLogEntity, RefreshTokenEntity } from './entities/password-reset.entity';
import { InstituteLoginSessionEntity } from './entities/institute-login-session.entity';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
// ✅ NEW: Flexible access guard (simplified - one guard for all)
import { FlexibleAccessGuard } from './guards/flexible-access.guard';
// ✅ JWT v2: Children access guard for parent access validation
import { ChildrenAccessGuard } from './guards/children-access.guard';
import { InstituteSelectionController } from './institute-selection.controller';
import { InstituteAuthController } from './controllers/institute-auth.controller';
import { InstituteLoginService } from './services/institute-login.service';
import { InstituteSessionService } from './services/institute-session.service';
import { AccessValidationService } from './services/access-validation.service';
import { CacheModule } from '../common/modules/cache.module';
import { EnhancedJwtService } from './services/enhanced-jwt.service';
import { AsyncEmailService } from '../common/services/async-email.service';
import { EnhancedEmailService } from '../common/services/enhanced-email.service';
import { InstantSmsModule } from '../modules/sms/instant-sms.module';
import { TenantModule } from '../modules/tenant/tenant.module';

@Module({
  imports: [
    ConfigModule,
    PassportModule,
    CacheModule,
    InstantSmsModule,
    TenantModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        // 🔒 SECURITY: Validate JWT_SECRET on initialization
        const jwtSecret = config.get<string>('JWT_SECRET');
        
        if (!jwtSecret) {
          throw new Error(
            '❌ CRITICAL SECURITY ERROR: JWT_SECRET is not configured!\n' +
            'Generate a secure secret with: openssl rand -hex 64\n' +
            'Add it to your .env file: JWT_SECRET=your_generated_secret'
          );
        }

        if (jwtSecret.length < 64) {
          throw new Error(
            `❌ CRITICAL SECURITY ERROR: JWT_SECRET is too short (${jwtSecret.length} characters)!\n` +
            'JWT_SECRET must be at least 64 characters (128 recommended).\n' +
            'Generate a secure secret with: openssl rand -hex 64'
          );
        }

        // Warn about common weak secrets
        const weakSecrets = ['secret', 'fallback-secret-key', 'your-secret-key', 'jwt-secret', 'change-me', 'test'];
        if (weakSecrets.includes(jwtSecret.toLowerCase())) {
          throw new Error(
            '❌ CRITICAL SECURITY ERROR: JWT_SECRET is using a default/weak value!\n' +
            'NEVER use default secrets in production.\n' +
            'Generate a secure secret with: openssl rand -hex 64'
          );
        }

        return {
          secret: jwtSecret,
          // M2: pin HS256 for both signing and verification so alg:none / algorithm-confusion
          // tokens are rejected. Applies to all JwtService.sign/verify calls that don't override it.
          signOptions: {
            expiresIn: (config.get<string>('JWT_EXPIRES_IN') || '15m') as any,
            algorithm: 'HS256',
          },
          verifyOptions: { algorithms: ['HS256'] },
        };
      },
    }),
    TypeOrmModule.forFeature([
      UserEntity,
      InstituteEntity,
      PasswordResetTokenEntity,
      UserFirstLoginLogEntity,
      RefreshTokenEntity,
      InstituteUserEntity,
      InstituteClassStudentEntity,
      InstituteClassSubjectEntity,
      StudentEntity,
      ParentEntity,
      UserOtpEntity,
      InstituteLoginSessionEntity,
    ]),
  ],
  controllers: [AuthController, AuthV2Controller, AuthMobileController, InstituteSelectionController, FirstLoginController, InstituteAuthController],
  providers: [
    AuthService, 
    JwtStrategy, 
    PasswordMigrationService, 
    DatabaseResetService, 
    FirstLoginService,
    EmailService,
    AwsSesEmailService,
    EnhancedEmailService, // Lambda email service (AWS)
    AsyncEmailService, // Fire-and-forget async email service
    PasswordResetService,
    JwtAuthGuard,
    FlexibleAccessGuard, // ✅ The ONLY guard needed
    ChildrenAccessGuard, // ✅ JWT v2 children access validation
    EnhancedJwtService,
    InstituteLoginService,
    InstituteSessionService,
  ],
  exports: [
    AuthService, 
    PasswordMigrationService, 
    DatabaseResetService, 
    FirstLoginService,
    EmailService,
    AwsSesEmailService,
    PasswordResetService,
    JwtAuthGuard,
    FlexibleAccessGuard, // ✅ The ONLY guard needed
    ChildrenAccessGuard, // ✅ JWT v2 children access validation
    EnhancedJwtService,
    InstituteSessionService,
  ],
})
export class AuthModule {}
