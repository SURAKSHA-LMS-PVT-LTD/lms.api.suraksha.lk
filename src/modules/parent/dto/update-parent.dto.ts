import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { CreateParentDto } from './create-parent.dto';
import { CreateUserDto } from '../../user/dto/create-user.dto';
import { ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { UpdateUserDto } from '../../user/dto/update-user.dto';

// Do not inherit user from CreateParentDto, define all fields as optional for update
export class UpdateParentDto extends PartialType(OmitType(CreateParentDto, ['user'])){
  @ApiPropertyOptional({description: 'User information to update'})
  @Type(()=> UpdateUserDto)
  user?: UpdateUserDto;
  
}
