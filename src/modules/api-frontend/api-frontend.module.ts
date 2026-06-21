import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';

// Entities
import { UserEntity } from '../user/entities/user.entity';
import { InstituteUserEntity } from '../institute_mudules/institue_user/entities/institue_user.entity';

// Services
import { ApiSecurityService } from './services/api-security.service';

// Guards
import { ApiFrontendGuard } from './guards/api-frontend.guard';

// Interceptors
import { SecurityMonitoringInterceptor } from './interceptors/security-monitoring.interceptor';

// Middleware
import { RequestFilterMiddleware } from './middleware/request-filter.middleware';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserEntity,
      InstituteUserEntity
    ]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const jwtSecret = configService.get<string>('JWT_SECRET');
        if (!jwtSecret) {
          throw new Error(
            '❌ CRITICAL SECURITY ERROR: JWT_SECRET is not configured!\n' +
            'Add it to your .env file: JWT_SECRET=your_generated_secret'
          );
        }
        return {
          secret: jwtSecret,
          signOptions: {
            expiresIn: (configService.get<string>('JWT_EXPIRATION') || '15m') as any,
            issuer: 'LaaS-API',
            audience: 'LaaS-Users'
          },
          verifyOptions: {
            issuer: 'LaaS-API',
            audience: 'LaaS-Users'
          }
        };
      },
    }),
    ConfigModule,
  ],
  controllers: [],
  providers: [
    ApiSecurityService,
    ApiFrontendGuard,
    SecurityMonitoringInterceptor,
    // ❌ REMOVED: ApiFrontendGuard as APP_GUARD - was blocking ALL routes globally
    // This guard should only be applied to specific api-frontend controllers, not globally
    // Other routes like /users/comprehensive have their own auth (ApiKeyOrJwtGuard)
    {
      provide: APP_INTERCEPTOR,
      useClass: SecurityMonitoringInterceptor,
    },
  ],
  exports: [
    ApiSecurityService,
    ApiFrontendGuard,
    SecurityMonitoringInterceptor,
  ],
})
export class ApiFrontendModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // ❌ REMOVED: RequestFilterMiddleware from ALL routes - was blocking all requests globally
    // This middleware should only apply to api-frontend routes, not to the entire application
    // Other routes like /users/* have their own validation
    // Apply request filter middleware only to api-frontend specific routes
    consumer
      .apply(RequestFilterMiddleware)
      .forRoutes('/api-frontend/*path');
  }
}
