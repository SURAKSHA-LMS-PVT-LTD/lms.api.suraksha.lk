import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InstituteClassSubjectResaultsService } from './institute_class_subject_resaults.service';
import { InstituteClassSubjectResaultsController } from './institute_class_subject_resaults.controller';
import { InstituteClassSubjectResault } from './entities/institute_class_subject_resault.entity';
import { SubjectEntity } from '../../subject/entities/subject.entity';
import { InstituteEntity } from '../../institute/entities/institute.entity';
import { InstituteClassEntity } from '../../institute_mudules/institue_class/entities/institue_class.entity';
import { InstituteClassExamEntity } from '../../institute_class_exams/entities/institute-class-exam.entity';
import { UserEntity } from '../../user/entities/user.entity';
import { CommonModule } from '../../../common/common.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      InstituteClassSubjectResault,
      SubjectEntity,
      InstituteEntity,
      InstituteClassEntity,
      InstituteClassExamEntity,
      UserEntity,
    ]),
    CommonModule,
  ],
  controllers: [
    InstituteClassSubjectResaultsController,
  ],
  providers: [
    InstituteClassSubjectResaultsService,
  ],
  exports: [
    InstituteClassSubjectResaultsService,
  ],
})
export class InstituteClassSubjectResaultsModule {}
