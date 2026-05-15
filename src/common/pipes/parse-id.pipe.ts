import { PipeTransform, Injectable, ArgumentMetadata, BadRequestException } from '@nestjs/common';
import { validate as isUUID } from 'uuid';

/**
 * Transition pipe: accepts both UUID strings and legacy numeric BigInt strings.
 * Use on all Tier-B routes (institutes, classes, subjects, attendance, etc.)
 * while the migration is in progress. Once all clients send UUIDs only,
 * swap back to ParseUUIDPipe.
 */
@Injectable()
export class ParseIdPipe implements PipeTransform<string, string> {
  transform(value: string, metadata: ArgumentMetadata): string {
    const paramName = metadata.data || 'Parameter';

    if (!value) {
      throw new BadRequestException(`${paramName} is required`);
    }

    const trimmed = value.trim().toLowerCase();

    if (isUUID(trimmed)) {
      return trimmed;
    }

    if (/^\d+$/.test(trimmed)) {
      const n = BigInt(trimmed);
      if (n <= 0n) {
        throw new BadRequestException(`${paramName} must be a positive number`);
      }
      return trimmed;
    }

    throw new BadRequestException(
      `${paramName} must be a valid UUID or numeric ID`,
    );
  }
}
