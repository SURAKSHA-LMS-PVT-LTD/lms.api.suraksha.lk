import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, Length } from 'class-validator';

export class SelfEnrollDto {
  @ApiProperty({
    description: 'Institute ID',
    example: '1'
  })
  @IsString()
  @IsNotEmpty()
  instituteId: string;

  @ApiProperty({
    description: 'Class ID',
    example: '40'
  })
  @IsString()
  @IsNotEmpty()
  classId: string;

  @ApiProperty({
    description: 'Subject ID',
    example: '5'
  })
  @IsString()
  @IsNotEmpty()
  subjectId: string;

  @ApiProperty({
    description: 'Enrollment key for the subject',
    example: 'MATH10-ABC123',
    minLength: 5,
    maxLength: 50
  })
  @IsString()
  @IsNotEmpty()
  @Length(5, 50)
  enrollmentKey: string;
}

export class SelfEnrollResponseDto {
  @ApiProperty({
    description: 'Success message',
    example: 'Successfully enrolled in Mathematics for Class 10A. Awaiting verification.'
  })
  message: string;

  @ApiProperty({
    description: 'Institute ID',
    example: '1'
  })
  instituteId: string;

  @ApiProperty({
    description: 'Class ID',
    example: '40'
  })
  classId: string;

  @ApiProperty({
    description: 'Subject ID',
    example: '5'
  })
  subjectId: string;

  @ApiProperty({
    description: 'Subject name',
    example: 'Mathematics'
  })
  subjectName: string;

  @ApiProperty({
    description: 'Class name',
    example: 'Grade 10A'
  })
  className: string;

  @ApiProperty({
    description: 'Enrollment method',
    example: 'self_enrolled'
  })
  enrollmentMethod: string;

  @ApiProperty({
    description: 'Verification status',
    example: 'pending',
    enum: ['verified', 'pending', 'rejected']
  })
  verificationStatus: string;

  @ApiProperty({
    description: 'Enrollment timestamp',
    example: '2025-08-30T10:15:30Z'
  })
  enrolledAt: Date;
}
