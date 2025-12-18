

// src/students/dto/student-response.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserResponseDto } from '../../user/dto/user-response.dto';
import { ParentResponseDto } from '../../parent/dto/parent-response.dto';

export class StudentResponseDto {
  @ApiProperty({ description: 'User ID (same as student primary key)' })
  userId: string;

  @ApiPropertyOptional({ description: 'Father ID' })
  fatherId?: string;

  @ApiPropertyOptional({ description: 'Mother ID' })
  motherId?: string;

  @ApiPropertyOptional({ description: 'Guardian ID' })
  guardianId?: string;

  @ApiPropertyOptional({ description: 'Student ID number' })
  studentId?: string;

  @ApiPropertyOptional({ description: 'Emergency contact number' })
  emergencyContact?: string;

  @ApiPropertyOptional({ description: 'Medical conditions' })
  medicalConditions?: string;

  @ApiPropertyOptional({ description: 'Allergies' })
  allergies?: string;

  @ApiPropertyOptional({ description: 'Blood group' })
  bloodGroup?: string;

  @ApiProperty({ description: 'Active status' })
  isActive: boolean;

  @ApiProperty({ description: 'Creation timestamp' })
  createdAt: Date;

  @ApiProperty({ description: 'Last update timestamp' })
  updatedAt: Date;

  // Relations
  @ApiProperty({ description: 'User information', type: UserResponseDto })
  user: UserResponseDto;

  @ApiPropertyOptional({ description: 'Father information', type: ParentResponseDto })
  father?: ParentResponseDto;

  @ApiPropertyOptional({ description: 'Mother information', type: ParentResponseDto })
  mother?: ParentResponseDto;

  @ApiPropertyOptional({ description: 'Guardian information', type: ParentResponseDto })
  guardian?: ParentResponseDto;

  constructor(partial: Partial<StudentResponseDto>) {
    Object.assign(this, partial);
  }
}

