import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InstituteClassSubjectStudentsService } from './institute_class_subject_students.service';
import { InstituteClassSubjectStudentsController } from './institute_class_subject_students.controller';
import { InstituteClassSubjectStudent } from './entities/institute_class_subject_student.entity';
import { StudentEntity } from '../../student/entities/student.entity';
import { ParentEntity } from '../../parent/entities/parent.entity';
import { UserEntity } from '../../user/entities/user.entity';
import { SubjectEntity } from '../../subject/entities/subject.entity';
import { InstituteClassSubjectEntity } from '../../institute_class_modules/institute_class_subject/entities/institute_class_subject.entity';
import { InstituteClassStudentEntity } from '../../institute_class_modules/institute_class_student/entities/institute_class_student.entity';
import { InstituteClassSubjectPayment } from '../../payment/entities/institute-class-subject-payment.entity';
import { InstituteClassSubjectPaymentSubmission } from '../../payment/entities/institute-class-subject-payment-submission.entity';
import { InstituteClassPayment } from '../../payment/entities/institute-class-payment.entity';
import { InstituteClassPaymentSubmission } from '../../payment/entities/institute-class-payment-submission.entity';
import { CacheModule } from '../../../common/modules/cache.module';
import { CloudStorageService } from '../../../common/services/cloud-storage.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      InstituteClassSubjectStudent,
      StudentEntity,
      ParentEntity,
      UserEntity,
      SubjectEntity,
      InstituteClassSubjectEntity,
      InstituteClassStudentEntity,
      InstituteClassSubjectPayment,
      InstituteClassSubjectPaymentSubmission,
      InstituteClassPayment,
      InstituteClassPaymentSubmission,
    ]),
    CacheModule
  ],
  controllers: [InstituteClassSubjectStudentsController],
  providers: [InstituteClassSubjectStudentsService, CloudStorageService],
  exports: [InstituteClassSubjectStudentsService],
})
export class InstituteClassSubjectStudentsModule {}
