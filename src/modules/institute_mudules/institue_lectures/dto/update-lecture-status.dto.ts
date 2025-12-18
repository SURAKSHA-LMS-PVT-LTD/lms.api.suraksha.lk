import { IsEnum, IsNotEmpty } from 'class-validator';
import { LectureStatus } from '../enums/lecture.enum';
import { INVALID_LECTURE_STATUS } from '../constants/institute-lecture.constants';

export class UpdateLectureStatusDto {
  @IsEnum(LectureStatus, { message: INVALID_LECTURE_STATUS })
  @IsNotEmpty()
  status: LectureStatus;
}
