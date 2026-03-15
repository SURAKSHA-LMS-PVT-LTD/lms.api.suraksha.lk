import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';

// MySQL Entities (migrated)
import { BookhireOwnerEntity } from './entities/bookhire-owner.entity';
import { BookhireEntity } from './entities/bookhire.entity';
import { StudentBookhireEnrollmentEntity } from './entities/student-bookhire-enrollment.entity';
import { StudentBookhireAttendanceEntity } from './entities/student-bookhire-attendance.entity';
import { ParentEntity } from '../parent/entities/parent.entity';
import { UserEntity } from '../user/entities/user.entity';
import { StudentEntity } from '../student/entities/student.entity';

// Import modules that provide existing entities
import { UsersModule } from '../user/user.module';
import { StudentModule } from '../student/student.module';
import { AuthModule } from '../../auth/auth.module';

// Services
import { BookhireOwnerService } from './services/bookhire-owner.service';
import { BookhireService } from './services/bookhire.service';
import { StudentBookhireEnrollmentService } from './services/student-bookhire-enrollment.service';
import { BookhireAttendanceService } from './services/bookhire-attendance.service';
// import { StudentBookhireAttendanceService } from './services/student-bookhire-attendance.service'; // Temporarily disabled during MongoDB cleanup
// AuthService is provided by AuthModule
import { CloudStorageService } from '../../common/services/cloud-storage.service';
import { DynamoDBBookhireAttendanceService } from './services/dynamodb-bookhire-attendance.service';
import { DynamoDBBookhireAttendanceServiceV2 } from './services/dynamodb-bookhire-attendance.service.v2';
import { SmsModule } from '../../modules/sms/sms.module';
// import { OptimizedAdvertisementService } from '../../services/optimized-advertisement.service'; // Temporarily disabled - has MongoDB dependencies

// Controllers
import { BookhireOwnerAuthController, BookhireOwnerAdminController } from './controllers/bookhire-owner.controller';
import { BookhireController } from './controllers/bookhire.controller';
import { StudentBookhireEnrollmentController } from './controllers/student-bookhire-enrollment.controller';
import { BookhireAttendanceController } from './controllers/bookhire-attendance.controller';
// import { StudentBookhireAttendanceController } from './controllers/student-bookhire-attendance.controller'; // Temporarily disabled during MongoDB cleanup

@Module({
  imports: [
    // Import modules for existing entities (users, students, parents)
    UsersModule,
    StudentModule,
    AuthModule, // Provides AuthService with all dependencies
    // TypeORM for migrated entities
    TypeOrmModule.forFeature([
      BookhireOwnerEntity,
      BookhireEntity,
      StudentBookhireEnrollmentEntity,
      StudentBookhireAttendanceEntity,
      ParentEntity,
      UserEntity,  // Re-import to use in this module's services
      StudentEntity, // Re-import to use in this module's services
    ]),
    SmsModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: (configService.get<string>('JWT_EXPIRATION', '15m')) as any,
        },
      }),
      inject: [ConfigService],
    }),
    ConfigModule,
  ],
  controllers: [
    BookhireOwnerAuthController,
    BookhireOwnerAdminController,
    BookhireController,
    StudentBookhireEnrollmentController,
    BookhireAttendanceController,
    // StudentBookhireAttendanceController, // Temporarily disabled during MongoDB cleanup
  ],
  providers: [
    BookhireOwnerService,
    BookhireService,
    StudentBookhireEnrollmentService,
    BookhireAttendanceService,
    DynamoDBBookhireAttendanceService,
    DynamoDBBookhireAttendanceServiceV2,
    // StudentBookhireAttendanceService, // Temporarily disabled during MongoDB cleanup
    // AuthService, // Provided by AuthModule
    CloudStorageService,
  ],
  exports: [
    BookhireOwnerService,
    BookhireService,
    StudentBookhireEnrollmentService,
    BookhireAttendanceService,
    DynamoDBBookhireAttendanceService,
    DynamoDBBookhireAttendanceServiceV2,
    //StudentBookhireAttendanceService, // Temporarily disabled during MongoDB cleanup
  ],
})
export class PrivateTransportationModule {}