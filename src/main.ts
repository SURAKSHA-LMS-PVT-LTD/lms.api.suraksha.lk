import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import { ClassSerializerInterceptor, ValidationPipe } from '@nestjs/common';
import { validateAll } from './config/validate-environment';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import * as cookieParser from 'cookie-parser';
import * as compression from 'compression';
import { SilentForbiddenExceptionFilter } from './common/filters/silent-forbidden.filter';
import { ensureTimezoneSet, logTimezoneInfo } from './common/utils/timezone.util';

// ⚠️ CRITICAL: Set timezone to Sri Lanka BEFORE any date operations
ensureTimezoneSet();

// Suppress MySQL2 deprecation warnings
const originalEmitWarning = process.emitWarning;
process.emitWarning = (warning, ...args) => {
  if (typeof warning === 'string' && warning.includes('Setting the TLS ServerName to an IP address')) {
    return;
  }
  return originalEmitWarning.call(process, warning, ...args);
};

async function bootstrap() {
  try {
    const isProduction = process.env.NODE_ENV === 'production';
    
    // � CRITICAL SECURITY CHECK: Validate environment variables BEFORE starting
    if (!isProduction) {
      console.log('🔒 Running security validation checks...\n');
    }
    const isValid = validateAll();

    if (!isValid) {
      console.error('\n🛑 APPLICATION STARTUP ABORTED DUE TO SECURITY CONFIGURATION ERRORS!\n');
      process.exit(1);
    }

    if (!isProduction) {
      console.log('🚀 Starting application...');
      logTimezoneInfo();
    }
    
    const app = await NestFactory.create(AppModule, {
      logger: isProduction ? ['error', 'warn'] : ['error', 'warn', 'log'],
      abortOnError: false,
    });

    if (!isProduction) {
      console.log('✅ NestJS app created successfully');
    }

    // 🌐 CLOUD RUN: Trust proxy headers for real client IP
    // Google Cloud Run/Load Balancers add X-Forwarded-For headers
    const expressApp = app.getHttpAdapter().getInstance();
    expressApp.set('trust proxy', true);
    if (!isProduction) {
      console.log('✅ Trust proxy enabled (reads X-Forwarded-For headers)');
    }

    // 🚫 SECURITY: Silent 403 filter - Return empty response for unauthorized access
    app.useGlobalFilters(new SilentForbiddenExceptionFilter());
    if (!isProduction) {
      console.log('✅ Silent 403 filter enabled (production: empty response, dev: detailed error)');
    }

    // 🔒 SECURITY: Add Helmet for HTTP headers protection
    app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https:'],
        },
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
    }));

    if (!isProduction) {
      console.log('✅ Security headers enabled (Helmet)');
    }

    // 🚀 PERFORMANCE: Enable gzip/brotli compression for all responses
    app.use(compression({
      threshold: 1024, // Only compress responses > 1KB
      level: 6,        // Balance between speed and compression ratio
    }));

    if (!isProduction) {
      console.log('✅ Response compression enabled');
    }

    // 🍪 Enable cookie parser for secure refresh token handling
    app.use(cookieParser());
    if (!isProduction) {
      console.log('✅ Cookie parser enabled');
    }

    // 🔒 STRICT CORS - Only allow whitelisted frontend domains
    const isDevelopment = process.env.NODE_ENV === 'development';
    const allowedOrigins = process.env.CORS_ORIGINS
      ? process.env.CORS_ORIGINS.split(',').map(o => o.trim())
      : [
        'https://lms.suraksha.lk',
        'https://org.suraksha.lk',
        'https://transport.suraksha.lk',
        'https://admin.suraksha.lk',
        'https://lms-923357517997.europe-west1.run.app', // Frontend production URL
        'http://localhost:5173', // Frontend local development
        'http://localhost:3000', // Alternative frontend port
        'http://127.0.0.1:5173', // Alternative localhost
        'http://127.0.0.1:3000'  // Alternative localhost port
      ];

    app.enableCors({
      origin: (origin, callback) => {
        // ✅ Allow all in development mode
        if (isDevelopment) {
          return callback(null, true);
        }

        // 🔒 PRODUCTION MODE: Allow requests without origin (server-to-server, mobile apps)
        // These are NOT cross-origin and don't need CORS validation
        if (!origin) {
          return callback(null, true);
        }

        // Check if origin is in whitelist
        if (allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          console.warn(`🚫 CORS blocked origin: ${origin}`);
          callback(new Error('Not allowed by CORS'));
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'X-Requested-With'],
      exposedHeaders: ['Access-Control-Allow-Private-Network'],
      preflightContinue: false,
      optionsSuccessStatus: 204,
    });

    // 🔒 Private Network Access (PNA) - Allow HTTPS origins to access local development server
    app.use((req, res, next) => {
      // Allow requests from HTTPS origins to HTTP localhost in development
      if (isDevelopment) {
        res.setHeader('Access-Control-Allow-Private-Network', 'true');
      }
      next();
    });

    if (!isProduction) {
      console.log(`✅ CORS enabled${isDevelopment ? ' (Development: All origins allowed)' : ` for origins: ${allowedOrigins.join(', ')}`}`);
    }

    // Basic validation
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        // NOTE: forbidNonWhitelisted removed globally to prevent 400 errors when frontend
        // sends extra properties (e.g. userId, role, scope). whitelist:true still STRIPS
        // unknown properties for security. Use forbidNonWhitelisted on specific endpoints only.
        transform: true,
        transformOptions: {
          // ⚠️ SECURITY NOTE: enableImplicitConversion auto-converts query/param strings to numbers/booleans.
          // This can bypass class-validator checks if DTOs aren't carefully typed.
          // Ensure all DTO properties have explicit @IsInt(), @IsBoolean(), etc. validators.
          enableImplicitConversion: true,
        },
      }),
    );

    // 🔒 SECURITY: Apply ClassSerializerInterceptor globally to honor @Exclude() decorators
    app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));

    if (!isProduction) {
      console.log('✅ Global validation pipes configured');
    }

    // 📚 API DOCUMENTATION: Setup Swagger for API documentation
    const config = new DocumentBuilder()
      .setTitle('LMS API')
      .setDescription('Learning Management System API Documentation')
      .setVersion('1.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          name: 'JWT',
          description: 'Enter JWT token',
          in: 'header',
        },
        'JWT-auth',
      )
      .addTag('Authentication', 'User authentication and authorization')
      .addTag('Users', 'User management')
      .addTag('Institutes', 'Institute management')
      .addTag('Students', 'Student management')
      .addTag('Classes', 'Class management')
      .addTag('Subjects', 'Subject management')
      .addTag('Attendance', 'Attendance tracking')
      .addTag('Payments', 'Payment management')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
        tagsSorter: 'alpha',
        operationsSorter: 'alpha',
      },
    });

    if (!isProduction) {
      console.log('✅ API documentation enabled at /api/docs');
    }

    const port = parseInt(process.env.PORT || '8080', 10);

    await app.listen(port, '0.0.0.0');

    console.log(`\n✅ SERVER RUNNING on :${port} | ENV: ${process.env.NODE_ENV || 'dev'}\n`);

  } catch (error) {
    console.error('\n❌ FATAL ERROR DURING STARTUP:');
    console.error('Error:', error?.message);
    console.error('\nStack trace:', error?.stack);
    console.error('\n🛑 Application failed to start. Check the errors above.\n');
    process.exit(1);
  }
}

bootstrap().catch((error) => {
  console.error('❌ Unhandled bootstrap error:', error);
  process.exit(1);
});
