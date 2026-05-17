import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InstituteClassStudentEntity } from '../../institute_class_modules/institute_class_student/entities/institute_class_student.entity';
import { InstituteClassSubjectStudent } from '../institute_class_subject_students/entities/institute_class_subject_student.entity';
import { InstituteClassSubjectPaymentSubmission } from '../../payment/entities/institute-class-subject-payment-submission.entity';

@Injectable()
export class TrackingAccessService {
  constructor(
    @InjectRepository(InstituteClassStudentEntity)
    private readonly classStudentRepo: Repository<InstituteClassStudentEntity>,
    @InjectRepository(InstituteClassSubjectStudent)
    private readonly subjectStudentRepo: Repository<InstituteClassSubjectStudent>,
    @InjectRepository(InstituteClassSubjectPaymentSubmission)
    private readonly paymentSubmissionRepo: Repository<InstituteClassSubjectPaymentSubmission>,
  ) {}

  async checkEnrollment(
    userId: string,
    instituteId: string,
    classId?: string,
    subjectId?: string,
  ): Promise<boolean> {
    if (!classId) return false;
    if (subjectId) {
      const verified = await this.subjectStudentRepo.findOne({
        where: { instituteId, classId, subjectId, studentId: userId, isActive: true, verificationStatus: 'verified' as any },
      });
      if (verified) return true;
      const free = await this.subjectStudentRepo.findOne({
        where: { instituteId, classId, subjectId, studentId: userId, isActive: true, verificationStatus: 'enrolled_free_card' as any },
      });
      return !!free;
    }
    const row = await this.classStudentRepo.findOne({
      where: { instituteId, classId, studentUserId: userId, isActive: true, isVerified: true },
    });
    return !!row;
  }

  async checkPaymentAccess(
    userId: string,
    instituteId: string,
    classId: string | undefined,
    subjectId: string | undefined,
    paymentId: string,
    allowedStatuses: string[],
  ): Promise<boolean> {
    if (allowedStatuses.includes('FREE_CARD') && classId) {
      const repo = subjectId ? this.subjectStudentRepo : this.classStudentRepo;
      const where: any = subjectId
        ? { instituteId, classId, subjectId, studentId: userId, isActive: true, studentType: 'free_card' }
        : { instituteId, classId, studentUserId: userId, isActive: true, studentType: 'free_card' };
      if (await (repo as any).findOne({ where })) return true;
    }
    const submission = await this.paymentSubmissionRepo.findOne({ where: { paymentId, userId } });
    if (!submission) return false;
    const status = (submission as any).status?.toUpperCase?.() ?? '';
    return allowedStatuses.some(s => s.toUpperCase() === status);
  }

  async determineUserType(
    userId: string | undefined,
    instituteId: string,
    classId?: string,
    subjectId?: string,
  ): Promise<'enrolled' | 'suraksha_user' | 'guest'> {
    if (!userId) return 'guest';
    const enrolled = await this.checkEnrollment(userId, instituteId, classId, subjectId);
    return enrolled ? 'enrolled' : 'suraksha_user';
  }
}
