import { PartialType } from '@nestjs/swagger';
import { CreateInstituteClassSubjectLectureDto } from './create-institute_class_subject_lecture.dto';

export class UpdateInstituteClassSubjectLectureDto extends PartialType(CreateInstituteClassSubjectLectureDto) {}
