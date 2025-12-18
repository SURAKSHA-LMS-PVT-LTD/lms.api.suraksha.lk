import { IsBigIntId, IsOptionalBigIntId } from '../../../../common/validators/bigint-id.validator';
import { IsString, IsOptional } from 'class-validator';
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
}
