import { BadRequestException } from '@nestjs/common';
import { getCurrentSriLankaTime } from '../../../../common/utils/timezone.util';

/**
 * Security utilities for preventing SQL injection and other attacks
 */
export class SecurityUtils {
  
  /**
   * Sanitize search input to prevent SQL injection
   */
  static sanitizeSearchInput(input: string): string {
    if (!input) return '';
    
    // Remove dangerous SQL keywords and characters
    return input
      .toString()
      .trim()
      .replace(/['"`;\\]/g, '') // Remove quotes, semicolons, backslashes
      .replace(/\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION|OR|AND)\b/gi, '') // Remove SQL keywords
      .replace(/--/g, '') // Remove SQL comments
      .replace(/\/\*/g, '') // Remove /* comments
      .replace(/\*\//g, '') // Remove */ comments
      .substring(0, 100); // Limit length
  }

  /**
   * Validate and sanitize BigInt ID parameter
   */
  static validateBigIntId(id: string, paramName: string): string {
    if (!id) {
      throw new BadRequestException(`${paramName} is required`);
    }

    const numericId = id.toString().replace(/\D/g, ''); // Remove non-digits
    
    if (!numericId || numericId.length > 20) { // Reasonable limit for BigInt
      throw new BadRequestException(`Invalid ${paramName}: must be a valid numeric ID`);
    }

    return numericId;
  }

  /**
   * Validate user type parameter
   */
  static validateUserType(userType: string): string {
    const validTypes = [
      'SUPER_ADMIN',
      'ORGANIZATION_MANAGER', 
      'INSTITUTE_ADMIN',
      'STUDENT',
      'ATTENDANCE_MARKER',
      'TEACHER',
      'PARENT'
    ];

    if (!validTypes.includes(userType)) {
      throw new BadRequestException(`Invalid user type. Must be one of: ${validTypes.join(', ')}`);
    }

    return userType;
  }

  /**
   * Validate institute user type parameter
   * 
   * ⚠️ IMPORTANT: PARENT is included for validation but handled differently in queries
   * Parents are retrieved via students → parent_id relationships, not by directly querying institute_users.
   * To get parents:
   * 1. Query students from institute_users WHERE institute_user_type = 'STUDENT'
   * 2. Get their parent IDs (father_id, mother_id, guardian_id) from students table
   * 3. Fetch parent details from users and parents tables
   */
  static validateInstituteUserType(userType: string): string {
    const validTypes = [
      'INSTITUTE_ADMIN',
      'STUDENT',
      'ATTENDANCE_MARKER',
      'TEACHER',
      'PARENT', // ✅ PARENT is valid for validation (matches InstituteUserType enum) but accessed via student relationships
    ];

    if (!validTypes.includes(userType)) {
      throw new BadRequestException(`Invalid institute user type. Must be one of: ${validTypes.join(', ')}`);
    }

    return userType;
  }

  /**
   * Validate and sanitize sort parameters
   */
  static validateSortParams(sortBy?: string, sortOrder?: string): { sortBy: string; sortOrder: 'ASC' | 'DESC' } {
    const validSortFields = ['createdAt', 'name', 'email', 'dateOfBirth'];
    const validSortOrders = ['ASC', 'DESC'];

    const safeSortBy = validSortFields.includes(sortBy || '') ? sortBy! : 'createdAt';
    const safeSortOrder = validSortOrders.includes(sortOrder || '') ? sortOrder as 'ASC' | 'DESC' : 'DESC';

    return { sortBy: safeSortBy, sortOrder: safeSortOrder };
  }

  /**
   * Validate pagination parameters
   */
  static validatePagination(page?: string, limit?: string): { page: number; limit: number; skip: number } {
    let pageNum = parseInt(page || '1');
    let limitNum = parseInt(limit || '10');

    // Enforce reasonable limits
    pageNum = Math.max(1, Math.min(pageNum, 1000)); // Max 1000 pages
    limitNum = Math.max(1, Math.min(limitNum, 50)); // Max 50 items per page

    const skip = (pageNum - 1) * limitNum;

    return { page: pageNum, limit: limitNum, skip };
  }

  /**
   * Validate date format (YYYY-MM-DD)
   */
  static validateDateFormat(date: string, paramName: string): string {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    
    if (!dateRegex.test(date)) {
      throw new BadRequestException(`${paramName} must be in YYYY-MM-DD format`);
    }

    // Validate it's a real date
    const parsedDate = new Date(date);
    if (isNaN(parsedDate.getTime())) {
      throw new BadRequestException(`${paramName} must be a valid date`);
    }

    // Don't allow dates too far in the future or past
    const currentYear = getCurrentSriLankaTime().getFullYear();
    const year = parsedDate.getFullYear();
    
    if (year < 1900 || year > currentYear + 10) {
      throw new BadRequestException(`${paramName} year must be between 1900 and ${currentYear + 10}`);
    }

    return date;
  }

  /**
   * Rate limiting check (basic implementation)
   */
  private static requestCounts = new Map<string, { count: number; resetTime: number }>();

  static checkRateLimit(identifier: string, maxRequests = 100, windowMs = 60000): void {
    const now = Date.now();
    const key = identifier;
    const record = this.requestCounts.get(key);

    if (!record || now > record.resetTime) {
      // Reset or create new record
      this.requestCounts.set(key, { count: 1, resetTime: now + windowMs });
      return;
    }

    if (record.count >= maxRequests) {
      throw new BadRequestException('Rate limit exceeded. Please try again later.');
    }

    record.count++;
  }

  /**
   * Clean up old rate limit records
   */
  static cleanupRateLimits(): void {
    const now = Date.now();
    for (const [key, record] of this.requestCounts.entries()) {
      if (now > record.resetTime) {
        this.requestCounts.delete(key);
      }
    }
  }
}
