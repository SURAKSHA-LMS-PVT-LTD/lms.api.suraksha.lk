import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { InstituteClassSubjectHomeworksSubmissionsService } from './institute_class_subject_homeworks_submissions.service';
import { InstituteClassSubjectHomeworksSubmissionsController } from './institute_class_subject_homeworks_submissions.controller';
import { HomeworkSubmissionController } from './controllers/homework-submission.controller';
import { InstituteClassSubjectHomeworksSubmission } from './entities/institute_class_subject_homeworks_submission.entity';
import { InstituteClassSubjectHomework } from '../institute_class_subject_homeworks/entities/institute_class_subject_homework.entity';
import { AuthModule } from '../../../auth/auth.module';
import { CommonModule } from '../../../common/common.module';
import { GoogleAuthModule } from '../../google-auth/google-auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      InstituteClassSubjectHomeworksSubmission,
      InstituteClassSubjectHomework
    ]),
    HttpModule,
    AuthModule,
    CommonModule,
    GoogleAuthModule,
  ],
  controllers: [InstituteClassSubjectHomeworksSubmissionsController, HomeworkSubmissionController],
  providers: [InstituteClassSubjectHomeworksSubmissionsService],
  exports: [InstituteClassSubjectHomeworksSubmissionsService],
})
export class InstituteClassSubjectHomeworksSubmissionsModule {}
