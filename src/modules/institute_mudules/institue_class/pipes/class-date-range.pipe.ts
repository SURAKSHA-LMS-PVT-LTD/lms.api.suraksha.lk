import { PipeTransform, Injectable, ArgumentMetadata, BadRequestException } from '@nestjs/common';
import { INVALID_DATE_RANGE } from '../constants/institute-class.constants';
import { CreateInstitueClassDto } from '../dto/create-institue_class.dto';
import { UpdateInstitueClassDto } from '../dto/update-institue_class.dto';

@Injectable()
export class ClassDateRangePipe implements PipeTransform {
  transform(value: CreateInstitueClassDto | UpdateInstitueClassDto, metadata: ArgumentMetadata) {
    // Handle undefined or null value
    if (!value) {
      return value;
    }

    // Skip validation if dates are not provided
    if (!value.startDate || !value.endDate) {
      return value;
    }

    // Convert to Date objects if they are strings
    const startDate = new Date(value.startDate);
    const endDate = new Date(value.endDate);

    // Check if dates are valid
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return value; // Return as-is if dates are invalid, let DTO validation handle it
    }

    // Check if end date is after start date
    if (endDate <= startDate) {
      throw new BadRequestException(INVALID_DATE_RANGE);
    }

    // Update the values with the Date objects
    value.startDate = startDate;
    value.endDate = endDate;

    return value;
  }
}
