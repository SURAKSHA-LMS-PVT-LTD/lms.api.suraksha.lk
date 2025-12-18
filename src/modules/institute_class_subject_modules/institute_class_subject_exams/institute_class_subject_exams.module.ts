import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InstituteClassSubjectExamsService } from './institute_class_subject_exams.service';
import { InstituteClassSubjectExamsController } from './institute_class_subject_exams.controller';
import { InstituteClassSubjectExam } from './entities/institute_class_subject_exam.entity';
import { ExamRepository } from './repositories/exam.repository';
import { InstituteUserEntity } from '../../institute_mudules/institue_user/entities/institue_user.entity';
import { InstitueUserModule } from '../../institute_mudules/institue_user/institue_user.module';
import { UserEntity } from '../../user/entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      InstituteClassSubjectExam,
      InstituteUserEntity,
      UserEntity,
    ]),
    InstitueUserModule,
  ],
  controllers: [InstituteClassSubjectExamsController],
  providers: [
    InstituteClassSubjectExamsService,
    ExamRepository,
  ],
  exports: [
    InstituteClassSubjectExamsService,
    ExamRepository,
  ],
})
export class InstituteClassSubjectExamsModule {}
