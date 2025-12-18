import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SubjectResponseDto } from './subject-response.dto';

export class StudentSubjectAssignmentResponseDto {
  @ApiProperty({ description: 'Assignment ID' })
  id: string;

  @ApiProperty({ description: 'Student ID' })
  studentId: string;

  @ApiProperty({ description: 'Institute ID' })
  instituteId: string;

  @ApiProperty({ description: 'Class ID' })
  classId: string;

  @ApiProperty({ description: 'Subject details' })
  subject: SubjectResponseDto;

  @ApiPropertyOptional({ description: 'Basket parent subject (if applicable)' })
  basketParent?: SubjectResponseDto;

  @ApiProperty({ description: 'Subject type' })
  subjectType: 'MAIN' | 'BASKET';

  @ApiProperty({ description: 'Assignment date' })
  assignedDate: Date;

  @ApiProperty({ description: 'Active status' })
  isActive: boolean;

  @ApiProperty({ description: 'Created timestamp' })
  createdAt: Date;

  constructor(assignment: Partial<StudentSubjectAssignmentResponseDto>) {
    Object.assign(this, assignment);
  }
}

export class StudentSubjectsResponseDto {
  @ApiProperty({ description: 'Student ID' })
  studentId: string;

  @ApiProperty({ description: 'Main subjects assigned to student' })
  mainSubjects: SubjectResponseDto[];

  @ApiProperty({ description: 'Basket subjects with selected options' })
  basketSubjects: {
    basketParent: SubjectResponseDto;
    selectedOption: SubjectResponseDto;
    availableOptions: SubjectResponseDto[];
  }[];

  @ApiProperty({ description: 'Total number of subjects' })
  totalSubjects: number;

  constructor(data: Partial<StudentSubjectsResponseDto>) {
    Object.assign(this, data);
  }
}
