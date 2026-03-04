import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * Global interceptor to ensure dates are properly serialized to ISO strings
 * with Sri Lanka timezone (+05:30) instead of UTC (Z)
 * Fixes issues with TypeORM bigNumberStrings causing dates to be empty objects
 *
 * The mysql2 driver (with timezone:'+05:30') returns proper UTC Date objects.
 * This interceptor converts them to Sri Lanka local time ISO strings.
 */
@Injectable()
export class DateTransformInterceptor implements NestInterceptor {
  private static readonly SRI_LANKA_OFFSET_MS = 5.5 * 60 * 60 * 1000; // UTC+5:30

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map(data => this.transformDates(data))
    );
  }

  /**
   * Convert a UTC Date to an ISO string in Sri Lanka timezone (+05:30).
   * Adds the +05:30 offset to the UTC epoch to get Sri Lanka wall-clock time,
   * then formats as ISO with the +05:30 suffix.
   */
  private dateToSriLankaISO(date: Date): string {
    const sriLankaDate = new Date(date.getTime() + DateTransformInterceptor.SRI_LANKA_OFFSET_MS);
    return sriLankaDate.toISOString().replace('Z', '+05:30');
  }

  /**
   * Recursively transform all Date objects to ISO strings with Sri Lanka timezone
   */
  private transformDates(data: any): any {
    if (!data) return data;

    // Handle Date objects
    if (data instanceof Date) {
      return this.dateToSriLankaISO(data);
    }

    // Handle arrays
    if (Array.isArray(data)) {
      return data.map(item => this.transformDates(item));
    }

    // Handle objects
    if (typeof data === 'object') {
      const transformed = {};
      
      for (const [key, value] of Object.entries(data)) {
        // Check if this is a date field
        if (this.isDateField(key) && value) {
          // Convert to Date if string, then to ISO string with Sri Lanka timezone
          if (typeof value === 'string') {
            // Check if it's a date-only string (YYYY-MM-DD format) - preserve as-is
            if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
              transformed[key] = value; // Keep date-only format
            } else {
              // It's a datetime string, convert to ISO with Sri Lanka timezone
              const date = new Date(value);
              transformed[key] = isNaN(date.getTime()) ? value : this.dateToSriLankaISO(date);
            }
          } else if (value instanceof Date) {
            // FIXED: Check instanceof Date FIRST before checking for empty object
            transformed[key] = this.dateToSriLankaISO(value);
          } else if (typeof value === 'object' && !(value instanceof Date) && Object.keys(value).length === 0) {
            // Handle malformed date objects (like empty {}) - but NOT Date instances
            transformed[key] = null;
          } else {
            transformed[key] = value;
          }
        } else if (value instanceof Date) {
          // Transform any Date object regardless of field name
          transformed[key] = this.dateToSriLankaISO(value);
        } else {
          // Recursively transform nested objects/arrays
          transformed[key] = this.transformDates(value);
        }
      }
      
      return transformed;
    }

    return data;
  }

  /**
   * Check if a field name is a date field
   */
  private isDateField(fieldName: string): boolean {
    const dateFields = [
      'date',
      'startDate',
      'start_date',
      'startTime',  // Added
      'start_time',  // Added
      'endDate',
      'end_date',
      'endTime',    // Added
      'end_time',   // Added
      'createdAt',
      'created_at',
      'updatedAt',
      'updated_at',
      'deletedAt',
      'deleted_at',
      'dueDate',
      'due_date',
      'submittedAt',
      'submitted_at',
      'verifiedAt',
      'verified_at',
      'approvedAt',
      'approved_at',
      'rejectedAt',
      'rejected_at',
      'paidAt',
      'paid_at',
      'expiresAt',
      'expires_at',
      'birthDate',
      'birth_date',
      'dateOfBirth',
      'date_of_birth',
      'enrollmentDate',
      'enrollment_date',
      'graduationDate',
      'graduation_date',
      'examDate',
      'exam_date',
      'lectureDate',
      'lecture_date',
      'timestamp',
      // Card management date fields
      'orderDate',
      'order_date',
      'deliveredAt',
      'delivered_at',
      'activatedAt',
      'activated_at',
      'deactivatedAt',
      'deactivated_at',
      'cardExpiryDate',
      'card_expiry_date',
      'expiryDate',
      'expiry_date',
      'lastSeen',
      'last_seen',
      'lastNotificationSent',
      'last_notification_sent',
      'sentAt',
      'sent_at',
      'completedAt',
      'completed_at',
    ];
    
    return dateFields.includes(fieldName) || fieldName.toLowerCase().includes('date') || fieldName.toLowerCase().includes('time');
  }
}
