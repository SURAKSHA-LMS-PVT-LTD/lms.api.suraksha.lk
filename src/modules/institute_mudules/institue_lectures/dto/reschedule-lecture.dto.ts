import { IsDate, IsNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';
import { INVALID_LECTURE_DATE, INVALID_LECTURE_TIME } from '../constants/institute-lecture.constants';

export class RescheduleLectureDto {
  @IsDate()
  @Type(() => Date)
  @IsNotEmpty({ message: INVALID_LECTURE_DATE })
  startTime: Date;

  @IsDate()
  @Type(() => Date)
  @IsNotEmpty({ message: INVALID_LECTURE_TIME })
  endTime: Date;
}
