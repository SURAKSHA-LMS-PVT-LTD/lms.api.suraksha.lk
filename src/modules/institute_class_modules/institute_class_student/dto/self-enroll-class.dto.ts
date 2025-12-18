import { IsString, IsNotEmpty, IsOptional, IsArray, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

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

export class BulkVerifyStudentsDto {
  @ApiProperty({ 
    description: 'Array of verification decisions',
    example: [
      { studentUserId: '123', approve: true, notes: 'Valid enrollment' },
      { studentUserId: '456', approve: false, notes: 'Missing documents' }
    ]
  })
  verifications: Array<{
    studentUserId: string;
    approve: boolean;
    notes?: string;
  }>;
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
