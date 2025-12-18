import { PartialType } from '@nestjs/swagger';
import { CreateInstituteClassSubjectStudentDto } from './create-institute_class_subject_student.dto';

export class UpdateInstituteClassSubjectStudentDto extends PartialType(CreateInstituteClassSubjectStudentDto) {}
