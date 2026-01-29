import { registerDecorator, ValidationOptions, ValidatorConstraint, ValidatorConstraintInterface } from 'class-validator';
import { Transform } from 'class-transformer';
import { getCurrentSriLankaTime } from '../utils/timezone.util';

@ValidatorConstraint({ async: false })
export class IsDateFormatConstraint implements ValidatorConstraintInterface {
  validate(value: any): boolean {
    if (!value) return true; // Allow optional fields
    
    // Check if the value is a string and matches yyyy-MM-dd format
    if (typeof value !== 'string') return false;
    
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(value)) return false;
    
    // Validate that it's a real date
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    
    return (
      date.getFullYear() === year &&
      date.getMonth() === month - 1 &&
      date.getDate() === day
    );
  }

  defaultMessage(): string {
    return 'Date must be in yyyy-MM-dd format and be a valid date';
  }
}

// Enhanced date validator that can handle multiple formats and convert them
@ValidatorConstraint({ async: false })
export class IsFlexibleDateConstraint implements ValidatorConstraintInterface {
  validate(value: any): boolean {
    if (!value) return true; // Allow optional fields
    
    // If it's already in yyyy-MM-dd format, validate normally
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return this.validateYMDDate(value);
    }
    
    // Try to parse and convert various formats
    const convertedDate = this.convertToYMDFormat(value);
    if (!convertedDate) return false;
    
    return this.validateYMDDate(convertedDate);
  }

  private validateYMDDate(dateString: string): boolean {
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    
    // Check if it's a valid date
    const isValidDate = (
      date.getFullYear() === year &&
      date.getMonth() === month - 1 &&
      date.getDate() === day
    );
    
    if (!isValidDate) return false;
    
    // Check if date is not in the future
    const today = getCurrentSriLankaTime();
    today.setHours(0, 0, 0, 0);
    
    if (date > today) return false;
    
    // Check if person is not too old (150 years)
    const maxAge = getCurrentSriLankaTime();
    maxAge.setFullYear(maxAge.getFullYear() - 150);
    
    if (date < maxAge) return false;
    
    return true;
  }

  convertToYMDFormat(value: any): string | null {
    if (!value) return null;
    
    let dateString = String(value).trim();
    
    // Remove any extra whitespace
    dateString = dateString.replace(/\s+/g, ' ');
    
    // Pattern 1: dd/MM/yyyy or dd-MM-yyyy or dd.MM.yyyy
    const dmyPattern = /^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/;
    const dmyMatch = dateString.match(dmyPattern);
    if (dmyMatch) {
      const day = dmyMatch[1].padStart(2, '0');
      const month = dmyMatch[2].padStart(2, '0');
      const year = dmyMatch[3];
      return `${year}-${month}-${day}`;
    }
    
    // Pattern 2: yyyy/MM/dd or yyyy-MM-dd or yyyy.MM.dd
    const ymdPattern = /^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/;
    const ymdMatch = dateString.match(ymdPattern);
    if (ymdMatch) {
      const year = ymdMatch[1];
      const month = ymdMatch[2].padStart(2, '0');
      const day = ymdMatch[3].padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    
    // Pattern 3: dd MMM yyyy (e.g., 15 Jan 1990)
    const monthNames = {
      'jan': '01', 'january': '01',
      'feb': '02', 'february': '02',
      'mar': '03', 'march': '03',
      'apr': '04', 'april': '04',
      'may': '05',
      'jun': '06', 'june': '06',
      'jul': '07', 'july': '07',
      'aug': '08', 'august': '08',
      'sep': '09', 'september': '09',
      'oct': '10', 'october': '10',
      'nov': '11', 'november': '11',
      'dec': '12', 'december': '12'
    };
    
    const textDatePattern = /^(\d{1,2})\s+([a-zA-Z]+)\s+(\d{4})$/;
    const textMatch = dateString.toLowerCase().match(textDatePattern);
    if (textMatch) {
      const day = textMatch[1].padStart(2, '0');
      const monthText = textMatch[2].toLowerCase();
      const year = textMatch[3];
      const month = monthNames[monthText];
      if (month) {
        return `${year}-${month}-${day}`;
      }
    }
    
    // Pattern 4: ISO Date string (with time)
    const isoPattern = /^(\d{4}-\d{2}-\d{2})/;
    const isoMatch = dateString.match(isoPattern);
    if (isoMatch) {
      return isoMatch[1];
    }
    
    // Try to parse as Date object
    try {
      const date = new Date(dateString);
      if (!isNaN(date.getTime())) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      }
    } catch (error) {
      // Ignore parsing errors
    }
    
    return null;
  }

  defaultMessage(): string {
    return 'Date must be in a valid format and be a valid date';
  }
}

export function IsDateFormat(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsDateFormatConstraint,
    });
  };
}

// Transform decorator to convert various date formats to yyyy-MM-dd
export function TransformToYMDDate() {
  return Transform(({ value }) => {
    if (!value) return value;
    
    const converter = new IsFlexibleDateConstraint();
    const converted = converter.convertToYMDFormat(value);
    return converted || value;
  });
}

// Enhanced date of birth validator with flexible input
export function IsDateOfBirth(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: {
        message: 'Date of birth must be in yyyy-MM-dd format (e.g., 1990-05-15)',
        ...validationOptions
      },
      constraints: [],
      validator: IsFlexibleDateConstraint,
    });
  };
}

// Flexible date validator decorator
export function IsFlexibleDate(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsFlexibleDateConstraint,
    });
  };
}

// Utility function to convert yyyy-MM-dd string to Date object
export function parseDate(dateString: string): Date | null {
  if (!dateString) return null;
  
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(dateString)) return null;
  
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
}

// Utility function to convert Date object to yyyy-MM-dd string
export function formatDate(date: Date): string | null {
  if (!date) return null;
  
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
}

// Utility function to convert any date format to yyyy-MM-dd
export function convertDateToYMD(dateInput: any): string | null {
  const converter = new IsFlexibleDateConstraint();
  return converter.convertToYMDFormat(dateInput);
}

// Utility function to parse flexible date formats
export function parseFlexibleDate(dateString: string): Date | null {
  const ymdDate = convertDateToYMD(dateString);
  if (!ymdDate) return null;
  
  const [year, month, day] = ymdDate.split('-').map(Number);
  return new Date(year, month - 1, day);
}
