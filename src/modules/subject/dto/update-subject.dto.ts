import { PartialType } from '@nestjs/mapped-types';
import { CreateSubjectDto } from './create-subject.dto';

export class UpdateSubjectDto extends PartialType(CreateSubjectDto) {
  // All fields are inherited from CreateSubjectDto as optional
  // Transform decorators are also inherited for proper multipart/form-data handling
}
