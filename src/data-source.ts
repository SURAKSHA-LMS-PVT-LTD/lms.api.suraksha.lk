import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import { UserEntity } from './modules/user/entities/user.entity';
import { StudentEntity } from './modules/student/entities/student.entity';
import { ParentEntity } from './modules/parent/entities/parent.entity';
import { InstituteEntity } from './modules/institute/entities/institute.entity';
import { SubjectEntity } from './modules/subject/entities/subject.entity';
import { InstituteClassSubjectEntity } from './modules/institute_class_modules/institute_class_subject/entities/institute_class_subject.entity';
import { UserOtpEntity } from './modules/user/entities/user-otp.entity';
import { PasswordResetTokenEntity, UserFirstLoginLogEntity } from './auth/entities/password-reset.entity';

// Load environment variables
config();

const AppDataSource = new DataSource({
  type: 'mysql',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  username: process.env.DB_USERNAME || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_DATABASE || 'test',
  entities: [
    __dirname + '/modules/**/entities/*.entity{.ts,.js}',
    __dirname + '/auth/entities/*.entity{.ts,.js}',
    UserEntity,
    StudentEntity,
    ParentEntity,
    InstituteEntity,
    SubjectEntity,
    InstituteClassSubjectEntity,
    UserOtpEntity,
    PasswordResetTokenEntity,
    UserFirstLoginLogEntity
  ],
  migrations: [
    __dirname + '/database/migrations/*{.ts,.js}',
    __dirname + '/migrations/*{.ts,.js}'
  ],
  synchronize: false,
  logging: true,
  extra: {
    charset: 'utf8mb4_unicode_ci',
    timezone: '+05:30',
    connectionLimit: 10,
    connectTimeout: 10000,
    supportBigNumbers: true,
    bigNumberStrings: true,
    dateStrings: false,
    debug: false,
  },
});

export default AppDataSource;
