import { IsOptional, IsString, IsEnum, IsBoolean, IsIn } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { SortDto } from '../../../common/dto/sort.dto';
import { UserType } from '../enums/user-type.enum';
import { Gender } from '../enums/gender.enum';

export class QueryUserDto extends PaginationDto {
  @ApiPropertyOptional({
    description: 'Search term for firstName, lastName, or email',
    example: 'john',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Filter by user type',
    enum: UserType,
    example: UserType.USER_WITHOUT_PARENT,
  })
  @IsOptional()
  @IsEnum(UserType)
  userType?: UserType;

  @ApiPropertyOptional({
    description: 'Filter by city',
    example: 'Colombo',
  })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({
    description: 'Filter by district',
    example: 'Colombo',
  })
  @IsOptional()
  @IsString()
  district?: string;

  @ApiPropertyOptional({
    description: 'Filter by province',
    example: 'Western',
  })
  @IsOptional()
  @IsString()
  province?: string;

  @ApiPropertyOptional({
    description: 'Filter by gender',
    enum: Gender,
    example: Gender.FEMALE,
  })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @ApiPropertyOptional({
    description: 'Filter by phone number (partial match)',
    example: '077',
  })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({
    description: 'Filter by NIC (partial match)',
    example: '199812345',
  })
  @IsOptional()
  @IsString()
  nic?: string;

  @ApiPropertyOptional({
    description: 'Filter by country',
    example: 'Sri Lanka',
  })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional({
    description: 'Filter by postal code',
    example: '10250',
  })
  @IsOptional()
  @IsString()
  postalCode?: string;

  @ApiPropertyOptional({
    description: 'Filter by active status',
    example: true,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'Field to sort by',
    enum: ['id', 'firstName', 'lastName', 'email', 'createdAt', 'updatedAt', 'userType', 'city', 'district', 'province', 'gender', 'dateOfBirth'],
    default: 'createdAt',
    example: 'createdAt',
  })
  @IsOptional()
  @IsString()
  @IsIn(['id', 'firstName', 'lastName', 'email', 'createdAt', 'updatedAt', 'userType', 'city', 'district', 'province', 'gender', 'dateOfBirth'])
  sortBy?: string = 'createdAt';

  @ApiPropertyOptional({
    description: 'Sort order',
    enum: ['ASC', 'DESC'],
    default: 'DESC',
    example: 'DESC',
  })
  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC' = 'DESC';
}
