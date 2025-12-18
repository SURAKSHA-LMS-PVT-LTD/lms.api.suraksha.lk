import { PipeTransform, Injectable, ArgumentMetadata, BadRequestException } from '@nestjs/common';

/**
 * Custom pipe to validate and transform BigInt IDs
 * Ensures the parameter is a valid BigInt string representation
 */
@Injectable()
export class ParseBigIntPipe implements PipeTransform<string, string> {
  transform(value: string, metadata: ArgumentMetadata): string {
    if (!value) {
      throw new BadRequestException(`${metadata.data || 'Parameter'} is required`);
    }

    // Check if the value is a valid BigInt string
    if (!/^\d+$/.test(value)) {
      throw new BadRequestException(`${metadata.data || 'Parameter'} must be a valid numeric ID`);
    }

    // Check if it's within BigInt range (basic check)
    try {
      BigInt(value);
    } catch (error) {
      throw new BadRequestException(`${metadata.data || 'Parameter'} must be a valid BigInt ID`);
    }

    // Additional validation: ensure it's not zero or negative
    if (BigInt(value) <= 0) {
      throw new BadRequestException(`${metadata.data || 'Parameter'} must be a positive number`);
    }

    return value;
  }
}
