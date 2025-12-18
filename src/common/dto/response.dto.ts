import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

/**
 * Standard pagination metadata for all list responses
 */
export class PaginationMetaDto {
  @ApiProperty({ 
    description: 'Total number of items',
    example: 150 
  })
  total: number;

  @ApiProperty({ 
    description: 'Current page number',
    example: 1,
    minimum: 1
  })
  page: number;

  @ApiProperty({ 
    description: 'Number of items per page',
    example: 10,
    minimum: 1,
    maximum: 100
  })
  limit: number;

  @ApiProperty({ 
    description: 'Total number of pages',
    example: 15 
  })
  totalPages: number;

  @ApiProperty({ 
    description: 'Whether there is a previous page',
    example: false 
  })
  hasPreviousPage: boolean;

  @ApiProperty({ 
    description: 'Whether there is a next page',
    example: true 
  })
  hasNextPage: boolean;
}

/**
 * Standard paginated response wrapper for all list endpoints
 * Usage: return new PaginatedResponseDto(items, total, page, limit);
 */
export class PaginatedResponseDto<T> {
  @ApiProperty({ 
    description: 'Array of items',
    isArray: true 
  })
  data: T[];

  @ApiProperty({ 
    description: 'Pagination metadata',
    type: PaginationMetaDto 
  })
  @Type(() => PaginationMetaDto)
  meta: PaginationMetaDto;

  constructor(data: T[], total: number, page: number, limit: number) {
    this.data = data;
    this.meta = {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasPreviousPage: page > 1,
      hasNextPage: page < Math.ceil(total / limit)
    };
  }
}

/**
 * Standard success response for operations that don't return data
 */
export class SuccessResponseDto {
  @ApiProperty({ 
    description: 'Operation success status',
    example: true 
  })
  success: boolean;

  @ApiProperty({ 
    description: 'Success message',
    example: 'Operation completed successfully' 
  })
  message: string;

  constructor(message: string) {
    this.success = true;
    this.message = message;
  }
}

/**
 * Standard success response with data payload
 */
export class DataResponseDto<T> {
  @ApiProperty({ 
    description: 'Operation success status',
    example: true 
  })
  success: boolean;

  @ApiProperty({ 
    description: 'Success message',
    example: 'Data retrieved successfully' 
  })
  message: string;

  @ApiProperty({ description: 'Response data' })
  data: T;

  constructor(message: string, data: T) {
    this.success = true;
    this.message = message;
    this.data = data;
  }
}

/**
 * Standard error response structure
 */
export class ErrorResponseDto {
  @ApiProperty({ 
    description: 'Error status code',
    example: 400 
  })
  statusCode: number;

  @ApiProperty({ 
    description: 'Error message',
    example: 'Validation failed' 
  })
  message: string;

  @ApiProperty({ 
    description: 'Error type',
    example: 'BadRequestException' 
  })
  error: string;

  @ApiProperty({ 
    description: 'Timestamp of error',
    example: '2025-10-14T10:30:00Z' 
  })
  timestamp: string;

  @ApiProperty({ 
    description: 'Request path',
    example: '/api/users/123' 
  })
  path: string;

  @ApiProperty({ 
    description: 'Validation errors (if applicable)',
    required: false,
    isArray: true 
  })
  validationErrors?: string[];
}
