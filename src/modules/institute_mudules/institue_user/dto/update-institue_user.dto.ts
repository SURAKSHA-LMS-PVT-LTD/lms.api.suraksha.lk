import { PartialType } from '@nestjs/swagger';
import { CreateInstitueUserDto } from './create-institue_user.dto';

export class UpdateInstitueUserDto extends PartialType(CreateInstitueUserDto) {}
