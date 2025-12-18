import { PartialType } from '@nestjs/swagger';
import { CreateInstitueClassDto } from './create-institue_class.dto';

export class UpdateInstitueClassDto extends PartialType(CreateInstitueClassDto) {}
