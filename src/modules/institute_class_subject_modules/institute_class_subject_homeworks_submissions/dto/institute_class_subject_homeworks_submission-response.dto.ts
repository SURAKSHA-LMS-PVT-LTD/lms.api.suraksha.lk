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

  // Google Drive submission fields (student)
  @ApiProperty({ description: 'Submission type', example: 'UPLOAD', enum: ['UPLOAD', 'GOOGLE_DRIVE'], required: false })
  submissionType?: string;

  @ApiProperty({ description: 'Drive file ID (student submission)', required: false })
  driveFileId?: string;

  @ApiProperty({ description: 'Drive file name (student submission)', required: false })
  driveFileName?: string;

  @ApiProperty({ description: 'Drive MIME type (student submission)', required: false })
  driveMimeType?: string;

  @ApiProperty({ description: 'Drive file size in bytes (student submission)', required: false })
  driveFileSize?: number;

  @ApiProperty({ description: 'Drive view URL (student submission)', required: false })
  driveViewUrl?: string;

  // Google Drive correction fields (teacher)
  @ApiProperty({ description: 'Correction type', example: 'UPLOAD', enum: ['UPLOAD', 'GOOGLE_DRIVE'], required: false })
  correctionType?: string;

  @ApiProperty({ description: 'Drive file ID (teacher correction)', required: false })
  correctionDriveFileId?: string;

  @ApiProperty({ description: 'Drive file name (teacher correction)', required: false })
  correctionDriveFileName?: string;

  @ApiProperty({ description: 'Drive MIME type (teacher correction)', required: false })
  correctionDriveMimeType?: string;

  @ApiProperty({ description: 'Drive file size in bytes (teacher correction)', required: false })
  correctionDriveFileSize?: number;

  @ApiProperty({ description: 'Drive view URL (teacher correction)', required: false })
  correctionDriveViewUrl?: string;

  @ApiProperty({ description: 'Active status', example: true })
  isActive: boolean;

  @ApiProperty({ description: 'Creation date', example: '2024-01-15T10:00:00Z' })
  createdAt?: Date;

  @ApiProperty({ description: 'Last update date', example: '2024-01-15T10:00:00Z' })
  updatedAt?: Date;

  /**
   * Resolve a stored file path to an accessible URL.
   * - Relative paths (e.g. "homework-files/abc.jpg") → GCS/S3 signed URL (1 hour)
   * - Full https:// URLs (e.g. Google Drive links) → returned unchanged
   * - Empty / null → empty string
   */
  private static async resolveFileUrl(
    url: string | null | undefined,
    cloudStorageService: CloudStorageService,
    expiresIn = 3600,
  ): Promise<string> {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    return cloudStorageService.getSignedUrl(url, expiresIn);
  }

  static async fromEntity(entity: InstituteClassSubjectHomeworksSubmission, cloudStorageService?: CloudStorageService): Promise<InstituteClassSubjectHomeworksSubmissionResponseDto> {
    const dto = new InstituteClassSubjectHomeworksSubmissionResponseDto();
    dto.id = entity.id;
    dto.homeworkId = entity.homeworkId;
    dto.studentId = entity.studentId;
    dto.submissionDate = entity.submissionDate;
    
    // ✅ Generate signed URL for private storage files; pass Drive URLs through unchanged
    if (cloudStorageService) {
      dto.fileUrl = await InstituteClassSubjectHomeworksSubmissionResponseDto.resolveFileUrl(entity.fileUrl, cloudStorageService);
      dto.teacherCorrectionFileUrl = await InstituteClassSubjectHomeworksSubmissionResponseDto.resolveFileUrl(entity.teacherCorrectionFileUrl, cloudStorageService);
    } else {
      dto.fileUrl = entity.fileUrl;
      dto.teacherCorrectionFileUrl = entity.teacherCorrectionFileUrl;
    }
    
    dto.remarks = entity.remarks;
    dto.isActive = entity.isActive;
    dto.createdAt = entity.createdAt;
    dto.updatedAt = entity.updatedAt;

    // Student Drive submission fields
    dto.submissionType = entity.submissionType || null;
    dto.driveFileId = entity.driveFileId || null;
    dto.driveFileName = entity.driveFileName || null;
    dto.driveMimeType = entity.driveMimeType || null;
    dto.driveFileSize = entity.driveFileSize || null;
    if (entity.driveFileId) {
      dto.driveViewUrl = `https://drive.google.com/file/d/${entity.driveFileId}/view`;
    }

    // Teacher Drive correction fields
    dto.correctionType = entity.correctionType || null;
    dto.correctionDriveFileId = entity.correctionDriveFileId || null;
    dto.correctionDriveFileName = entity.correctionDriveFileName || null;
    dto.correctionDriveMimeType = entity.correctionDriveMimeType || null;
    dto.correctionDriveFileSize = entity.correctionDriveFileSize || null;
    if (entity.correctionDriveFileId) {
      dto.correctionDriveViewUrl = `https://drive.google.com/file/d/${entity.correctionDriveFileId}/view`;
    }
    
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
