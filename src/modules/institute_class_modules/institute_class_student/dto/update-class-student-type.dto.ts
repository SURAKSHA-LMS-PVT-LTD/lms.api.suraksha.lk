import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { StudentType } from '../../../institute_class_subject_modules/institute_class_subject_students/dto/update-student-type.dto';

export class UpdateClassStudentTypeDto {
  @ApiProperty({ enum: StudentType, description: 'New student payment type at class level' })
  @IsEnum(StudentType)
  studentType: StudentType;
}
