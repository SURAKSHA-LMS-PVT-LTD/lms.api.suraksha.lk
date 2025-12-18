import { PartialType } from '@nestjs/swagger';
import { CreateInstituteClassSubjectHomeworksSubmissionDto } from './create-institute_class_subject_homeworks_submission.dto';

export class UpdateInstituteClassSubjectHomeworksSubmissionDto extends PartialType(CreateInstituteClassSubjectHomeworksSubmissionDto) {}
