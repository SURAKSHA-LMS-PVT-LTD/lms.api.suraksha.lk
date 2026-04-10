import { PartialType } from '@nestjs/swagger';
import { CreateInstituteClassLectureDto } from './create-institute_class_lecture.dto';

export class UpdateInstituteClassLectureDto extends PartialType(CreateInstituteClassLectureDto) {}
