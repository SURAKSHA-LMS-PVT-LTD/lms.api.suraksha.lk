import { PartialType } from '@nestjs/mapped-types';
import { CreateInstituteClassLectureGroupDto } from './create-institute_class_lecture_group.dto';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateInstituteClassLectureGroupDto extends PartialType(CreateInstituteClassLectureGroupDto) {
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
