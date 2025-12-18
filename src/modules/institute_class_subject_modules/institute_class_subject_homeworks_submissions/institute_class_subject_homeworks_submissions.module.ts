import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InstituteClassSubjectHomeworksSubmissionsService } from './institute_class_subject_homeworks_submissions.service';
import { InstituteClassSubjectHomeworksSubmissionsController } from './institute_class_subject_homeworks_submissions.controller';
import { HomeworkSubmissionController } from './controllers/homework-submission.controller';
import { InstituteClassSubjectHomeworksSubmission } from './entities/institute_class_subject_homeworks_submission.entity';
import { InstituteClassSubjectHomework } from '../institute_class_subject_homeworks/entities/institute_class_subject_homework.entity';
import { AuthModule } from '../../../auth/auth.module';
import { CommonModule } from '../../../common/common.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      InstituteClassSubjectHomeworksSubmission,
      InstituteClassSubjectHomework
    ]),
    AuthModule,
    CommonModule,
  ],
  controllers: [InstituteClassSubjectHomeworksSubmissionsController, HomeworkSubmissionController],
  providers: [InstituteClassSubjectHomeworksSubmissionsService],
  exports: [InstituteClassSubjectHomeworksSubmissionsService],
})
export class InstituteClassSubjectHomeworksSubmissionsModule {}
