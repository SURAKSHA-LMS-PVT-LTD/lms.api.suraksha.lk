import { IsString, IsNotEmpty, IsOptional, IsArray, IsBoolean, ValidateNested, ArrayNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class SelfEnrollClassDto {
  @ApiProperty({ 
    description: 'Enrollment code for the class (if enrollment is enabled)',
    example: 'CLASS2024A',
    required: false
  })
  @IsOptional()
  @IsString()
  enrollmentCode?: string;

  @ApiProperty({ 
    description: 'Additional information or reason for enrollment (optional)',
    example: 'Transferred from another section',
    required: false
  })
  @IsOptional()
  @IsString()
  enrollmentReason?: string;
}

export class AdminTeacherAssignClassDto {
  @ApiProperty({ 
    description: 'Array of student user IDs to assign to the class',
    type: [String],
    example: ['123', '456', '789']
  })
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  studentUserIds: string[];

  @ApiProperty({ 
    description: 'Skip verification for admin/teacher assignments',
    default: true,
    required: false
  })
  @IsOptional()
  @IsBoolean()
  skipVerification?: boolean = true;

  @ApiProperty({ 
    description: 'Additional notes for the assignment',
    required: false
  })
  @IsOptional()
  @IsString()
  assignmentNotes?: string;
}

export class StudentVerificationDto {
  @ApiProperty({ 
    description: 'Student user ID to verify',
    example: '123'
  })
  @IsString()
  @IsNotEmpty()
  studentUserId: string;

  @ApiProperty({ 
    description: 'Whether to approve (true) or reject (false) the enrollment',
    example: true
  })
  @IsBoolean()
  approve: boolean;

  @ApiProperty({ 
    description: 'Optional notes for the verification decision',
    example: 'Valid enrollment',
    required: false
  })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class BulkVerifyStudentsDto {
  @ApiProperty({ 
    description: 'Array of verification decisions',
    type: [StudentVerificationDto],
    example: [
      { studentUserId: '123', approve: true, notes: 'Valid enrollment' },
      { studentUserId: '456', approve: false, notes: 'Missing documents' }
    ]
  })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => StudentVerificationDto)
  verifications: StudentVerificationDto[];
}

export class ClassEnrollmentSettingsDto {
  @ApiProperty({ 
    description: 'Enable or disable self-enrollment for the class',
    example: true
  })
  enrollmentEnabled: boolean;

  @ApiProperty({ 
    description: 'Enrollment code for students to use for self-enrollment',
    example: 'CLASS2024A',
    required: false
  })
  @IsOptional()
  @IsString()
  enrollmentCode?: string;

  @ApiProperty({ 
    description: 'Require teacher verification for self-enrollments',
    default: true
  })
  requireTeacherVerification?: boolean = true;
}
