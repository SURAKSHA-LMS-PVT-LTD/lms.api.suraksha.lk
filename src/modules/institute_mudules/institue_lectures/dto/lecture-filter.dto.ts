import { IsBigIntId, IsOptionalBigIntId } from '../../../../common/validators/bigint-id.validator';
import { IsString, IsOptional, IsEnum } from 'class-validator';
import { LectureStatus, LectureType } from '../enums/lecture.enum';

export class LectureFilterDto {
  @IsOptionalBigIntId()
  instituteId?: string;

  @IsOptionalBigIntId()
  classId?: string;

  @IsOptionalBigIntId()
  instructorId?: string;

  @IsOptional()
  @IsString()
  subject?: string;

  @IsOptional()
  @IsEnum(LectureStatus)
  status?: LectureStatus;

  @IsOptional()
  @IsEnum(LectureType)
  lectureType?: LectureType;
}
