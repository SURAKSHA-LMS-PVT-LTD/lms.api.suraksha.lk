import { Injectable, BadRequestException } from '@nestjs/common';

/**
 * Enhanced Input Validation and Sanitization Service
 * Provides comprehensive protection against various injection attacks
 */
@Injectable()
export class InputSanitizationService {
  
  /**
   * Sanitize string input to prevent XSS attacks
   * @param input The input string to sanitize
   * @param allowBasicHtml Whether to allow basic HTML tags
   * @returns Sanitized string
   */
  sanitizeString(input: string, allowBasicHtml: boolean = false): string {
    if (typeof input !== 'string') {
      return '';
    }

    // Remove control characters and normalize
    let sanitized = input
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove control characters except tab, LF, CR
      .replace(/[\u200B-\u200D\uFEFF]/g, '') // Remove zero-width characters
      .trim();

    // Basic HTML sanitization
    if (!allowBasicHtml) {
      sanitized = sanitized
        .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '') // Remove script tags
        .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '') // Remove style tags
        .replace(/javascript:/gi, '') // Remove javascript: protocols
        .replace(/on\w+\s*=/gi, '') // Remove event handlers
        .replace(/<[^>]*>/g, ''); // Remove all HTML tags
    } else {
      // Allow only basic formatting tags
      const allowedTags = /<\/?(?:b|i|em|strong|u|br|p)>/gi;
      sanitized = sanitized.replace(/<(?!\/?(b|i|em|strong|u|br|p)\b)[^>]*>/gi, '');
    }

    return sanitized;
  }

  /**
   * Validate and sanitize numeric input
   * @param input Input value
   * @param min Minimum allowed value
   * @param max Maximum allowed value
   * @returns Validated number
   */
  validateNumber(input: any, min: number = 0, max: number = Number.MAX_SAFE_INTEGER): number {
    const num = Number(input);
    
    if (isNaN(num)) {
      throw new BadRequestException('Input must be a valid number');
    }

    if (num < min || num > max) {
      throw new BadRequestException(`Number must be between ${min} and ${max}`);
    }

    return num;
  }

  /**
   * Validate query parameters for potential SQL injection
   * @param queryParams Object containing query parameters
   * @returns Sanitized query parameters
   */
  sanitizeQueryParams(queryParams: Record<string, any>): Record<string, any> {
    const sanitized: Record<string, any> = {};

    for (const [key, value] of Object.entries(queryParams)) {
      if (value === null || value === undefined) {
        continue;
      }

      // Sanitize key
      const sanitizedKey = this.sanitizeString(key).replace(/[^a-zA-Z0-9_]/g, '');
      
      if (typeof value === 'string') {
        // Check for SQL injection patterns
        if (this.containsSQLInjection(value)) {
          throw new BadRequestException(`Invalid characters detected in parameter: ${key}`);
        }
        sanitized[sanitizedKey] = this.sanitizeString(value);
      } else if (typeof value === 'number') {
        sanitized[sanitizedKey] = this.validateNumber(value);
      } else if (typeof value === 'boolean') {
        sanitized[sanitizedKey] = Boolean(value);
      } else {
        // Skip complex objects to prevent injection
        continue;
      }
    }

    return sanitized;
  }

  /**
   * Check for common SQL injection patterns
   * @param input Input string to check
   * @returns True if potentially malicious patterns found
   */
  private containsSQLInjection(input: string): boolean {
    const sqlInjectionPatterns = [
      /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE|UNION|SCRIPT)\b)/gi,
      /'.*?[';]|['"].*?['"]/gi, // Quote injections
      /--|\*\/|\/\*/gi, // SQL comments
      /<script[\s\S]*?>[\s\S]*?<\/script>/gi, // Script tags
      /javascript:/gi, // JavaScript protocols
      /on\w+\s*=/gi, // Event handlers
      /eval\s*\(/gi, // Eval functions
      /expression\s*\(/gi, // CSS expressions
    ];

    return sqlInjectionPatterns.some(pattern => pattern.test(input));
  }

  /**
   * Validate and sanitize file paths to prevent directory traversal
   * @param path File path to validate
   * @returns Sanitized path
   */
  sanitizeFilePath(path: string): string {
    if (!path || typeof path !== 'string') {
      throw new BadRequestException('Invalid file path');
    }

    // Remove dangerous path traversal patterns
    const sanitized = path
      .replace(/\.\./g, '') // Remove directory traversal
      .replace(/[<>:"|?*]/g, '') // Remove invalid filename characters
      .replace(/^\.*\/+/, '') // Remove leading dots and slashes
      .trim();

    // Validate the sanitized path
    if (sanitized.length === 0) {
      throw new BadRequestException('File path cannot be empty after sanitization');
    }

    if (sanitized.length > 255) {
      throw new BadRequestException('File path too long (max 255 characters)');
    }

    return sanitized;
  }

  /**
   * Validate limit parameter for pagination
   * @param limit Limit value
   * @param maxLimit Maximum allowed limit
   * @returns Validated limit
   */
  validateLimit(limit: any, maxLimit: number = 100): number {
    if (!limit) {
      return 10; // Default limit
    }

    const numLimit = this.validateNumber(limit, 1, maxLimit);
    return Math.floor(numLimit); // Ensure integer
  }

  /**
   * Validate email format
   * @param email Email string to validate
   * @returns Sanitized email
   */
  validateEmail(email: string): string {
    if (!email || typeof email !== 'string') {
      throw new BadRequestException('Email is required');
    }

    const sanitized = this.sanitizeString(email).toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(sanitized)) {
      throw new BadRequestException('Invalid email format');
    }

    return sanitized;
  }

  /**
   * Validate and sanitize sort parameters
   * @param sortBy Sort field
   * @param sortOrder Sort order
   * @param allowedFields Array of allowed sort fields
   * @returns Validated sort parameters
   */
  validateSortParams(
    sortBy: any, 
    sortOrder: any, 
    allowedFields: string[]
  ): { sortBy: string; sortOrder: 'ASC' | 'DESC' } {
    
    let validSortBy = 'createdAt'; // Default
    let validSortOrder: 'ASC' | 'DESC' = 'DESC'; // Default

    if (sortBy && typeof sortBy === 'string') {
      const sanitizedSortBy = this.sanitizeString(sortBy).replace(/[^a-zA-Z0-9_]/g, '');
      if (allowedFields.includes(sanitizedSortBy)) {
        validSortBy = sanitizedSortBy;
      }
    }

    if (sortOrder && typeof sortOrder === 'string') {
      const sanitizedOrder = this.sanitizeString(sortOrder).toUpperCase();
      if (sanitizedOrder === 'ASC' || sanitizedOrder === 'DESC') {
        validSortOrder = sanitizedOrder as 'ASC' | 'DESC';
      }
    }

    return { sortBy: validSortBy, sortOrder: validSortOrder };
  }

  /**
   * Rate limiting check (simple in-memory implementation)
   * In production, use Redis or similar
   */
  private requestCounts = new Map<string, { count: number; resetTime: number }>();

  checkRateLimit(identifier: string, maxRequests: number = 100, windowMs: number = 60000): void {
    const now = Date.now();
    const current = this.requestCounts.get(identifier);

    if (!current || now > current.resetTime) {
      this.requestCounts.set(identifier, { count: 1, resetTime: now + windowMs });
      return;
    }

    if (current.count >= maxRequests) {
      throw new BadRequestException('Rate limit exceeded. Too many requests.');
    }

    current.count++;
  }

  /**
   * Clean up old rate limit entries
   */
  cleanupRateLimit(): void {
    const now = Date.now();
    for (const [key, value] of this.requestCounts.entries()) {
      if (now > value.resetTime) {
        this.requestCounts.delete(key);
      }
    }
  }
}
