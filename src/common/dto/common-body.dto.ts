import { IsString, IsNotEmpty, IsOptional, IsEmail, IsArray, IsNumber, Min, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Common reusable Body DTOs to replace inline @Body() types across controllers.
 */

export class ImageUrlDto {
  @ApiProperty({ description: 'URL of the uploaded image' })
  @IsString()
  @IsNotEmpty()
  imageUrl: string;
}

export class EmailDto {
  @ApiProperty({ description: 'Email address' })
  @IsEmail()
  @IsNotEmpty()
  email: string;
}

export class EmailOtpVerifyDto {
  @ApiProperty({ description: 'Email address' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ description: 'OTP code' })
  @IsString()
  @IsNotEmpty()
  otpCode: string;
}

export class PhoneNumberDto {
  @ApiProperty({ description: 'Phone number' })
  @IsString()
  @IsNotEmpty()
  phoneNumber: string;
}

export class PhoneOtpVerifyDto {
  @ApiProperty({ description: 'Phone number' })
  @IsString()
  @IsNotEmpty()
  phoneNumber: string;

  @ApiProperty({ description: 'OTP code' })
  @IsString()
  @IsNotEmpty()
  otpCode: string;
}

export class TeacherIdDto {
  @ApiProperty({ description: 'Teacher user ID' })
  @IsString()
  @IsNotEmpty()
  teacherId: string;
}

export class RejectReasonDto {
  @ApiPropertyOptional({ description: 'Reason for rejection' })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class FileUploadRequestDto {
  @ApiProperty({ description: 'Name of the file' })
  @IsString()
  @IsNotEmpty()
  fileName: string;

  @ApiProperty({ description: 'MIME type of the file' })
  @IsString()
  @IsNotEmpty()
  contentType: string;

  @ApiPropertyOptional({ description: 'File size in bytes' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  fileSize?: number;
}

export class StudentUserIdsDto {
  @ApiProperty({ description: 'Array of student user IDs', type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  studentUserIds: string[];
}

export class NotificationIdsDto {
  @ApiProperty({ description: 'Array of notification IDs', type: [String] })
  @IsArray()
  @IsString({ each: true })
  notificationIds: string[];
}
