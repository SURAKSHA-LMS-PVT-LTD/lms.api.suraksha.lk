import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsArray, ArrayMinSize } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AssignStudentsToClassDto {
  @ApiProperty({ 
    description: 'Array of Student User IDs to assign to the class (can be single student or multiple)',
    example: ['123456789'] // or ['123456789', '123456790', '123456791']
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'At least one student user ID is required' })
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  studentUserIds: string[];

  @ApiProperty({ 
    description: 'Is the student assignment active', 
    default: true,
    required: false 
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

// Keep the old DTOs for backward compatibility
export class AssignStudentToClassDto {
  @ApiProperty({ 
    description: 'Student User ID to assign to the class',
    example: '123456789'
  })
  @IsString()
  @IsNotEmpty()
  studentUserId: string;

  @ApiProperty({ 
    description: 'Is the student assignment active', 
    default: true,
    required: false 
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class BulkAssignStudentsToClassDto {
  @ApiProperty({ 
    description: 'Array of Student User IDs to assign to the class',
    example: ['123456789', '123456790', '123456791'],
    type: [String]
  })
  @IsString({ each: true })
  @IsNotEmpty()
  studentUserIds: string[];

  @ApiProperty({ 
    description: 'Is the student assignment active', 
    default: true,
    required: false 
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
