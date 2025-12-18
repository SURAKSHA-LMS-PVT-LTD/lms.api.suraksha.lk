import { PartialType } from '@nestjs/swagger';
import { CreateInstituteClassSubjectResaultDto } from './create-institute_class_subject_resault.dto';

export class UpdateInstituteClassSubjectResaultDto extends PartialType(CreateInstituteClassSubjectResaultDto) {}
