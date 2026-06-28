import { IsString, IsNotEmpty, IsOptional, IsBoolean } from 'class-validator';

export class CreateInstituteClassLectureGroupDto {
  @IsString()
  @IsNotEmpty()
  instituteId: string;

  @IsString()
  @IsNotEmpty()
  classId: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  image?: string;
}
