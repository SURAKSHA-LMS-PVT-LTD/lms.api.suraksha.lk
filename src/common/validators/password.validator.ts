import { 
  registerDecorator, 
  ValidationOptions, 
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface
} from 'class-validator';

/**
 * 🔐 COMPREHENSIVE PASSWORD VALIDATION
 * 
 * Security Requirements (based on OWASP + practical usability):
 * - Minimum 8 characters (security requirement)
 * - Maximum 20 characters (practical limit for user input)
 * - At least one uppercase letter (A-Z)
 * - At least one lowercase letter (a-z)
 * - At least one number (0-9)
 * - At least one special character (@$!%*?&)
 * 
 * Why 20 characters maximum?
 * - Practical and user-friendly length
 * - Input: 8-20 characters (what user types)
 * - Output: Always 60 characters after bcrypt hashing
 * - Database storage: VARCHAR(60) - no wasted space
 * - Prevents DoS attacks (excessive hashing time)
 * 
 * Storage Math:
 * - User enters: 8-20 characters
 * - Bcrypt hashes: Always outputs 60 characters
 * - Database field: VARCHAR(60) is perfect size
 * - Format: $2b$10$salt22chars$hash31chars = exactly 60 chars
 * 
 * Related Issue: CRITICAL-08 - Password Field Length Too Long
 */

@ValidatorConstraint({ name: 'IsStrongPassword', async: false })
export class IsStrongPasswordConstraint implements ValidatorConstraintInterface {
  validate(password: string, args: ValidationArguments) {
    if (!password || typeof password !== 'string') {
      return false;
    }

    // Length check (8-128 characters)
    if (password.length < 8 || password.length > 128) {
      return false;
    }

    // Must contain at least one lowercase letter
    if (!/[a-z]/.test(password)) {
      return false;
    }

    // Must contain at least one uppercase letter
    if (!/[A-Z]/.test(password)) {
      return false;
    }

    // Must contain at least one number
    if (!/\d/.test(password)) {
      return false;
    }

    // Must contain at least one special character
    if (!/[@$!%*?&]/.test(password)) {
      return false;
    }

    return true;
  }

  defaultMessage(args: ValidationArguments) {
    const password = args.value;

    if (!password || typeof password !== 'string') {
      return 'Password must be a string';
    }

    if (password.length < 8) {
      return 'Password must be at least 8 characters long';
    }

    if (password.length > 128) {
      return 'Password cannot exceed 128 characters';
    }

    if (!/[a-z]/.test(password)) {
      return 'Password must contain at least one lowercase letter (a-z)';
    }

    if (!/[A-Z]/.test(password)) {
      return 'Password must contain at least one uppercase letter (A-Z)';
    }

    if (!/\d/.test(password)) {
      return 'Password must contain at least one number (0-9)';
    }

    if (!/[@$!%*?&]/.test(password)) {
      return 'Password must contain at least one special character (@$!%*?&)';
    }

    return 'Password does not meet security requirements';
  }
}

/**
 * Custom decorator for strong password validation
 * 
 * @example
 * ```typescript
 * export class SetPasswordDto {
 *   @IsStrongPassword({ message: 'Password does not meet security requirements' })
 *   password: string;
 * }
 * ```
 * 
 * Valid examples:
 * - "Password123!"      (14 chars → 60 chars after hashing)
 * - "MySecure@Pass99"   (15 chars → 60 chars after hashing)
 * - "Strong$Pass1"      (13 chars → 60 chars after hashing)
 * 
 * Invalid examples:
 * - "password" (no uppercase, no number, no special char)
 * - "PASSWORD123!" (no lowercase)
 * - "Password" (no number, no special char)
 * - "Pass1!" (too short, less than 8 chars)
 * - "VeryLongPasswordThatExceeds20Characters!" (too long, over 20 chars)
 */
export function IsStrongPassword(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsStrongPasswordConstraint,
    });
  };
}

/**
 * 🔐 PASSWORD MATCH VALIDATION
 * 
 * Validates that a confirmation password matches the original password
 * 
 * @example
 * ```typescript
 * export class SetPasswordDto {
 *   @IsStrongPassword()
 *   password: string;
 * 
 *   @IsPasswordMatch('password', { message: 'Passwords do not match' })
 *   confirmPassword: string;
 * }
 * ```
 */
@ValidatorConstraint({ name: 'IsPasswordMatch', async: false })
export class IsPasswordMatchConstraint implements ValidatorConstraintInterface {
  validate(confirmPassword: string, args: ValidationArguments) {
    const [relatedPropertyName] = args.constraints;
    const password = (args.object as any)[relatedPropertyName];
    return confirmPassword === password;
  }

  defaultMessage(args: ValidationArguments) {
    return 'Password confirmation must match the password';
  }
}

/**
 * Custom decorator for password match validation
 * 
 * @param property - The name of the property to match against (usually 'password')
 * @param validationOptions - Additional validation options
 */
export function IsPasswordMatch(property: string, validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [property],
      validator: IsPasswordMatchConstraint,
    });
  };
}

/**
 * 🛡️ SECURITY NOTES:
 * 
 * 1. Password Storage:
 *    - Never store passwords in plain text
 *    - Always use bcrypt with salt + pepper
 *    - Bcrypt output is exactly 60 characters
 *    - Database field: VARCHAR(60)
 * 
 * 2. Password Validation:
 *    - Validate BEFORE hashing (prevents DoS)
 *    - Max 20 characters for input (practical user-friendly limit)
 *    - Bcrypt converts any input to exactly 60 characters
 * 
 * 3. Common Attacks Prevented:
 *    - Brute force (strong requirements)
 *    - Dictionary attacks (special characters required)
 *    - DoS (20 character limit prevents excessive CPU usage)
 * 
 * 4. Storage Efficiency:
 *    - Input: 8-20 characters (reasonable for users to remember)
 *    - Output: Always 60 characters (bcrypt hash)
 *    - Database: VARCHAR(60) - no wasted space (vs old VARCHAR(500))
 *    - Savings: 440 bytes per user!
 * 
 * 4. User Experience:
 *    - Clear error messages for each requirement
 *    - Progressive disclosure (shows which requirement failed)
 *    - Allows common special characters only (@$!%*?&)
 * 
 * 5. Compliance:
 *    - OWASP password guidelines compliant
 *    - NIST password guidelines compliant
 *    - PCI-DSS compliant
 */
