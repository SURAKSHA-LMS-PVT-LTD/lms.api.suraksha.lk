import { PipeTransform, Injectable, ArgumentMetadata, NotFoundException } from '@nestjs/common';
import { InstituteClassRepository } from '../repositories/institute-class.repository';
import { INSTITUTE_CLASS_NOT_FOUND } from '../constants/institute-class.constants';

@Injectable()
export class ClassExistsPipe implements PipeTransform {
  constructor(private readonly classRepository: InstituteClassRepository) {}

  async transform(value: string, metadata: ArgumentMetadata) {
    if (!value) {
      throw new NotFoundException(INSTITUTE_CLASS_NOT_FOUND);
    }

    const classEntity = await this.classRepository.findOne(value);
    if (!classEntity) {
      throw new NotFoundException(INSTITUTE_CLASS_NOT_FOUND);
    }

    return value;
  }
}
