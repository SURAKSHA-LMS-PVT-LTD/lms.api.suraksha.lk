import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PaymentEntity } from './entities/payment.entity';
import { InstituteClassSubjectPayment } from './entities/institute-class-subject-payment.entity';
import { InstituteClassSubjectPaymentSubmission } from './entities/institute-class-subject-payment-submission.entity';
import { InstitutePayment } from './entities/institute-payment.entity';
import { InstitutePaymentSubmission } from './entities/institute-payment-submission.entity';
import { UserEntity } from '../user/entities/user.entity';
import { InstituteUserEntity } from '../institute_mudules/institue_user/entities/institue_user.entity';
import { PaymentController } from './controllers/payment.controller';
import { InstituteClassSubjectPaymentController } from './controllers/institute-class-subject-payment.controller';
import { InstituteClassSubjectPaymentSubmissionController } from './controllers/institute-class-subject-payment-submission.controller';
import { InstitutePaymentController } from './controllers/institute-payment.controller';
import { InstitutePaymentSubmissionController } from './controllers/institute-payment-submission.controller';
import { PaymentService } from './services/payment.service';
import { InstituteClassSubjectPaymentService } from './services/institute-class-subject-payment.service';
import { InstitutePaymentService } from './services/institute-payment.service';
import { CommonModule } from '../../common/common.module';
import { CacheModule } from '../../common/modules/cache.module';
import { AsyncEmailService } from '../../common/services/async-email.service';
import { EnhancedEmailService } from '../../common/services/enhanced-email.service';

@Module({
  imports: [
    CommonModule, // Import CommonModule to get CloudStorageService
    CacheModule,
    TypeOrmModule.forFeature([
      PaymentEntity,
      InstituteClassSubjectPayment,
      InstituteClassSubjectPaymentSubmission,
      InstitutePayment,
      InstitutePaymentSubmission,
      UserEntity,
      InstituteUserEntity,
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
          signOptions: { expiresIn: '24h' },
        };
      },
      inject: [ConfigService],
    }),
    MulterModule.register({
      storage: require('multer').memoryStorage(),
      limits: {
        fileSize: 2 * 1024 * 1024, // 2MB
        files: 1,
      },
      fileFilter: (req, file, callback) => {
        // Basic file type validation
        const allowedMimeTypes = [
          'application/pdf',
          'image/jpeg',
          'image/jpg', 
          'image/png'
        ];
        
        if (allowedMimeTypes.includes(file.mimetype)) {
          callback(null, true);
        } else {
          callback(new Error('Invalid file type. Only PDF, JPG, JPEG, PNG files are allowed'), false);
        }
      },
    }),
    ConfigModule,
  ],
  controllers: [
    PaymentController,
    InstituteClassSubjectPaymentController,
    InstituteClassSubjectPaymentSubmissionController,
    InstitutePaymentController,
    InstitutePaymentSubmissionController,
  ],
  providers: [
    PaymentService,
    InstituteClassSubjectPaymentService,
    InstitutePaymentService,
    EnhancedEmailService,
    AsyncEmailService,
  ],
  exports: [
    PaymentService,
    InstituteClassSubjectPaymentService,
    InstitutePaymentService,
  ],
})
export class PaymentModule {}
