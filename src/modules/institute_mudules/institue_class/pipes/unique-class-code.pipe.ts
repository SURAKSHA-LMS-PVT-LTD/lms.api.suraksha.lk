import { PipeTransform, Injectable, ArgumentMetadata, BadRequestException, ExecutionContext, Inject } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { CreateInstitueClassDto } from '../dto/create-institue_class.dto';
import { UpdateInstitueClassDto } from '../dto/update-institue_class.dto';
import { InstituteClassRepository } from '../repositories/institute-class.repository';
import { INSTITUTE_CLASS_ALREADY_EXISTS } from '../constants/institute-class.constants';

@Injectable()
export class UniqueClassCodePipe implements PipeTransform {
  constructor(
    private readonly classRepository: InstituteClassRepository,
    @Inject(REQUEST) private readonly request: any
  ) {}

  async transform(value: CreateInstitueClassDto | UpdateInstitueClassDto, metadata: ArgumentMetadata) {
    if (!value.code) {
      return value;
    }

    // For PATCH requests, get the ID from the route params
    const isUpdate = this.request.method === 'PATCH';
    const excludeId = isUpdate ? this.request.params?.id : undefined;
    
    const isUnique = await this.classRepository.isCodeUnique(value.code, excludeId);
    
    if (!isUnique) {
      throw new BadRequestException(INSTITUTE_CLASS_ALREADY_EXISTS);
    }
    
    return value;
  }
}
