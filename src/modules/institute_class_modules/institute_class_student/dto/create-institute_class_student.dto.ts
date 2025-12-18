import { IsString, IsNotEmpty, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

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
