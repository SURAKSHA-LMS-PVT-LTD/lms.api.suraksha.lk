import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum, IsNotEmpty, MaxLength } from 'class-validator';

/**
 * Valid file purposes for personal-Drive uploads.
 *
 * ⚠️  LECTURE_DOCUMENT must NOT be used for institute content.
 *     Lecture documents stored in a teacher's personal Google Drive will
 *     disappear if that teacher is removed or revokes Drive access.
 *     Use the institute-owned cloud-storage endpoints instead:
 *       POST /api/structured-lectures/upload/document/signed-url
 *       POST /api/structured-lectures/upload/document/verify
 */
export enum DriveUploadPurpose {
  HOMEWORK_SUBMISSION = 'HOMEWORK_SUBMISSION',
  HOMEWORK_REFERENCE = 'HOMEWORK_REFERENCE',
  HOMEWORK_CORRECTION = 'HOMEWORK_CORRECTION',
  EXAM_SUBMISSION = 'EXAM_SUBMISSION',
  PROFILE_DOCUMENT = 'PROFILE_DOCUMENT',
  ID_CARD_PAYMENT = 'ID_CARD_PAYMENT',
  /**
   * @deprecated Use POST /api/structured-lectures/upload/document/signed-url instead.
   * Storing lecture documents in a personal Drive causes data loss when the user is removed.
   */
  LECTURE_DOCUMENT = 'LECTURE_DOCUMENT',
  GENERAL = 'GENERAL',
}

/**
 * DTO to register a file that was uploaded directly to Google Drive by the frontend.
 * 
 * FLOW:
 * 1. Frontend got access token from GET /drive-access/token
 * 2. Frontend uploaded file directly to Google Drive (fetch / gapi / XMLHttpRequest)
 * 3. Google returned the file ID
 * 4. Frontend sends this DTO to POST /drive-access/files/register
 * 5. Backend verifies file exists on Drive, stores metadata
 */
export class RegisterDriveFileDto {
  @ApiProperty({
    description: 'Google Drive file ID returned after direct upload',
    example: '1abc123def456ghi789',
  })
  @IsString()
  @IsNotEmpty()
  driveFileId: string;

  @ApiProperty({
    description: 'Purpose of the file upload',
    enum: DriveUploadPurpose,
    example: DriveUploadPurpose.HOMEWORK_SUBMISSION,
  })
  @IsEnum(DriveUploadPurpose)
  @IsNotEmpty()
  purpose: DriveUploadPurpose;

  @ApiPropertyOptional({
    description: 'Reference type (e.g., homework_submission, homework_reference, exam)',
    example: 'homework_submission',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  referenceType?: string;

  @ApiPropertyOptional({
    description: 'Reference ID (e.g., homework ID)',
    example: '42',
  })
  @IsOptional()
  @IsString()
  referenceId?: string;

  @ApiPropertyOptional({
    description: 'Comma-separated email addresses to share the file with (read-only access)',
    example: 'teacher@gmail.com,parent@gmail.com',
  })
  @IsOptional()
  @IsString()
  shareWithEmails?: string;
}

/**
 * Response DTO for a registered file.
 */
export class DriveFileRegisteredResponseDto {
  @ApiProperty({ description: 'Internal file record ID', example: '123' })
  id: string;

  @ApiProperty({ description: 'Google Drive file ID', example: '1abc123def456ghi789' })
  driveFileId: string;

  @ApiProperty({ description: 'File name (from Google Drive)', example: 'homework_math_ch5.pdf' })
  fileName: string;

  @ApiProperty({ description: 'MIME type', example: 'application/pdf' })
  mimeType: string;

  @ApiPropertyOptional({ description: 'File size in bytes', example: 1048576 })
  fileSize?: number;

  @ApiProperty({ description: 'Google Drive view URL' })
  viewUrl: string;

  @ApiPropertyOptional({ description: 'Google Drive embed URL for preview' })
  embedUrl?: string;

  @ApiProperty({ description: 'Upload purpose', example: 'HOMEWORK_SUBMISSION' })
  purpose: string;

  @ApiPropertyOptional({ description: 'Sharing permissions applied' })
  sharingApplied?: Array<{ email: string; role: string }>;

  static fromEntity(entity: any): DriveFileRegisteredResponseDto {
    return {
      id: entity.id,
      driveFileId: entity.driveFileId,
      fileName: entity.fileName,
      mimeType: entity.mimeType,
      fileSize: entity.fileSize,
      viewUrl: `https://drive.google.com/file/d/${entity.driveFileId}/view`,
      embedUrl: `https://drive.google.com/file/d/${entity.driveFileId}/preview`,
      purpose: entity.purpose,
      sharingApplied: entity.getParsedPermissions?.() ?? [],
    };
  }
}
