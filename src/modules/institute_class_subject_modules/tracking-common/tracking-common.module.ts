import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InstituteClassStudentEntity } from '../../institute_class_modules/institute_class_student/entities/institute_class_student.entity';
import { InstituteClassSubjectStudent } from '../institute_class_subject_students/entities/institute_class_subject_student.entity';
import { InstituteClassSubjectPaymentSubmission } from '../../payment/entities/institute-class-subject-payment-submission.entity';
import { TrackingAccessService } from './tracking-access.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      InstituteClassStudentEntity,
      InstituteClassSubjectStudent,
      InstituteClassSubjectPaymentSubmission,
    ]),
  ],
  providers: [TrackingAccessService],
  exports: [TrackingAccessService],
})
export class TrackingCommonModule {}
