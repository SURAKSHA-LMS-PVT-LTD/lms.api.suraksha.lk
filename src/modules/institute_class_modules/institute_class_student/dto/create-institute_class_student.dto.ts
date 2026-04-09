import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateInstituteClassStudentDto {
  @ApiProperty({ description: 'Institute ID' })
  @IsString()
  @IsNotEmpty()
  instituteId: string;

  @ApiProperty({ description: 'Class ID' })
  @IsString()
  @IsNotEmpty()
  classId: string;

  @ApiProperty({ description: 'Student User ID' })
  @IsString()
  @IsNotEmpty()
  studentUserId: string;

  @ApiProperty({ description: 'Is the student assignment active', default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'Custom key-value data for this class enrollment (e.g. phone, notes). Stored as plain JSON — visible to admins, not encrypted.',
    example: { phoneNumber: '0771234567', notes: 'Joined mid-term' }
  })
  @IsOptional()
  @IsObject()
  extraData?: Record<string, any>;
}

export class BulkCreateInstituteClassStudentDto {
  @ApiProperty({ description: 'Institute ID' })
  @IsString()
  @IsNotEmpty()
  instituteId: string;

  @ApiProperty({ description: 'Class ID' })
  @IsString()
  @IsNotEmpty()
  classId: string;

  @ApiProperty({ description: 'Array of Student User IDs', type: [String] })
  @IsString({ each: true })
  @IsNotEmpty()
  studentUserIds: string[];

  @ApiProperty({ description: 'Is the student assignment active', default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
