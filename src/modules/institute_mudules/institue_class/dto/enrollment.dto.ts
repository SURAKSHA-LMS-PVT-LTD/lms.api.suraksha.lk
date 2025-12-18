import { IsString, IsNotEmpty, IsBoolean, IsOptional, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class EnableSelfEnrollmentDto {
  @ApiProperty({
    description: 'Unique enrollment code for students to join the class',
    example: 'MATH2025ABC'
  })
  @IsString()
  @IsNotEmpty()
  enrollmentCode: string;

  @ApiPropertyOptional({
    description: 'Whether teacher verification is required for self-enrolled students',
    default: true
  })
  @IsOptional()
  @IsBoolean()
  requireTeacherVerification?: boolean;
}

export class DisableSelfEnrollmentDto {
  @ApiPropertyOptional({
    description: 'Whether to keep existing self-enrolled students',
    default: true
  })
  @IsOptional()
  @IsBoolean()
  keepExistingStudents?: boolean;
}

export class ClassSelfEnrollDto {
  @ApiProperty({
    description: 'Class ID to enroll in',
    example: '40'
  })
  @IsString()
  @IsNotEmpty()
  classId: string;

  @ApiProperty({
    description: 'Enrollment code provided by the teacher',
    example: 'MATH2025ABC'
  })
  @IsString()
  @IsNotEmpty()
  enrollmentCode: string;
}

export class VerifyStudentDto {
  @ApiProperty({
    description: 'Student User ID to verify',
    example: '123456789'
  })
  @IsString()
  @IsNotEmpty()
  studentUserId: string;

  @ApiProperty({
    description: 'Whether to verify (true) or reject (false) the student',
    example: true
  })
  @IsBoolean()
  approve: boolean;
}
