import { ApiProperty } from '@nestjs/swagger';
import { InstituteClassSubjectHomeworksSubmission } from '../entities/institute_class_subject_homeworks_submission.entity';
import { CloudStorageService } from '../../../../common/services/cloud-storage.service';

export class InstituteClassSubjectHomeworksSubmissionResponseDto {
  @ApiProperty({ description: 'Submission ID', example: '1' })
  id: string;

  @ApiProperty({ description: 'Homework ID', example: '1' })
  homeworkId: string;

  @ApiProperty({ description: 'Homework details', required: false })
  homework?: any;

  @ApiProperty({ description: 'Student ID', example: '1' })
  studentId: string;

  @ApiProperty({ description: 'Student name', example: 'John Doe', required: false })
  studentName?: string;

  @ApiProperty({ description: 'Student email', example: 'john@example.com', required: false })
  studentEmail?: string;

  @ApiProperty({ description: 'Student image URL', example: 'https://mysurakshabucket.s3.us-east-1.amazonaws.com/users/profile.jpg', required: false })
  studentImageUrl?: string;

  @ApiProperty({ description: 'Submission date', example: '2024-01-15' })
  submissionDate?: Date;

  @ApiProperty({ description: 'File URL', example: 'https://mysurakshabucket.s3.us-east-1.amazonaws.com/homework/file.pdf' })
  fileUrl?: string;

  @ApiProperty({ description: 'Teacher correction file URL', example: 'https://mysurakshabucket.s3.us-east-1.amazonaws.com/homework/correction.pdf' })
  teacherCorrectionFileUrl?: string;

  @ApiProperty({ description: 'Teacher remarks', example: 'Good work, but needs improvement in question 3' })
  remarks?: string;

  @ApiProperty({ description: 'Active status', example: true })
  isActive: boolean;

  @ApiProperty({ description: 'Creation date', example: '2024-01-15T10:00:00Z' })
  createdAt?: Date;

  @ApiProperty({ description: 'Last update date', example: '2024-01-15T10:00:00Z' })
  updatedAt?: Date;

  static fromEntity(entity: InstituteClassSubjectHomeworksSubmission, cloudStorageService?: CloudStorageService): InstituteClassSubjectHomeworksSubmissionResponseDto {
    const dto = new InstituteClassSubjectHomeworksSubmissionResponseDto();
    dto.id = entity.id;
    dto.homeworkId = entity.homeworkId;
    dto.studentId = entity.studentId;
    dto.submissionDate = entity.submissionDate;
    
    // ✅ Transform relative URLs to full URLs using CloudStorageService
    if (cloudStorageService) {
      dto.fileUrl = entity.fileUrl ? cloudStorageService.getFullUrl(entity.fileUrl) : '';
      dto.teacherCorrectionFileUrl = entity.teacherCorrectionFileUrl ? cloudStorageService.getFullUrl(entity.teacherCorrectionFileUrl) : '';
    } else {
      dto.fileUrl = entity.fileUrl;
      dto.teacherCorrectionFileUrl = entity.teacherCorrectionFileUrl;
    }
    
    dto.remarks = entity.remarks;
    dto.isActive = entity.isActive;
    dto.createdAt = entity.createdAt;
    dto.updatedAt = entity.updatedAt;
    
    // Include full homework details but other relations as IDs only
    if (entity.homework) {
      dto.homework = entity.homework;
    }
    
    // ✅ Include student details from LEFT JOIN
    if (entity.student) {
      const firstName = entity.student.firstName || '';
      const lastName = entity.student.lastName || '';
      dto.studentName = `${firstName} ${lastName}`.trim() || null;
      dto.studentEmail = entity.student.email || null;
      
      // Transform imageUrl if it exists
      if (entity.student.imageUrl) {
        dto.studentImageUrl = cloudStorageService 
          ? cloudStorageService.getFullUrl(entity.student.imageUrl) 
          : entity.student.imageUrl;
      } else {
        dto.studentImageUrl = null;
      }
    } else {
      dto.studentName = null;
      dto.studentEmail = null;
      dto.studentImageUrl = null;
    }
    
    return dto;
  }
}
