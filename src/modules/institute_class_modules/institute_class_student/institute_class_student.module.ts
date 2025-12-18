import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InstituteClassStudentService } from './institute_class_student.service';
import { InstituteClassStudentController, StudentClassesController } from './institute_class_student.controller';
import { InstituteClassStudentEntity } from './entities/institute_class_student.entity';
import { InstituteClassStudentRepository } from './repositories/institute-class-student.repository';
import { 
  InstituteClassStudentValidationPipe, 
  BulkInstituteClassStudentValidationPipe,
  InstituteClassStudentParamsValidationPipe 
} from './pipes/institute-class-student-validation.pipe';
import { StudentModule } from '../../student/student.module';
import { UsersModule } from '../../user/user.module';
import { UserEntity } from '../../user/entities/user.entity';
import { StudentEntity } from '../../student/entities/student.entity';
import { ParentEntity } from '../../parent/entities/parent.entity';
import { CacheModule } from '../../../common/modules/cache.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      InstituteClassStudentEntity,
      UserEntity,
      StudentEntity,
      ParentEntity
    ]),
    CacheModule,
    StudentModule,
    UsersModule,
  ],
  controllers: [
    InstituteClassStudentController,
    StudentClassesController,
  ],
  providers: [
    InstituteClassStudentService,
    InstituteClassStudentRepository,
    InstituteClassStudentValidationPipe,
    BulkInstituteClassStudentValidationPipe,
    InstituteClassStudentParamsValidationPipe,
  ],
  exports: [
    InstituteClassStudentService,
    InstituteClassStudentRepository,
  ],
})
export class InstituteClassStudentModule {}
