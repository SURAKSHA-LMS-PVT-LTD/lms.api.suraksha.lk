import { PartialType } from '@nestjs/swagger';
import { CreateInstitueLectureDto } from './create-institue_lecture.dto';

export class UpdateInstitueLectureDto extends PartialType(CreateInstitueLectureDto) {}
