import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsArray, ArrayNotEmpty, IsNotEmpty, IsOptional } from 'class-validator';

export class TeacherAssignStudentsDto {
  @ApiProperty({
    description: 'Array of student IDs to assign to the subject',
    example: ['123', '456', '789'],
    type: [String]
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  studentIds: string[];

  @ApiProperty({
    description: 'Student type for assigned students (default: paid)',
    example: 'paid',
    enum: ['paid', 'free_card'],
    required: false
  })
  @IsOptional()
  @IsString()
  studentType?: 'paid' | 'free_card';
}

export class TeacherAssignResponseDto {
  @ApiProperty({
    description: 'Success message',
    example: 'Successfully assigned 3 students to Mathematics for Class 10A'
  })
  message: string;

  @ApiProperty({
    description: 'Number of students successfully assigned',
    example: 3
  })
  successCount: number;

  @ApiProperty({
    description: 'Number of students that failed to be assigned',
    example: 0
  })
  failedCount: number;

  @ApiProperty({
    description: 'Details of successful assignments',
    type: [Object],
    example: [
      {
        studentId: '123',
        studentName: 'John Doe',
        status: 'success'
      }
    ]
  })
  successfulAssignments: {
    studentId: string;
    studentName: string;
    status: string;
  }[];

  @ApiProperty({
    description: 'Details of failed assignments',
    type: [Object],
    example: [
      {
        studentId: '456',
        studentName: 'Jane Smith',
        status: 'failed',
        reason: 'Student not enrolled in class'
      }
    ]
  })
  failedAssignments: {
    studentId: string;
    studentName?: string;
    status: string;
    reason: string;
  }[];
}
