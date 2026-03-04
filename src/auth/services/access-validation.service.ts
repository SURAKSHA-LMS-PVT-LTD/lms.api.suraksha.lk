import { Injectable, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserType } from '../../modules/user/enums/user-type.enum';
import { JwtPayload, fromCompactUserType } from '../interfaces/jwt-payload.interface';

@Injectable()
export class AccessValidationService {
  constructor(private jwtService: JwtService) {}

  /**
   * DEPRECATED: This service is deprecated - use cache-based validation decorators instead
   * All validation logic should be handled at the controller level with decorators
   */

  /**
   * Extract and validate JWT token
   */
  private extractTokenPayload(token: string): JwtPayload {
    try {
      const cleanToken = token.replace('Bearer ', '');
      return this.jwtService.verify(cleanToken);
    } catch (error) {
      throw new UnauthorizedException('Invalid token');
    }
  }

  /**
   * Get user ID from ultra-compact JWT
   */
  private getUserId(payload: JwtPayload): string {
    return payload.s.toString();
  }

  /**
   * Get user type from ultra-compact JWT
   */
  private getUserType(payload: JwtPayload): UserType {
    return fromCompactUserType(payload.ut);
  }

  /**
   * DEPRECATED: Use cache validation decorators instead
   * This is a minimal stub for backward compatibility
   */
  async validateInstituteAccess(token: string, instituteId: string): Promise<void> {
    // Minimal validation - just check if token is valid
    this.extractTokenPayload(token);
  }

  /**
   * DEPRECATED: Use cache validation decorators instead
   */
  async validateClassAccess(token: string, instituteId: string, classId: string): Promise<void> {
    this.extractTokenPayload(token);
  }

  /**
   * DEPRECATED: Use cache validation decorators instead
   */
  async validateSubjectAccess(token: string, instituteId: string, classId: string, subjectId: string): Promise<void> {
    this.extractTokenPayload(token);
  }

  /**
   * DEPRECATED: Use cache validation decorators instead
   */
  async validateSuperAdminAccess(token: string): Promise<void> {
    this.extractTokenPayload(token);
  }

  /**
   * DEPRECATED: Use cache validation decorators instead
   */
  async validateInstituteAdminAccess(token: string, instituteId: string): Promise<void> {
    this.extractTokenPayload(token);
  }

  /**
   * DEPRECATED: Use cache validation decorators instead
   */
  async validateTeacherAccess(token: string, instituteId: string, classId?: string, subjectId?: string): Promise<void> {
    this.extractTokenPayload(token);
  }

  /**
   * DEPRECATED: Use cache validation decorators instead
   */
  async validateStudentAccess(token: string, instituteId: string, classId?: string): Promise<void> {
    this.extractTokenPayload(token);
  }

  /**
   * Get user data from token - Minimal implementation
   */
  async getUserDataFromToken(token: string): Promise<any> {
    const payload = this.extractTokenPayload(token);
    
    return {
      userId: payload.s,
      userType: fromCompactUserType(payload.ut)
    };
  }

  /**
   * DEPRECATED: Use cache validation decorators instead
   */
  async isAdmin(token: string, instituteId?: string): Promise<boolean> {
    try {
      const payload = this.extractTokenPayload(token);
      // Super admin always has access
      return payload.ut === 'SA';
    } catch {
      return false;
    }
  }

  /**
   * DEPRECATED: Use cache validation decorators instead
   */
  async getAccessibleInstitutes(token: string): Promise<string[]> {
    return [];
  }

  /**
   * DEPRECATED: Legacy method — throws ForbiddenException.
   * Use cache validation decorators for proper authorization.
   */
  async hasInstituteAccessLegacy(token: string, instituteId: string): Promise<boolean> {
    throw new ForbiddenException('Legacy access validation is deprecated. Use cache-based decorators.');
  }

  /**
   * DEPRECATED: Legacy method — throws ForbiddenException.
   * Use cache validation decorators for proper authorization.
   */
  async hasClassAccessLegacy(token: string, instituteId: string, classId: string): Promise<boolean> {
    throw new ForbiddenException('Legacy access validation is deprecated. Use cache-based decorators.');
  }

  /**
   * DEPRECATED: Legacy method — throws ForbiddenException.
   * Use cache validation decorators for proper authorization.
   */
  async hasSubjectAccessLegacy(token: string, instituteId: string, classId: string, subjectId: string): Promise<boolean> {
    throw new ForbiddenException('Legacy access validation is deprecated. Use cache-based decorators.');
  }
}
