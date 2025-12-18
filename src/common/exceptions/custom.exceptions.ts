import { HttpException, HttpStatus } from '@nestjs/common';

export class BusinessLogicException extends HttpException {
  constructor(
    message: string,
    statusCode: HttpStatus = HttpStatus.BAD_REQUEST,
    details?: any
  ) {
    super(
      {
        message,
        error: 'Business Logic Error',
        statusCode,
        details,
      },
      statusCode
    );
  }
}

export class ValidationException extends HttpException {
  constructor(message: string, validationErrors?: any[]) {
    super(
      {
        message,
        error: 'Validation Error',
        statusCode: HttpStatus.BAD_REQUEST,
        validationErrors,
      },
      HttpStatus.BAD_REQUEST
    );
  }
}

export class DatabaseException extends HttpException {
  constructor(
    message: string,
    statusCode: HttpStatus = HttpStatus.INTERNAL_SERVER_ERROR,
    originalError?: any
  ) {
    super(
      {
        message,
        error: 'Database Error',
        statusCode,
        originalError: process.env.NODE_ENV === 'development' ? originalError : undefined,
      },
      statusCode
    );
  }
}

export class ResourceNotFoundException extends HttpException {
  constructor(resource: string, identifier?: string) {
    const message = identifier 
      ? `${resource} with identifier '${identifier}' not found`
      : `${resource} not found`;
    
    super(
      {
        message,
        error: 'Resource Not Found',
        statusCode: HttpStatus.NOT_FOUND,
        resource,
        identifier,
      },
      HttpStatus.NOT_FOUND
    );
  }
}

export class DuplicateResourceException extends HttpException {
  constructor(resource: string, field: string, value: string, existingId?: string) {
    const response = {
      message: `${resource} with ${field} '${value}' already exists`,
      error: 'Duplicate Resource',
      statusCode: HttpStatus.CONFLICT,
      resource,
      field,
      value,
      ...(existingId && { existingId }),
    };

    super(response, HttpStatus.CONFLICT);
  }
}
