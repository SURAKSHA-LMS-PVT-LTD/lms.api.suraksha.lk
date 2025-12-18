import { PipeTransform, Injectable, BadRequestException, ArgumentMetadata } from '@nestjs/common';
import { CreateInstituteClassStudentDto, BulkCreateInstituteClassStudentDto } from '../dto/create-institute_class_student.dto';
import { INSTITUTE_CLASS_STUDENT_CONSTANTS } from '../constants/institute-class-student.constants';

@Injectable()
export class InstituteClassStudentValidationPipe implements PipeTransform {
  transform(value: CreateInstituteClassStudentDto): CreateInstituteClassStudentDto {
    if (!value) {
      throw new BadRequestException('Request body is required');
    }

    if (!value.instituteId) {
      throw new BadRequestException(INSTITUTE_CLASS_STUDENT_CONSTANTS.VALIDATION.INSTITUTE_ID_REQUIRED);
    }

    if (!value.classId) {
      throw new BadRequestException(INSTITUTE_CLASS_STUDENT_CONSTANTS.VALIDATION.CLASS_ID_REQUIRED);
    }

    if (!value.studentUserId) {
      throw new BadRequestException(INSTITUTE_CLASS_STUDENT_CONSTANTS.VALIDATION.STUDENT_ID_REQUIRED);
    }

    // Validate ID format (assuming bigint strings)
    if (!/^\d+$/.test(value.instituteId)) {
      throw new BadRequestException('Invalid institute ID format');
    }

    if (!/^\d+$/.test(value.classId)) {
      throw new BadRequestException('Invalid class ID format');
    }

    if (!/^\d+$/.test(value.studentUserId)) {
      throw new BadRequestException('Invalid student user ID format');
    }

    return value;
  }
}

@Injectable()
export class BulkInstituteClassStudentValidationPipe implements PipeTransform {
  transform(value: BulkCreateInstituteClassStudentDto): BulkCreateInstituteClassStudentDto {
    if (!value) {
      throw new BadRequestException('Request body is required');
    }

    if (!value.instituteId) {
      throw new BadRequestException(INSTITUTE_CLASS_STUDENT_CONSTANTS.VALIDATION.INSTITUTE_ID_REQUIRED);
    }

    if (!value.classId) {
      throw new BadRequestException(INSTITUTE_CLASS_STUDENT_CONSTANTS.VALIDATION.CLASS_ID_REQUIRED);
    }

    if (!value.studentUserIds || !Array.isArray(value.studentUserIds) || value.studentUserIds.length === 0) {
      throw new BadRequestException(INSTITUTE_CLASS_STUDENT_CONSTANTS.VALIDATION.STUDENT_IDS_REQUIRED);
    }

    // Validate ID formats
    if (!/^\d+$/.test(value.instituteId)) {
      throw new BadRequestException('Invalid institute ID format');
    }

    if (!/^\d+$/.test(value.classId)) {
      throw new BadRequestException('Invalid class ID format');
    }

    // Validate each student user ID
    for (const studentUserId of value.studentUserIds) {
      if (!studentUserId || !/^\d+$/.test(studentUserId)) {
        throw new BadRequestException(`Invalid student user ID format: ${studentUserId}`);
      }
    }

    // Remove duplicates
    value.studentUserIds = [...new Set(value.studentUserIds)];

    return value;
  }
}

@Injectable()
export class InstituteClassStudentParamsValidationPipe implements PipeTransform {
  transform(value: any, metadata: ArgumentMetadata): any {
    // This pipe validates individual route parameters
    // It receives the parameter value and metadata about which parameter it is
    
    if (!value || !/^\d+$/.test(value)) {
      const paramName = metadata.data || 'parameter';
      throw new BadRequestException(`Valid ${paramName} is required`);
    }

    return value;
  }
}
