import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { InstituteClassSubjectHomeworksService } from './institute_class_subject_homeworks.service';
import { InstituteClassSubjectHomeworksController } from './institute_class_subject_homeworks.controller';
import { InstituteClassSubjectHomework } from './entities/institute_class_subject_homework.entity';
import { InstituteClassSubjectHomeworkReference } from './entities/institute_class_subject_homework_reference.entity';
import { InstituteClassSubjectHomeworksSubmission } from '../institute_class_subject_homeworks_submissions/entities/institute_class_subject_homeworks_submission.entity';
import { HomeworkReferenceService } from './services/homework-reference.service';
import { HomeworkReferenceController } from './controllers/homework-reference.controller';
import { CloudStorageService } from '../../../common/services/cloud-storage.service';
import { GoogleAuthService } from '../../google-auth/google-auth.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      InstituteClassSubjectHomework,
      InstituteClassSubjectHomeworkReference,
      InstituteClassSubjectHomeworksSubmission,
    ]),
    HttpModule,
  ],
  controllers: [
    InstituteClassSubjectHomeworksController,
    HomeworkReferenceController,
  ],
  providers: [
    InstituteClassSubjectHomeworksService,
    HomeworkReferenceService,
    CloudStorageService,
    GoogleAuthService,
  ],
  exports: [
    InstituteClassSubjectHomeworksService,
    HomeworkReferenceService,
  ],
})
export class InstituteClassSubjectHomeworksModule {}
