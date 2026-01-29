// src/common/transformers/date-format.transformer.ts
import { Transform } from 'class-transformer';
import { BadRequestException } from '@nestjs/common';
import { getCurrentSriLankaTime } from '../utils/timezone.util';

/**
 * Transforms date strings from various formats to YYYY-MM-DD format
 * Supports: YYYY/MM/DD, YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY
 */
export function DateFormatTransformer() {
  return Transform(({ value }) => {
    if (!value) return value;
    
    if (typeof value !== 'string') {
      return value;
    }

    // Remove any extra spaces
    const cleanValue = value.trim();
    
    // Handle YYYY/MM/DD format
    if (/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(cleanValue)) {
      return cleanValue.replace(/\//g, '-');
    }
    
    // Handle DD/MM/YYYY format
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(cleanValue)) {
      const parts = cleanValue.split('/');
      const day = parts[0].padStart(2, '0');
      const month = parts[1].padStart(2, '0');
      const year = parts[2];
      return `${year}-${month}-${day}`;
    }
    
    // Handle DD-MM-YYYY format
    if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(cleanValue)) {
      const parts = cleanValue.split('-');
      const day = parts[0].padStart(2, '0');
      const month = parts[1].padStart(2, '0');
      const year = parts[2];
      return `${year}-${month}-${day}`;
    }
    
    // Handle YYYY-MM-DD format (already correct)
    if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(cleanValue)) {
      const parts = cleanValue.split('-');
      const year = parts[0];
      const month = parts[1].padStart(2, '0');
      const day = parts[2].padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    
    // Handle ISO date strings
    if (cleanValue.includes('T')) {
      try {
        const date = new Date(cleanValue);
        if (!isNaN(date.getTime())) {
          return date.toISOString().split('T')[0];
        }
      } catch (error) {
        // Fall through to return original value
      }
    }
    
    // If no pattern matches, return original value
    // The validation will catch invalid formats
    return cleanValue;
  });
}

/**
 * Utility function to transform date format
 */
export function transformDateFormat(value: string): string {
  if (!value) return value;
  
  if (typeof value !== 'string') {
    return value;
  }

  // Remove any extra spaces
  const cleanValue = value.trim();
  
  // Handle YYYY/MM/DD format
  if (/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(cleanValue)) {
    return cleanValue.replace(/\//g, '-');
  }
  
  // Handle DD/MM/YYYY format
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(cleanValue)) {
    const parts = cleanValue.split('/');
    const day = parts[0].padStart(2, '0');
    const month = parts[1].padStart(2, '0');
    const year = parts[2];
    return `${year}-${month}-${day}`;
  }
  
  // Handle DD-MM-YYYY format
  if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(cleanValue)) {
    const parts = cleanValue.split('-');
    const day = parts[0].padStart(2, '0');
    const month = parts[1].padStart(2, '0');
    const year = parts[2];
    return `${year}-${month}-${day}`;
  }
  
  // Handle YYYY-MM-DD format (already correct)
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(cleanValue)) {
    const parts = cleanValue.split('-');
    const year = parts[0];
    const month = parts[1].padStart(2, '0');
    const day = parts[2].padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  
  return cleanValue;
}

/**
 * Validates and transforms date strings for birth dates
 */
export function ValidDateOfBirthTransformer() {
  return Transform(({ value }) => {
    if (!value) return value;
    
    if (typeof value !== 'string') {
      return value;
    }

    // Transform the date format
    const transformedValue = transformDateFormat(value);
    
    // Additional validation for birth dates
    if (transformedValue && typeof transformedValue === 'string') {
      // Check if the date is valid
      const date = new Date(transformedValue);
      if (isNaN(date.getTime())) {
        throw new BadRequestException(`Invalid date format: ${value}. Please use YYYY/MM/DD, YYYY-MM-DD, DD/MM/YYYY, or DD-MM-YYYY format.`);
      }
      
      // Check if date is not in future (for birth dates)
      const today = getCurrentSriLankaTime();
      if (date > today) {
        throw new BadRequestException(`Date of birth cannot be in the future: ${transformedValue}`);
      }
      
      // Check if date is reasonable (not too old)
      const hundredYearsAgo = getCurrentSriLankaTime();
      hundredYearsAgo.setFullYear(hundredYearsAgo.getFullYear() - 100);
      if (date < hundredYearsAgo) {
        throw new BadRequestException(`Date of birth cannot be more than 100 years ago: ${transformedValue}`);
      }
    }
    
    return transformedValue;
  });
}
