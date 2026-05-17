import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { SubjectRecording } from './entities/subject_recording.entity';
import { SubjectRecordingSession } from './entities/subject_recording_session.entity';
import { SubjectRecordingActivity } from './entities/subject_recording_activity.entity';

import { InstituteClassStudentEntity } from '../../institute_class_modules/institute_class_student/entities/institute_class_student.entity';
import { InstituteClassSubjectStudent } from '../institute_class_subject_students/entities/institute_class_subject_student.entity';
import { InstituteClassSubjectPaymentSubmission } from '../../payment/entities/institute-class-subject-payment-submission.entity';

import { SubjectRecordingsService } from './services/subject-recordings.service';
import { SubjectRecordingTrackingService } from './services/subject-recording-tracking.service';
import { SubjectRecordingsController } from './subject_recordings.controller';
import { SubjectRecordingTrackingController } from './subject_recording_tracking.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SubjectRecording,
      SubjectRecordingSession,
      SubjectRecordingActivity,
      InstituteClassStudentEntity,
      InstituteClassSubjectStudent,
      InstituteClassSubjectPaymentSubmission,
    ]),
  ],
  controllers: [
    SubjectRecordingsController,
    SubjectRecordingTrackingController,
  ],
  providers: [
    SubjectRecordingsService,
    SubjectRecordingTrackingService,
  ],
  exports: [
    SubjectRecordingsService,
    SubjectRecordingTrackingService,
  ],
})
export class SubjectRecordingsModule {}
