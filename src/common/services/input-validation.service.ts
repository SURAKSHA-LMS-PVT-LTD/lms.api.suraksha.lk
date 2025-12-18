import { Injectable, BadRequestException } from '@nestjs/common';
import { validate, ValidationError } from 'class-validator';
import { plainToClass } from 'class-transformer';
import * as validator from 'validator';

@Injectable()
export class InputValidationService {
  private readonly maxStringLength = 1000;
  private readonly maxDescriptionLength = 5000;
  private readonly maxNotesLength = 2000;
  private readonly maxAmountValue = 999999.99;
  private readonly minAmountValue = 0.01;

  // SQL injection patterns
  private readonly sqlInjectionPatterns = [
    /('|(\\')|(;)|(--)|(\|)|(\*)|(%)|(\+)|(-)|(\?))/gi,
    /(union|select|insert|update|delete|drop|create|alter|exec|execute|script|javascript|vbscript)/gi,
    /(onload|onerror|onclick|onmouseover|onfocus|onblur)/gi,
  ];

  // XSS patterns
  private readonly xssPatterns = [
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
    /<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi,
    /<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi,
    /<applet\b[^<]*(?:(?!<\/applet>)<[^<]*)*<\/applet>/gi,
    /<meta\b[^<]*(?:(?!<\/meta>)<[^<]*)*<\/meta>/gi,
    /javascript:/gi,
    /vbscript:/gi,
    /data:text\/html/gi,
  ];

  // NoSQL injection patterns
  private readonly noSqlInjectionPatterns = [
    /\$where/gi,
    /\$ne/gi,
    /\$gt/gi,
    /\$gte/gi,
    /\$lt/gi,
    /\$lte/gi,
    /\$regex/gi,
    /\$or/gi,
    /\$and/gi,
    /\$not/gi,
    /\$nor/gi,
    /\$exists/gi,
    /\$type/gi,
    /\$mod/gi,
    /\$all/gi,
    /\$size/gi,
    /\$elemMatch/gi,
  ];

  /**
   * Validate and sanitize string input
   */
  sanitizeString(input: string, maxLength = this.maxStringLength): string {
    if (!input || typeof input !== 'string') {
      return '';
    }

    // Remove null bytes and control characters
    let sanitized = input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

    // Normalize unicode
    sanitized = sanitized.normalize('NFKC');

    // Check for malicious patterns
    this.checkForMaliciousPatterns(sanitized);

    // Basic HTML sanitization without DOMPurify
    sanitized = this.basicHtmlSanitize(sanitized);

    // Trim whitespace and limit length
    sanitized = sanitized.trim();
    if (sanitized.length > maxLength) {
      sanitized = sanitized.substring(0, maxLength);
    }

    return sanitized;
  }

  /**
   * Sanitize description with basic HTML allowed
   */
  sanitizeDescription(input: string): string {
    if (!input || typeof input !== 'string') {
      return '';
    }

    // Remove null bytes and control characters
    let sanitized = input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

    // Normalize unicode
    sanitized = sanitized.normalize('NFKC');

    // Check for malicious patterns
    this.checkForMaliciousPatterns(sanitized);

    // Sanitize HTML content - allow basic formatting
    sanitized = this.basicHtmlSanitize(sanitized, ['b', 'i', 'u', 'strong', 'em', 'p', 'br', 'ul', 'ol', 'li']);

    // Trim and limit length
    sanitized = sanitized.trim();
    if (sanitized.length > this.maxDescriptionLength) {
      sanitized = sanitized.substring(0, this.maxDescriptionLength);
    }

    return sanitized;
  }

  /**
   * Validate and sanitize numeric input
   */
  sanitizeNumber(input: any, min = this.minAmountValue, max = this.maxAmountValue): number {
    if (input === null || input === undefined) {
      throw new BadRequestException({
        success: false,
        message: 'Number value is required',
        error: 'INVALID_NUMBER'
      });
    }

    const num = parseFloat(input);
    
    if (isNaN(num)) {
      throw new BadRequestException({
        success: false,
        message: 'Invalid number format',
        error: 'INVALID_NUMBER_FORMAT'
      });
    }

    if (num < min || num > max) {
      throw new BadRequestException({
        success: false,
        message: `Number must be between ${min} and ${max}`,
        error: 'NUMBER_OUT_OF_RANGE'
      });
    }

    // Round to 2 decimal places for currency
    return Math.round(num * 100) / 100;
  }

  /**
   * Validate date string
   */
  sanitizeDate(input: string): Date {
    if (!input || typeof input !== 'string') {
      throw new BadRequestException({
        success: false,
        message: 'Date string is required',
        error: 'INVALID_DATE'
      });
    }

    if (!validator.isISO8601(input)) {
      throw new BadRequestException({
        success: false,
        message: 'Invalid date format. Use ISO 8601 format (YYYY-MM-DDTHH:mm:ss.sssZ)',
        error: 'INVALID_DATE_FORMAT'
      });
    }

    const date = new Date(input);
    if (isNaN(date.getTime())) {
      throw new BadRequestException({
        success: false,
        message: 'Invalid date value',
        error: 'INVALID_DATE_VALUE'
      });
    }

    return date;
  }

  /**
   * Validate and sanitize ID parameters
   */
  sanitizeId(input: string): string {
    if (!input || typeof input !== 'string') {
      throw new BadRequestException({
        success: false,
        message: 'ID parameter is required',
        error: 'INVALID_ID'
      });
    }

    // Remove any non-alphanumeric characters except hyphens and underscores
    const sanitized = input.replace(/[^a-zA-Z0-9\-_]/g, '');

    if (sanitized.length === 0) {
      throw new BadRequestException({
        success: false,
        message: 'Invalid ID format',
        error: 'INVALID_ID_FORMAT'
      });
    }

    if (sanitized.length > 50) {
      throw new BadRequestException({
        success: false,
        message: 'ID too long',
        error: 'ID_TOO_LONG'
      });
    }

    return sanitized;
  }

  /**
   * Validate email format
   */
  sanitizeEmail(input: string): string {
    if (!input || typeof input !== 'string') {
      throw new BadRequestException({
        success: false,
        message: 'Email is required',
        error: 'INVALID_EMAIL'
      });
    }

    const sanitized = input.trim().toLowerCase();
    
    if (!validator.isEmail(sanitized)) {
      throw new BadRequestException({
        success: false,
        message: 'Invalid email format',
        error: 'INVALID_EMAIL_FORMAT'
      });
    }

    return sanitized;
  }

  /**
   * Validate phone number
   */
  sanitizePhoneNumber(input: string): string {
    if (!input || typeof input !== 'string') {
      return '';
    }

    // Remove all non-numeric characters except +
    let sanitized = input.replace(/[^\d+]/g, '');

    if (sanitized.startsWith('+')) {
      // International format
      if (sanitized.length < 8 || sanitized.length > 15) {
        throw new BadRequestException({
          success: false,
          message: 'Invalid phone number length',
          error: 'INVALID_PHONE_LENGTH'
        });
      }
    } else {
      // Domestic format
      if (sanitized.length < 10 || sanitized.length > 10) {
        throw new BadRequestException({
          success: false,
          message: 'Phone number must be 10 digits',
          error: 'INVALID_PHONE_LENGTH'
        });
      }
    }

    return sanitized;
  }

  /**
   * Check for malicious patterns in input
   */
  private checkForMaliciousPatterns(input: string): void {
    // Check for SQL injection patterns
    for (const pattern of this.sqlInjectionPatterns) {
      if (pattern.test(input)) {
        throw new BadRequestException({
          success: false,
          message: 'Input contains potentially malicious content',
          error: 'MALICIOUS_INPUT_DETECTED'
        });
      }
    }

    // Check for XSS patterns
    for (const pattern of this.xssPatterns) {
      if (pattern.test(input)) {
        throw new BadRequestException({
          success: false,
          message: 'Input contains potentially malicious script content',
          error: 'XSS_CONTENT_DETECTED'
        });
      }
    }

    // Check for NoSQL injection patterns
    for (const pattern of this.noSqlInjectionPatterns) {
      if (pattern.test(input)) {
        throw new BadRequestException({
          success: false,
          message: 'Input contains potentially malicious query content',
          error: 'NOSQL_INJECTION_DETECTED'
        });
      }
    }
  }

  /**
   * Basic HTML sanitization
   */
  private basicHtmlSanitize(input: string, allowedTags: string[] = []): string {
    if (!input) return '';

    // Remove all HTML tags except allowed ones
    let sanitized = input;

    if (allowedTags.length === 0) {
      // Remove all HTML tags
      sanitized = sanitized.replace(/<[^>]*>/g, '');
    } else {
      // Create regex to match allowed tags
      const allowedTagsRegex = allowedTags.join('|');
      const tagRegex = new RegExp(`<(?!\/?(?:${allowedTagsRegex})\b)[^>]*>`, 'gi');
      sanitized = sanitized.replace(tagRegex, '');
      
      // Remove all attributes from allowed tags for security
      const attributeRegex = new RegExp(`<(${allowedTagsRegex})\\s[^>]*>`, 'gi');
      sanitized = sanitized.replace(attributeRegex, '<$1>');
    }

    // Decode HTML entities to prevent double encoding
    sanitized = sanitized
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'")
      .replace(/&#x2F;/g, '/');

    return sanitized;
  }

  /**
   * Validate pagination parameters
   */
  sanitizePaginationParams(page: any, limit: any): { page: number; limit: number } {
    let sanitizedPage = 1;
    let sanitizedLimit = 10;

    if (page !== undefined && page !== null) {
      sanitizedPage = parseInt(page);
      if (isNaN(sanitizedPage) || sanitizedPage < 1) {
        sanitizedPage = 1;
      }
      if (sanitizedPage > 1000) { // Max page limit
        sanitizedPage = 1000;
      }
    }

    if (limit !== undefined && limit !== null) {
      sanitizedLimit = parseInt(limit);
      if (isNaN(sanitizedLimit) || sanitizedLimit < 1) {
        sanitizedLimit = 10;
      }
      if (sanitizedLimit > 100) { // Max limit
        sanitizedLimit = 100;
      }
    }

    return { page: sanitizedPage, limit: sanitizedLimit };
  }

  /**
   * Validate enum values
   */
  validateEnum(value: string, enumObject: any, fieldName: string): string {
    if (!value || typeof value !== 'string') {
      throw new BadRequestException({
        success: false,
        message: `${fieldName} is required`,
        error: 'INVALID_ENUM_VALUE'
      });
    }

    const sanitizedValue = value.trim().toUpperCase();
    
    if (!Object.values(enumObject).includes(sanitizedValue)) {
      throw new BadRequestException({
        success: false,
        message: `Invalid ${fieldName}. Allowed values: ${Object.values(enumObject).join(', ')}`,
        error: 'INVALID_ENUM_VALUE'
      });
    }

    return sanitizedValue;
  }

  /**
   * Comprehensive DTO validation
   */
  async validateAndSanitizeDto<T extends object>(
    dto: any,
    DtoClass: new () => T
  ): Promise<T> {
    try {
      const dtoInstance = plainToClass(DtoClass, dto);
      const errors = await validate(dtoInstance, {
        whitelist: true,
        forbidNonWhitelisted: true,
      });

      if (errors.length > 0) {
        const errorMessages = this.formatValidationErrors(errors);
        throw new BadRequestException({
          success: false,
          message: 'Validation failed',
          error: 'VALIDATION_ERROR',
          details: errorMessages,
        });
      }

      return dtoInstance;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException({
        success: false,
        message: 'Invalid request format',
        error: 'INVALID_REQUEST_FORMAT'
      });
    }
  }

  /**
   * Format validation errors for user-friendly response
   */
  private formatValidationErrors(errors: ValidationError[]): string[] {
    const messages: string[] = [];
    
    errors.forEach(error => {
      if (error.constraints) {
        Object.values(error.constraints).forEach(message => {
          messages.push(message);
        });
      }
      
      if (error.children && error.children.length > 0) {
        messages.push(...this.formatValidationErrors(error.children));
      }
    });

    return messages;
  }

  /**
   * Rate limiting validation (to be used with request context)
   */
  validateRateLimit(userRequests: number, maxRequests: number, windowMs: number): void {
    if (userRequests > maxRequests) {
      throw new BadRequestException({
        success: false,
        message: `Rate limit exceeded. Maximum ${maxRequests} requests per ${windowMs / 1000} seconds`,
        error: 'RATE_LIMIT_EXCEEDED'
      });
    }
  }

  /**
   * File upload validation (to be used with multer files)
   */
  validateUploadedFile(file: any): void {
    if (!file) {
      throw new BadRequestException({
        success: false,
        message: 'File is required',
        error: 'FILE_REQUIRED'
      });
    }

    // File size validation (2MB max)
    const maxSize = 2 * 1024 * 1024;
    if (file.size > maxSize) {
      throw new BadRequestException({
        success: false,
        message: 'File too large. Maximum size allowed is 2MB',
        error: 'FILE_TOO_LARGE'
      });
    }

    // File type validation
    const allowedMimeTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException({
        success: false,
        message: 'Invalid file type. Only PDF, JPG, JPEG, PNG files are allowed',
        error: 'INVALID_FILE_TYPE'
      });
    }

    // Filename security validation
    this.validateFilename(file.originalname);
  }

  /**
   * Validate filename for security
   */
  private validateFilename(filename: string): void {
    if (!filename || filename.length === 0) {
      throw new BadRequestException({
        success: false,
        message: 'Filename is required',
        error: 'INVALID_FILENAME'
      });
    }

    // Check for dangerous patterns
    const dangerousPatterns = [
      /\.\./,           // Path traversal
      /[<>:"|?*]/,      // Windows forbidden chars
      /[\x00-\x1f]/,    // Control characters
      /\0/,             // Null bytes
      /\.php\./i,       // Double extensions
      /\.exe\./i,
      /\.js\./i,
      /\.bat\./i,
      /\.sh\./i,
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(filename)) {
        throw new BadRequestException({
          success: false,
          message: 'Filename contains invalid characters or patterns',
          error: 'INVALID_FILENAME_PATTERN'
        });
      }
    }

    // Length validation
    if (filename.length > 255) {
      throw new BadRequestException({
        success: false,
        message: 'Filename too long. Maximum 255 characters allowed',
        error: 'FILENAME_TOO_LONG'
      });
    }
  }
}
