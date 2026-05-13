import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PaymentEntity } from './entities/payment.entity';
import { InstituteClassSubjectPayment } from './entities/institute-class-subject-payment.entity';
import { InstituteClassSubjectPaymentSubmission } from './entities/institute-class-subject-payment-submission.entity';
import { InstituteClassPayment } from './entities/institute-class-payment.entity';
import { InstituteClassPaymentSubmission } from './entities/institute-class-payment-submission.entity';
import { InstitutePayment } from './entities/institute-payment.entity';
import { InstitutePaymentSubmission } from './entities/institute-payment-submission.entity';
import { UserEntity } from '../user/entities/user.entity';
import { InstituteUserEntity } from '../institute_mudules/institue_user/entities/institue_user.entity';
import { InstituteClassSubjectStudent } from '../institute_class_subject_modules/institute_class_subject_students/entities/institute_class_subject_student.entity';
import { InstituteClassStudentEntity } from '../institute_class_modules/institute_class_student/entities/institute_class_student.entity';
import { PaymentController } from './controllers/payment.controller';
import { InstituteClassSubjectPaymentController } from './controllers/institute-class-subject-payment.controller';
import { InstituteClassSubjectPaymentSubmissionController } from './controllers/institute-class-subject-payment-submission.controller';
import { InstituteClassPaymentController } from './controllers/institute-class-payment.controller';
import { InstituteClassPaymentSubmissionController } from './controllers/institute-class-payment-submission.controller';
import { InstitutePaymentController } from './controllers/institute-payment.controller';
import { InstitutePaymentSubmissionController } from './controllers/institute-payment-submission.controller';
import { PaymentService } from './services/payment.service';
import { InstituteClassSubjectPaymentService } from './services/institute-class-subject-payment.service';
import { InstituteClassPaymentService } from './services/institute-class-payment.service';
import { InstitutePaymentService } from './services/institute-payment.service';
import { CommonModule } from '../../common/common.module';
import { CacheModule } from '../../common/modules/cache.module';
import { AsyncEmailService } from '../../common/services/async-email.service';
import { EnhancedEmailService } from '../../common/services/enhanced-email.service';
import { FinanceModule } from '../finance/finance.module';

@Module({
  imports: [
    CommonModule, // Import CommonModule to get CloudStorageService
    CacheModule,
    FinanceModule,
    TypeOrmModule.forFeature([
      PaymentEntity,
      InstituteClassSubjectPayment,
      InstituteClassSubjectPaymentSubmission,
      InstituteClassPayment,
      InstituteClassPaymentSubmission,
      InstitutePayment,
      InstitutePaymentSubmission,
      UserEntity,
      InstituteUserEntity,
      InstituteClassSubjectStudent,
      InstituteClassStudentEntity,
    ]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        // 🔒 SECURITY: Validate JWT_SECRET on initialization
        const jwtSecret = configService.get<string>('JWT_SECRET');
        
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
        const weakSecrets = ['secret', 'fallback-secret-key', 'your-secret-key', 'jwt-secret', 'change-me'];
        if (weakSecrets.includes(jwtSecret.toLowerCase())) {
          throw new Error(
            '❌ CRITICAL SECURITY ERROR: JWT_SECRET is using a default/weak value!\n' +
            'NEVER use default secrets in production.\n' +
            'Generate a secure secret with: openssl rand -hex 64'
          );
        }

        return {
          secret: jwtSecret,
          signOptions: { expiresIn: (configService.get<string>('JWT_EXPIRES_IN') || '15m') as any },
        };
      },
      inject: [ConfigService],
    }),
    ConfigModule,
  ],
  controllers: [
    PaymentController,
    InstituteClassSubjectPaymentController,
    InstituteClassSubjectPaymentSubmissionController,
    InstituteClassPaymentController,
    InstituteClassPaymentSubmissionController,
    InstitutePaymentController,
    InstitutePaymentSubmissionController,
  ],
  providers: [
    PaymentService,
    InstituteClassSubjectPaymentService,
    InstituteClassPaymentService,
    InstitutePaymentService,
    EnhancedEmailService,
    AsyncEmailService,
  ],
  exports: [
    PaymentService,
    InstituteClassSubjectPaymentService,
    InstituteClassPaymentService,
    InstitutePaymentService,
  ],
})
export class PaymentModule {}
