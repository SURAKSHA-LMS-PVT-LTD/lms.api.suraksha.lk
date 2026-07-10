import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * Global interceptor to ensure Date objects are properly serialized to real-UTC
 * ISO strings (with a 'Z' suffix) instead of being left as empty objects by
 * TypeORM's bigNumberStrings option, or serialized inconsistently.
 * Fixes issues with TypeORM bigNumberStrings causing dates to be empty objects
 *
 * IMPORTANT: the mysql2 driver (timezone:'+05:30' in data-source.ts/app.module.ts)
 * already converts stored Sri-Lanka-local values to correct UTC Date objects when
 * TypeORM reads them — so this interceptor must NOT add another +05:30 on top.
 * Doing so previously double-offset every timestamp in every API response by
 * 5.5 hours (confirmed live: attendance marked ~3:00 PM Sri Lanka time was
 * displayed as "recorded at 9:27 AM"). Frontend formatters are responsible for
 * converting this true-UTC ISO string to Sri Lanka local time for display
 * (see lms user frotend/src/utils/timezone.ts and dateFormat.ts).
 */
@Injectable()
export class DateTransformInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map(data => this.transformDates(data))
    );
  }

  /**
   * Serialize an already-correct UTC Date as a standard ISO string.
   */
  private dateToSriLankaISO(date: Date): string {
    return date.toISOString();
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
