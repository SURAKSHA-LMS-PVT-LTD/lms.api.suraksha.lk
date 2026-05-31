import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InstituteClassSubjectLecturesService } from './institute_class_subject_lectures.service';
import { InstituteClassSubjectLecturesController } from './institute_class_subject_lectures.controller';
import { InstituteClassSubjectLecture } from './entities/institute_class_subject_lecture.entity';
import { LectureLiveAttendance } from './entities/lecture_live_attendance.entity';
import { LectureLiveAttendanceSession } from './entities/lecture_live_attendance_session.entity';
import { LectureLiveAttendanceMark } from './entities/lecture_live_attendance_mark.entity';
import { LectureRecordingSession } from './entities/lecture_recording_session.entity';
import { LectureRecordingActivity } from './entities/lecture_recording_activity.entity';
import { LectureTrackingController } from './lecture_tracking.controller';
import { LectureTrackingService } from './lecture_tracking.service';
import { InstituteClassStudentEntity } from '../../institute_class_modules/institute_class_student/entities/institute_class_student.entity';
import { InstituteClassSubjectStudent } from '../institute_class_subject_students/entities/institute_class_subject_student.entity';
import { InstituteClassSubjectPaymentSubmission } from '../../payment/entities/institute-class-subject-payment-submission.entity';
import { UserEntity } from '../../user/entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      InstituteClassSubjectLecture,
      LectureLiveAttendance,
      LectureLiveAttendanceSession,
      LectureLiveAttendanceMark,
      LectureRecordingSession,
      LectureRecordingActivity,
      InstituteClassStudentEntity,
      InstituteClassSubjectStudent,
      InstituteClassSubjectPaymentSubmission,
      UserEntity,
    ]),
  ],
  controllers: [InstituteClassSubjectLecturesController, LectureTrackingController],
  providers: [InstituteClassSubjectLecturesService, LectureTrackingService],
  exports: [InstituteClassSubjectLecturesService, LectureTrackingService],
})
export class InstituteClassSubjectLecturesModule {}
