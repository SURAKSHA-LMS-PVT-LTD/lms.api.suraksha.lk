import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ParentsService } from './parent.service';
import { ParentsController } from './parent.controller';
import { ParentAccessController } from './controllers/parent-access.controller';
import { ParentEntity } from './entities/parent.entity';
import { UserEntity } from '../user/entities/user.entity';
import { StudentEntity } from '../student/entities/student.entity';
import { UsersModule } from '../user/user.module';
import { ParentRepository } from './repositories/parent.repository';
import {
  ParentValidationPipe,
  ParentEmailValidationPipe,
  ParentPhoneValidationPipe,
  ParentQueryValidationPipe,
  ParentBulkValidationPipe,
  ParentOccupationValidationPipe,
  ParentEducationValidationPipe,
  ParentGenderValidationPipe,
} from './pipes/parent-validation.pipe';

// Import external modules for parent access integration
import { InstituteClassStudentModule } from '../institute_class_modules/institute_class_student/institute_class_student.module';
import { InstituteClassSubjectStudentsModule } from '../institute_class_subject_modules/institute_class_subject_students/institute_class_subject_students.module';
import { InstituteModule } from '../institute/institute.module';
import { CacheModule } from '../../common/modules/cache.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ParentEntity, UserEntity, StudentEntity]),
    CacheModule,
    UsersModule,
    // Import modules for parent access integration
    InstituteClassStudentModule,
    InstituteClassSubjectStudentsModule,
    InstituteModule, // For institute details access
  ],
  controllers: [
    ParentsController,
    ParentAccessController, // JWT v2-based parent access controller
  ],
  providers: [
    ParentsService,
    ParentRepository,
    // Validation Pipes
    ParentValidationPipe,
    ParentEmailValidationPipe,
    ParentPhoneValidationPipe,
    ParentQueryValidationPipe,
    ParentBulkValidationPipe,
    ParentOccupationValidationPipe,
    ParentEducationValidationPipe,
    ParentGenderValidationPipe,
  ],
  exports: [
    ParentsService,
    ParentRepository,
  ],
})
export class ParentModule {}

