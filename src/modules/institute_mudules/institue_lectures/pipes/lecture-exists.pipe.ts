import { PipeTransform, Injectable, ArgumentMetadata, NotFoundException } from '@nestjs/common';
import { InstituteLectureRepository } from '../repositories/institute-lecture.repository';
import { INSTITUTE_LECTURE_NOT_FOUND } from '../constants/institute-lecture.constants';

@Injectable()
export class LectureExistsPipe implements PipeTransform {
  constructor(private readonly lectureRepository: InstituteLectureRepository) {}

  async transform(value: string, metadata: ArgumentMetadata) {
    if (!value) {
      throw new NotFoundException(INSTITUTE_LECTURE_NOT_FOUND);
    }

    const lecture = await this.lectureRepository.findOne(value);
    if (!lecture) {
      throw new NotFoundException(INSTITUTE_LECTURE_NOT_FOUND);
    }

    return value;
  }
}
