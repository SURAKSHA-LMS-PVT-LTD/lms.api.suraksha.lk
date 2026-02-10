import { IsString, IsNotEmpty, IsOptional, MinLength, MaxLength, Matches, Validate, ValidatorConstraint, ValidatorConstraintInterface, ValidationArguments } from 'class-validator';
import { ApiProperty, ApiExtraModels } from '@nestjs/swagger';
import { IsStrongPassword, IsPasswordMatch } from '../../common/validators/password.validator';

/**
 * 🔐 Change Password DTO
 * Validates password change requests with security requirements
 */
@ApiExtraModels()
export class ChangePasswordDto {
  @ApiProperty({
    description: 'Current password for verification',
    example: 'currentPassword123!',
    minLength: 1,
    maxLength: 128,
  })
  @IsString({ message: 'Current password must be a string' })
  @IsNotEmpty({ message: 'Current password is required' })
  @MaxLength(128, { message: 'Current password is too long' })
  currentPassword: string;

  @ApiProperty({
    description: 'New password (8-128 characters, must contain uppercase, lowercase, number and special character)',
    example: 'NewSecure123!',
    minLength: 8,
    maxLength: 128,
  })
  @IsString({ message: 'New password must be a string' })
  @IsNotEmpty({ message: 'New password is required' })
  @IsStrongPassword({ 
    message: 'Password must be 8-128 characters and contain at least one uppercase letter, one lowercase letter, one number, and one special character (@$!%*?&)' 
  })
  newPassword: string;

  @ApiProperty({
    description: 'Confirm new password (must match new password)',
    example: 'NewSecure123!',
    minLength: 8,
    maxLength: 128,
  })
  @IsString({ message: 'Password confirmation must be a string' })
  @IsNotEmpty({ message: 'Password confirmation is required' })
  @IsPasswordMatch('newPassword', { message: 'Password confirmation must match the new password' })
  confirmNewPassword: string;

  // Legacy: accept "confirmPassword" as alias
  @IsOptional()
  @IsString()
  confirmPassword?: string;
}
