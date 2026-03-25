import { ApiProperty } from '@nestjs/swagger';
import { Grade } from '../enums/grade.enum';

export class StudentExamMarkDto {
  @ApiProperty({ description: 'Student user ID', example: '42' })
  userId: string;

  @ApiProperty({ description: 'First name', nullable: true })
  firstName: string | null;

  @ApiProperty({ description: 'Last name', nullable: true })
  lastName: string | null;

  @ApiProperty({ description: 'Full profile image URL', nullable: true })
  imageUrl: string | null;

  @ApiProperty({ description: 'Institute ID', example: '1' })
  instituteId: string;

  @ApiProperty({ description: 'Exam ID', example: '5' })
  examId: string;

  @ApiProperty({ description: 'Score achieved (decimal string), 0 if not yet graded', example: '87.50' })
  score: string;

  @ApiProperty({ description: 'Grade received', nullable: true, enum: Grade })
  grade: Grade | null;
}
