import { PartialType } from '@nestjs/mapped-types';
import { CreateUserDto } from './create-user.dto';

export class UpdateUserDto extends PartialType(CreateUserDto) {
  // All properties are inherited from CreateUserDto with proper validations
  // including the yyyy-MM-dd format validation for dateOfBirth
}
