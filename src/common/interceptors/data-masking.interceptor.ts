import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { maskEmail, maskPhoneNumber } from '../utils/phone-mask.util';
import { NO_DATA_MASKING_KEY } from '../decorators/no-data-masking.decorator';

/**
 * Global Data Masking Interceptor
 * Automatically masks sensitive data (emails, phone numbers) in ALL API responses
 * Based on IS_EMAILS_MASKED and IS_PHONENUMBERS_MASKED environment variables
 */
@Injectable()
export class DataMaskingInterceptor implements NestInterceptor {
  private readonly shouldMaskEmails: boolean;
  private readonly shouldMaskPhones: boolean;

  constructor(private reflector: Reflector) {
    this.shouldMaskEmails = this.isEnabled(process.env.IS_EMAILS_MASKED);
    this.shouldMaskPhones = this.isEnabled(process.env.IS_PHONENUMBERS_MASKED);
  }

  private isEnabled(value: string | undefined): boolean {
    if (!value) return false;
    const truthy = ['true', '1', 'yes', 'on'];
    return truthy.includes(value.trim().toLowerCase());
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    // Check if endpoint has @NoDataMasking() decorator
    const noMasking = this.reflector.getAllAndOverride<boolean>(NO_DATA_MASKING_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Skip masking if decorator is present
    if (noMasking) {
      return next.handle();
    }

    // Skip masking if both flags are disabled
    if (!this.shouldMaskEmails && !this.shouldMaskPhones) {
      return next.handle();
    }

    return next.handle().pipe(
      map((data) => {
        // Only mask if we have data to process
        if (!data) return data;
        
        return this.maskData(data);
      }),
    );
  }

  private maskData(data: any): any {
    // Handle null/undefined
    if (data === null || data === undefined) {
      return data;
    }

    // Handle primitive types
    if (typeof data !== 'object') {
      return data;
    }

    // Handle arrays
    if (Array.isArray(data)) {
      return data.map((item) => this.maskData(item));
    }

    // Handle objects
    const maskedData = { ...data };

    // Detect if this is an Institute object (has institute-specific fields)
    const isInstituteObject = this.isInstituteObject(maskedData);

    // Fields that should NOT be masked (institute contact details, emergency contacts, and card order contacts)
    const skipMaskingFields = [
      'instituteEmail',
      'institutePhone',
      'emergencyContact',
      'emergency_contact',
      'contactPhone',  // Skip masking for card order contact phone (needed for delivery)
    ];

    // If this is an institute object, also skip masking the main email and phone fields
    if (isInstituteObject) {
      skipMaskingFields.push('email', 'phone');
    }

    // Common email field names (ALL should be masked)
    const emailFields = [
      'email',
      'userEmail',
      'studentEmail',
      'parentEmail',
      'teacherEmail',
      'systemEmail',
      'contactEmail',
      'emailAddress',
      'emailAddr',
      'systemContactEmail',
    ];

    // Common phone field names (ALL should be masked except emergency contacts and card order contacts)
    const phoneFields = [
      'phone',
      'phoneNumber',
      'phone_number',
      'userPhone',
      'studentPhone',
      'parentPhone',
      'teacherPhone',
      'systemContactPhone',
      'systemContactPhoneNumber',
      // 'contactPhone', // Excluded - used for card order delivery contact, should not be masked
      'mobileNumber',
      'mobile',
    ];

    // Mask emails (except those in skipMaskingFields)
    if (this.shouldMaskEmails) {
      for (const field of emailFields) {
        if (!skipMaskingFields.includes(field) && maskedData[field] && typeof maskedData[field] === 'string') {
          maskedData[field] = maskEmail(maskedData[field]) || maskedData[field];
        }
      }
    }

    // Mask phone numbers (except those in skipMaskingFields like emergencyContact)
    if (this.shouldMaskPhones) {
      for (const field of phoneFields) {
        if (!skipMaskingFields.includes(field) && maskedData[field] && typeof maskedData[field] === 'string') {
          maskedData[field] = maskPhoneNumber(maskedData[field]) || maskedData[field];
        }
      }
    }

    // Recursively mask nested objects
    for (const key in maskedData) {
      if (maskedData.hasOwnProperty(key) && typeof maskedData[key] === 'object' && maskedData[key] !== null && !(maskedData[key] instanceof Date)) {
        maskedData[key] = this.maskData(maskedData[key]);
      }
    }

    return maskedData;
  }

  /**
   * Detect if an object is an Institute object based on its fields.
   * Handles all institute response shapes including those without `code`
   * (e.g. InstituteProfileResponseDto which excludes code intentionally).
   */
  private isInstituteObject(obj: any): boolean {
    if (!obj || typeof obj !== 'object') return false;

    // Institute-specific fields that never appear on user objects
    const hasInstituteOnlyField =
      'primaryColorCode' in obj ||
      'loadingGifUrl' in obj ||
      'facebookPageUrl' in obj ||
      'youtubeChannelUrl' in obj ||
      'instituteUserType' in obj ||
      'isDefault' in obj;

    if (hasInstituteOnlyField) return true;

    // Broader check: code + name + at least one branding/type field
    const hasBroadIdentifiers =
      'code' in obj &&
      'name' in obj &&
      (
        'logoUrl' in obj ||
        'type' in obj ||
        'status' in obj ||
        'shortName' in obj ||
        'instituteId' in obj
      );

    return hasBroadIdentifiers;
  }
}
