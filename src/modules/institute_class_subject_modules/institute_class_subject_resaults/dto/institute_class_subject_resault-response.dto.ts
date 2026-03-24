import { ApiProperty } from '@nestjs/swagger';
import { InstituteClassSubjectResault } from '../entities/institute_class_subject_resault.entity';
import { Grade } from '../enums/grade.enum';

export class StudentDetailsDto {
  @ApiProperty({ description: 'Student ID', example: '3' })
  id: string;

  @ApiProperty({ description: 'Student first name', example: 'John' })
  firstName: string;

  @ApiProperty({ description: 'Student last name', example: 'Doe' })
  lastName: string;

  @ApiProperty({ description: 'Student email', example: 'john.doe@example.com' })
  email: string;
}

export class ExamBasicDetailsDto {
  @ApiProperty({ description: 'Exam ID', example: '1' })
  id: string;

  @ApiProperty({ description: 'Exam title', example: 'Prajananay exam' })
  title: string;

  @ApiProperty({ description: 'Exam type', example: 'online' })
  examType: string;
}

export class InstituteClassSubjectResaultResponseDto {
  @ApiProperty({ description: 'Result ID', example: '1' })
  id: string;

  @ApiProperty({ description: 'Institute ID', example: '1' })
  instituteId: string;

  @ApiProperty({ description: 'Class ID', example: '1' })
  classId: string;

  @ApiProperty({ description: 'Subject ID', example: '1' })
  subjectId: string;

  @ApiProperty({ description: 'Student ID', example: '1' })
  studentId: string;

  @ApiProperty({ description: 'Student details', type: StudentDetailsDto, required: false })
  student?: StudentDetailsDto;

  @ApiProperty({ description: 'Exam ID', example: '1', required: false })
  examId?: string;

  @ApiProperty({ description: 'Basic exam details', type: ExamBasicDetailsDto, required: false })
  exam?: ExamBasicDetailsDto;

  @ApiProperty({ description: 'Score achieved', example: '85.50' })
  score?: string;

  @ApiProperty({ description: 'Grade received', example: 'A' })
  grade?: Grade;

  @ApiProperty({ description: 'Remarks', example: 'Excellent performance' })
  remarks?: string;

  @ApiProperty({ description: 'Active status', example: true })
  isActive: boolean;

  @ApiProperty({ description: 'Creation date', example: '2024-01-15T10:00:00Z' })
  createdAt?: Date;

  @ApiProperty({ description: 'Last update date', example: '2024-01-15T10:00:00Z' })
  updatedAt?: Date;

  static fromEntity(entity: InstituteClassSubjectResault): InstituteClassSubjectResaultResponseDto {
    const dto = new InstituteClassSubjectResaultResponseDto();
    dto.id = entity.id;
    dto.instituteId = entity.instituteId;
    dto.classId = entity.classId;
    dto.subjectId = entity.subjectId;
    dto.studentId = entity.studentId;
    dto.examId = entity.examId;
    dto.score = entity.score;
    dto.grade = entity.grade;
    dto.remarks = entity.remarks;
    dto.isActive = entity.isActive;
    dto.createdAt = entity.createdAt;
    dto.updatedAt = entity.updatedAt;
    
    // Include student details if loaded
    if (entity.student) {
      dto.student = {
        id: entity.student.id,
        firstName: entity.student.firstName,
        lastName: entity.student.lastName,
        email: entity.student.email
      };
    }
    
    // Include only basic exam details if loaded
    if (entity.exam) {
      dto.exam = {
        id: entity.exam.id,
        title: entity.exam.title,
        examType: entity.exam.examType
      };
    }
    
    return dto;
  }
}
