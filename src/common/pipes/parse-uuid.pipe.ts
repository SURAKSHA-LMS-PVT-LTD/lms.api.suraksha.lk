import { PipeTransform, Injectable, ArgumentMetadata, BadRequestException } from '@nestjs/common';
import { validate as isUUID } from 'uuid';

/**
 * Custom pipe to validate UUID parameters
 * Ensures the parameter is a valid UUID v4 format
 * Protects against injection attacks and malformed IDs
 */
@Injectable()
export class ParseUUIDPipe implements PipeTransform<string, string> {
  transform(value: string, metadata: ArgumentMetadata): string {
    const paramName = metadata.data || 'Parameter';

    // Check if value exists
    if (!value) {
      throw new BadRequestException(`${paramName} is required`);
    }

    // Remove any whitespace and potential injection characters
    const sanitizedValue = this.sanitizeInput(value);

    // Validate UUID format
    if (!isUUID(sanitizedValue)) {
      throw new BadRequestException(
        `${paramName} must be a valid UUID format (e.g., 550e8400-e29b-41d4-a716-446655440000)`
      );
    }

    return sanitizedValue;
  }

  /**
   * Sanitize input to prevent injection attacks
   * @param input The input string to sanitize
   * @returns Sanitized string
   */
  private sanitizeInput(input: string): string {
    if (typeof input !== 'string') {
      throw new BadRequestException('Input must be a string');
    }

    // Remove dangerous characters and whitespace
    const sanitized = input
      .trim()
      .replace(/[<>\"'%;()&+]/g, '') // Remove potential script injection chars
      .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
      .toLowerCase(); // UUIDs are case-insensitive, normalize to lowercase

    // Additional validation: check length
    if (sanitized.length !== 36) {
      throw new BadRequestException('UUID must be exactly 36 characters long');
    }

    return sanitized;
  }
}
