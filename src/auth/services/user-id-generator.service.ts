import { Injectable } from '@nestjs/common';
import { UserType } from '../../modules/user/enums/user-type.enum';
import { getCurrentSriLankaTime } from '../../common/utils/timezone.util';

@Injectable()
export class UserIdGeneratorService {
  /**
   * Generate structured user IDs based on user type and registration year
   * Format: [PREFIX][YY][MM][SEQUENCE]
   * 
   * Examples:
   * - STU24070001 (Student registered in July 2024, sequence 1)
   * - TEA24070001 (Teacher registered in July 2024, sequence 1)
   * - ADM24070001 (Admin registered in July 2024, sequence 1)
   * - EDU24070001 (Educator/Institute Admin registered in July 2024, sequence 1)
   */

  private readonly prefixMap = {
    [UserType.SUPERADMIN]: 'SUP',
    [UserType.ORGANIZATION_MANAGER]: 'ORG',
    [UserType.USER]: 'USR',
    [UserType.USER_WITHOUT_PARENT]: 'UWP',
    [UserType.USER_WITHOUT_STUDENT]: 'UWS'
  };

  /**
   * Generate a new user ID
   */
  async generateUserId(
    userType: UserType,
    existingUserIds: string[] = [],
    registrationDate: Date = getCurrentSriLankaTime()
  ): Promise<string> {
    const prefix = this.prefixMap[userType];
    const year = registrationDate.getFullYear().toString().slice(-2); // Last 2 digits of year
    const month = (registrationDate.getMonth() + 1).toString().padStart(2, '0'); // Month with leading zero
    
    const basePattern = `${prefix}${year}${month}`;
    
    // Find the next sequence number
    const sequence = this.getNextSequence(basePattern, existingUserIds);
    
    return `${basePattern}${sequence.toString().padStart(4, '0')}`;
  }

  /**
   * Generate user ID with institute code
   * Format: [PREFIX][INSTITUTE_CODE][YY][MM][SEQUENCE]
   * 
   * Examples:
   * - STUABC24070001 (Student at ABC institute)
   * - TEAXYZ24070001 (Teacher at XYZ institute)
   */
  async generateUserIdWithInstitute(
    userType: UserType,
    instituteCode: string,
    existingUserIds: string[] = [],
    registrationDate: Date = getCurrentSriLankaTime()
  ): Promise<string> {
    const prefix = this.prefixMap[userType];
    const year = registrationDate.getFullYear().toString().slice(-2);
    const month = (registrationDate.getMonth() + 1).toString().padStart(2, '0');
    
    const basePattern = `${prefix}${instituteCode.toUpperCase()}${year}${month}`;
    
    const sequence = this.getNextSequence(basePattern, existingUserIds);
    
    return `${basePattern}${sequence.toString().padStart(4, '0')}`;
  }

  /**
   * Parse user ID to extract information
   */
  parseUserId(userId: string): {
    userType: UserType | null;
    instituteCode?: string;
    year: number;
    month: number;
    sequence: number;
    registrationPeriod: string;
  } {
    // Try to match pattern: PREFIX[INSTITUTE]YYMMSEQUENCE
    const match = userId.match(/^([A-Z]{3})([A-Z]{0,5})?(\d{2})(\d{2})(\d{4})$/);
    
    if (!match) {
      return {
        userType: null,
        year: 0,
        month: 0,
        sequence: 0,
        registrationPeriod: 'Unknown'
      };
    }

    const [, prefixCode, instituteCode, yearStr, monthStr, sequenceStr] = match;
    
    // Find user type by prefix
    const userType = Object.entries(this.prefixMap)
      .find(([, prefix]) => prefix === prefixCode)?.[0] as UserType;

    const year = 2000 + parseInt(yearStr);
    const month = parseInt(monthStr);
    const sequence = parseInt(sequenceStr);

    return {
      userType: userType || null,
      instituteCode: instituteCode || undefined,
      year,
      month,
      sequence,
      registrationPeriod: `${this.getMonthName(month)} ${year}`
    };
  }

  /**
   * Validate user ID format
   */
  isValidUserId(userId: string): boolean {
    // Basic pattern: 3 letter prefix + optional institute code + 2 digit year + 2 digit month + 4 digit sequence
    const pattern = /^[A-Z]{3}[A-Z]{0,5}\d{2}\d{2}\d{4}$/;
    
    if (!pattern.test(userId)) {
      return false;
    }

    const parsed = this.parseUserId(userId);
    
    // Check if user type is valid
    if (!parsed.userType) {
      return false;
    }

    // Check if month is valid (1-12)
    if (parsed.month < 1 || parsed.month > 12) {
      return false;
    }

    // Check if year is reasonable (not too far in past/future)
    const currentYear = getCurrentSriLankaTime().getFullYear();
    if (parsed.year < 2020 || parsed.year > currentYear + 5) {
      return false;
    }

    return true;
  }

  /**
   * Get user IDs for a specific period
   */
  getUserIdsForPeriod(
    userType: UserType,
    year: number,
    month: number,
    allUserIds: string[]
  ): string[] {
    const prefix = this.prefixMap[userType];
    const yearStr = year.toString().slice(-2);
    const monthStr = month.toString().padStart(2, '0');
    const pattern = `${prefix}`;
    
    return allUserIds.filter(id => {
      const parsed = this.parseUserId(id);
      return parsed.userType === userType && 
             parsed.year === year && 
             parsed.month === month;
    });
  }

  /**
   * Get statistics about user registrations
   */
  getUserRegistrationStats(allUserIds: string[]): {
    totalUsers: number;
    byUserType: Record<string, number>;
    byYear: Record<number, number>;
    byMonth: Record<string, number>;
    recentRegistrations: Array<{
      period: string;
      count: number;
      userType: UserType;
    }>;
  } {
    const stats = {
      totalUsers: allUserIds.length,
      byUserType: {} as Record<string, number>,
      byYear: {} as Record<number, number>,
      byMonth: {} as Record<string, number>,
      recentRegistrations: [] as Array<{
        period: string;
        count: number;
        userType: UserType;
      }>
    };

    allUserIds.forEach(id => {
      const parsed = this.parseUserId(id);
      
      if (parsed.userType) {
        // Count by user type
        stats.byUserType[parsed.userType] = (stats.byUserType[parsed.userType] || 0) + 1;
        
        // Count by year
        stats.byYear[parsed.year] = (stats.byYear[parsed.year] || 0) + 1;
        
        // Count by month
        const monthKey = `${parsed.year}-${parsed.month.toString().padStart(2, '0')}`;
        stats.byMonth[monthKey] = (stats.byMonth[monthKey] || 0) + 1;
      }
    });

    return stats;
  }

  private getNextSequence(basePattern: string, existingUserIds: string[]): number {
    const matchingIds = existingUserIds.filter(id => id.startsWith(basePattern));
    
    if (matchingIds.length === 0) {
      return 1;
    }

    // Extract sequence numbers and find the highest
    const sequences = matchingIds
      .map(id => parseInt(id.slice(-4)))
      .filter(seq => !isNaN(seq))
      .sort((a, b) => b - a);

    return sequences.length > 0 ? sequences[0] + 1 : 1;
  }

  private getMonthName(month: number): string {
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    return months[month - 1] || 'Unknown';
  }
}
