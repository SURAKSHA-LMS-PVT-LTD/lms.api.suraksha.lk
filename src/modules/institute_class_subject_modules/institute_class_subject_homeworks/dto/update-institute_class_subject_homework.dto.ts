import { PartialType } from '@nestjs/swagger';
import { CreateInstituteClassSubjectHomeworkDto } from './create-institute_class_subject_homework.dto';

export class UpdateInstituteClassSubjectHomeworkDto extends PartialType(CreateInstituteClassSubjectHomeworkDto) {}
