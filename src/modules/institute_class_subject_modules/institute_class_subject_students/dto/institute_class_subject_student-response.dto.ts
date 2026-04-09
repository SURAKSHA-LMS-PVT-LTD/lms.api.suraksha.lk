import { ApiProperty } from '@nestjs/swagger';
import { InstituteClassSubjectStudent } from '../entities/institute_class_subject_student.entity';
import { UserSummaryResponseDto } from '../../../user/dto/secure-user-response.dto';

export class InstituteClassSubjectStudentResponseDto {
  @ApiProperty({ description: 'Institute ID', example: '1' })
  instituteId: string;

  @ApiProperty({ description: 'Class ID', example: '1' })
  classId: string;

  @ApiProperty({ description: 'Subject ID', example: '1' })
  subjectId: string;

  @ApiProperty({ description: 'Student ID', example: '1' })
  studentId: string;

  @ApiProperty({ description: 'Student basic info (no sensitive data)', required: false })
  student?: UserSummaryResponseDto;

  @ApiProperty({ description: 'Active status', example: true })
  isActive: boolean;

  @ApiProperty({ description: 'How the student was enrolled', example: 'teacher_assigned' })
  enrollmentMethod: 'teacher_assigned' | 'self_enrolled';

  @ApiProperty({ description: 'ID of the user who enrolled the student', example: '123', required: false })
  enrolledBy?: string;

  @ApiProperty({ description: 'Verification status', example: 'verified', enum: ['verified', 'pending', 'rejected', 'pending_payment', 'payment_rejected', 'enrolled_free_card'] })
  verificationStatus: 'verified' | 'pending' | 'rejected' | 'pending_payment' | 'payment_rejected' | 'enrolled_free_card';

  @ApiProperty({ description: 'ID of user who verified/rejected', example: '100', required: false })
  verifiedBy?: string;

  @ApiProperty({ description: 'Verification timestamp', required: false })
  verifiedAt?: Date;

  @ApiProperty({ description: 'Reason for rejection', required: false })
  rejectionReason?: string;

  @ApiProperty({ description: 'Student type', example: 'normal', enum: ['normal', 'paid', 'free_card', 'half_paid', 'quarter_paid'] })
  studentType: 'normal' | 'paid' | 'free_card' | 'half_paid' | 'quarter_paid';

  @ApiProperty({ description: 'Custom key-value data for this subject enrollment. Plain JSON, not encrypted.', required: false })
  extraData?: Record<string, any>;

  @ApiProperty({ description: 'Creation date', example: '2024-01-15T10:00:00Z' })
  createdAt: Date;

  @ApiProperty({ description: 'Last update date', example: '2024-01-15T10:00:00Z' })
  updatedAt: Date;

  static fromEntity(entity: InstituteClassSubjectStudent): InstituteClassSubjectStudentResponseDto {
    const dto = new InstituteClassSubjectStudentResponseDto();
    dto.instituteId = entity.instituteId;
    dto.classId = entity.classId;
    dto.subjectId = entity.subjectId;
    dto.studentId = entity.studentId;
    dto.isActive = entity.isActive;
    dto.enrollmentMethod = entity.enrollmentMethod;
    dto.enrolledBy = entity.enrolledBy;
    dto.verificationStatus = entity.verificationStatus;
    dto.verifiedBy = entity.verifiedBy;
    dto.verifiedAt = entity.verifiedAt;
    dto.rejectionReason = entity.rejectionReason;
    dto.studentType = entity.studentType;
    dto.extraData = entity.extraData;
    dto.createdAt = entity.createdAt;
    dto.updatedAt = entity.updatedAt;
    
    // Include only basic student info without sensitive data
    if (entity.student) {
      dto.student = new UserSummaryResponseDto({
        id: entity.student.id,
        firstName: entity.student.firstName,
        lastName: entity.student.lastName,
        nameWithInitials: entity.student.nameWithInitials,
        email: entity.student.email,
        phoneNumber: entity.student.phoneNumber,
        userType: entity.student.userType,
        imageUrl: entity.student.imageUrl
      });
    }
    
    return dto;
  }
}
