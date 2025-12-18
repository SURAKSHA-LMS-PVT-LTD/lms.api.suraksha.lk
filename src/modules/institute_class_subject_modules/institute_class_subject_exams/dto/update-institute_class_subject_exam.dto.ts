import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateInstituteClassSubjectExamDto } from './create-institute_class_subject_exam.dto';

// Exclude createdBy from update DTO - it should not be changed after creation
export class UpdateInstituteClassSubjectExamDto extends PartialType(
  OmitType(CreateInstituteClassSubjectExamDto, ['createdBy'] as const)
) {}
