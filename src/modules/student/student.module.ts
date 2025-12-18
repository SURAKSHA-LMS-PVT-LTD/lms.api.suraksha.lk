import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StudentsService } from './student.service';
import { StudentsController } from './student.controller';
import { StudentEntity } from './entities/student.entity';
import { ParentEntity } from '../parent/entities/parent.entity';
import { UserEntity } from '../user/entities/user.entity';
import { UsersModule } from '../user/user.module';
import { StudentRepository } from './repositories/student.repository';
import { CacheModule } from '../../common/modules/cache.module';
import {
  StudentValidationPipe,
  StudentEmailValidationPipe,
  StudentPhoneValidationPipe,
  StudentAdmissionNumberValidationPipe,
  StudentQueryValidationPipe,
  StudentBulkValidationPipe,
  StudentParentValidationPipe,
  StudentBloodGroupValidationPipe,
} from './pipes/student-validation.pipe';

@Module({
  imports: [
    TypeOrmModule.forFeature([StudentEntity, ParentEntity, UserEntity]),
    CacheModule,
    UsersModule],
  controllers: [StudentsController],
  providers: [
    StudentsService,
    StudentRepository,
    // Pipes
    StudentValidationPipe,
    StudentEmailValidationPipe,
    StudentPhoneValidationPipe,
    StudentAdmissionNumberValidationPipe,
    StudentQueryValidationPipe,
    StudentBulkValidationPipe,
    StudentParentValidationPipe,
    StudentBloodGroupValidationPipe],
  exports: [
    StudentsService,
    StudentRepository],
})
export class StudentModule {}
