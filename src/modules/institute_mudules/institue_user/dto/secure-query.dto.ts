import { IsOptional, IsString, IsEnum, IsNumberString, MinLength, MaxLength, Matches, IsIn } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { UserType } from '../../../user/enums/user-type.enum';
import { IsBigIntId, IsOptionalBigIntId } from '../../../../common/validators/bigint-id.validator';

/**
 * Query DTO for secure user endpoints with comprehensive validation and sanitization
 * Prevents SQL injection and other security vulnerabilities
 */
export class SecureUserQueryDto {
  @ApiPropertyOptional({
    description: 'Page number for pagination',
    example: 1,
    minimum: 1
  })
  @IsOptional()
  @IsNumberString({}, { message: 'Page must be a valid number' })
  @Transform(({ value }) => {
    const num = parseInt(value);
    return isNaN(num) || num < 1 ? '1' : Math.min(num, 1000).toString(); // Max 1000 pages
  })
  page?: string = '1';

  @ApiPropertyOptional({
    description: 'Number of items per page (max 50)',
    example: 10,
    minimum: 1,
    maximum: 50
  })
  @IsOptional()
  @IsNumberString({}, { message: 'Limit must be a valid number' })
  @Transform(({ value }) => {
    const num = parseInt(value);
    return isNaN(num) || num < 1 ? '10' : Math.min(num, 50).toString(); // Max 50 items
  })
  limit?: string = '10';

  @ApiPropertyOptional({
    description: 'Search by name or email (alphanumeric and basic punctuation only)',
    example: 'john doe',
    minLength: 2,
    maxLength: 100
  })
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Search term must be at least 2 characters' })
  @MaxLength(100, { message: 'Search term cannot exceed 100 characters' })
  @Matches(/^[a-zA-Z0-9\s@._-]+$/, {
    message: 'Search term contains invalid characters. Only letters, numbers, spaces, @, ., _, - are allowed'
  })
  @Transform(({ value }) => {
    if (!value) return undefined;
    // Sanitize input by removing potential SQL injection characters
    return value.toString().trim().replace(/['"`;\\]/g, '');
  })
  search?: string;

  @ApiPropertyOptional({
    description: 'Filter by active status',
    example: true
  })
  @IsOptional()
  @IsIn(['true', 'false'], { message: 'isActive must be true or false' })
  @Transform(({ value }) => {
    if (value === 'true') return 'true';
    if (value === 'false') return 'false';
    return undefined;
  })
  isActive?: string;

  @ApiPropertyOptional({
    description: 'Sort field',
    enum: ['createdAt', 'name', 'email', 'dateOfBirth'],
    example: 'createdAt'
  })
  @IsOptional()
  @IsIn(['createdAt', 'name', 'email', 'dateOfBirth'], {
    message: 'Sort field must be one of: createdAt, name, email, dateOfBirth'
  })
  sortBy?: string = 'createdAt';

  @ApiPropertyOptional({
    description: 'Sort order',
    enum: ['ASC', 'DESC'],
    example: 'DESC'
  })
  @IsOptional()
  @IsIn(['ASC', 'DESC'], { message: 'Sort order must be ASC or DESC' })
  sortOrder?: 'ASC' | 'DESC' = 'DESC';

  @ApiPropertyOptional({
    description: 'Include parent details in response (only for STUDENT user type)',
    example: true
  })
  @IsOptional()
  @IsIn(['true', 'false'], { message: 'parent must be true or false' })
  @Transform(({ value }) => {
    if (value === 'true') return 'true';
    if (value === 'false') return 'false';
    return undefined;
  })
  parent?: string;

  @ApiPropertyOptional({
    description: 'Include student details in response (only for PARENT user type)',
    example: true
  })
  @IsOptional()
  @IsIn(['true', 'false'], { message: 'students must be true or false' })
  @Transform(({ value }) => {
    if (value === 'true') return 'true';
    if (value === 'false') return 'false';
    return undefined;
  })
  students?: string;

  @ApiPropertyOptional({
    description: 'Filter by image verification status',
    example: true
  })
  @IsOptional()
  @IsIn(['true', 'false'], { message: 'isVerified must be true or false' })
  @Transform(({ value }) => {
    if (value === 'true') return 'true';
    if (value === 'false') return 'false';
    return undefined;
  })
  isVerified?: string;

  @ApiPropertyOptional({
    description: 'Filter by occupation (for PARENT user type)',
    example: 'Engineer',
    minLength: 2,
    maxLength: 100
  })
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Occupation must be at least 2 characters' })
  @MaxLength(100, { message: 'Occupation cannot exceed 100 characters' })
  @Matches(/^[a-zA-Z0-9\s,._-]+$/, {
    message: 'Occupation contains invalid characters. Only letters, numbers, spaces, and basic punctuation allowed'
  })
  @Transform(({ value }) => {
    if (!value) return undefined;
    return value.toString().trim().replace(/['"`;\\]/g, '');
  })
  occupation?: string;

  @ApiPropertyOptional({
    description: 'Filter by workplace (for PARENT user type)',
    example: 'Tech Company Ltd',
    minLength: 2,
    maxLength: 100
  })
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Workplace must be at least 2 characters' })
  @MaxLength(100, { message: 'Workplace cannot exceed 100 characters' })
  @Matches(/^[a-zA-Z0-9\s,._-]+$/, {
    message: 'Workplace contains invalid characters. Only letters, numbers, spaces, and basic punctuation allowed'
  })
  @Transform(({ value }) => {
    if (!value) return undefined;
    return value.toString().trim().replace(/['"`;\\]/g, '');
  })
  workplace?: string;

  // =================== STUDENT-SPECIFIC FILTERS ===================
  
  @ApiPropertyOptional({
    description: 'Filter by student ID (for STUDENT user type)',
    example: 'STU2024001',
    minLength: 2,
    maxLength: 50
  })
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Student ID must be at least 2 characters' })
  @MaxLength(50, { message: 'Student ID cannot exceed 50 characters' })
  @Matches(/^[a-zA-Z0-9_-]+$/, {
    message: 'Student ID contains invalid characters. Only letters, numbers, underscore, and hyphen allowed'
  })
  @Transform(({ value }) => {
    if (!value) return undefined;
    return value.toString().trim().replace(/['"`;\\]/g, '');
  })
  studentId?: string;

  @ApiPropertyOptional({
    description: 'Filter by emergency contact number (for STUDENT user type)',
    example: '+94771234567',
    minLength: 10,
    maxLength: 15
  })
  @IsOptional()
  @IsString()
  @MinLength(10, { message: 'Emergency contact must be at least 10 characters' })
  @MaxLength(15, { message: 'Emergency contact cannot exceed 15 characters' })
  @Matches(/^\+?[0-9\s-]+$/, {
    message: 'Emergency contact contains invalid characters. Only numbers, +, spaces, and hyphens allowed'
  })
  @Transform(({ value }) => {
    if (!value) return undefined;
    return value.toString().trim().replace(/['"`;\\]/g, '');
  })
  emergencyContact?: string;

  @ApiPropertyOptional({
    description: 'Filter students with medical conditions (for STUDENT user type)',
    example: 'true'
  })
  @IsOptional()
  @IsIn(['true', 'false'], { message: 'hasMedicalConditions must be true or false' })
  @Transform(({ value }) => {
    if (value === 'true') return 'true';
    if (value === 'false') return 'false';
    return undefined;
  })
  hasMedicalConditions?: string;

  @ApiPropertyOptional({
    description: 'Filter students with allergies (for STUDENT user type)',
    example: 'true'
  })
  @IsOptional()
  @IsIn(['true', 'false'], { message: 'hasAllergies must be true or false' })
  @Transform(({ value }) => {
    if (value === 'true') return 'true';
    if (value === 'false') return 'false';
    return undefined;
  })
  hasAllergies?: string;

  @ApiPropertyOptional({
    description: 'Filter by gender (for all user types)',
    example: 'MALE',
    enum: ['MALE', 'FEMALE', 'OTHER']
  })
  @IsOptional()
  @IsIn(['MALE', 'FEMALE', 'OTHER'], { message: 'Gender must be MALE, FEMALE, or OTHER' })
  gender?: string;

  @ApiPropertyOptional({
    description: 'Filter by minimum age (for all user types)',
    example: 18,
    minimum: 1,
    maximum: 100
  })
  @IsOptional()
  @IsNumberString({}, { message: 'minAge must be a valid number' })
  @Transform(({ value }) => {
    const num = parseInt(value);
    return isNaN(num) || num < 1 ? undefined : Math.min(num, 100).toString();
  })
  minAge?: string;

  @ApiPropertyOptional({
    description: 'Filter by maximum age (for all user types)',
    example: 25,
    minimum: 1,
    maximum: 100
  })
  @IsOptional()
  @IsNumberString({}, { message: 'maxAge must be a valid number' })
  @Transform(({ value }) => {
    const num = parseInt(value);
    return isNaN(num) || num < 1 ? undefined : Math.min(num, 100).toString();
  })
  maxAge?: string;

  @ApiPropertyOptional({
    description: 'Filter by city/address (for all user types)',
    example: 'Colombo',
    minLength: 2,
    maxLength: 100
  })
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'City must be at least 2 characters' })
  @MaxLength(100, { message: 'City cannot exceed 100 characters' })
  @Matches(/^[a-zA-Z0-9\s,._-]+$/, {
    message: 'City contains invalid characters'
  })
  @Transform(({ value }) => {
    if (!value) return undefined;
    return value.toString().trim().replace(/['"`;\\]/g, '');
  })
  city?: string;

  @ApiPropertyOptional({
    description: 'Filter by assigned house ID within institute users',
    example: '12'
  })
  @IsOptional()
  @IsOptionalBigIntId({ message: 'houseId must be a valid positive numeric ID' })
  @Transform(({ value }) => {
    if (value === null || value === undefined || value === '') return undefined;
    return String(value).trim();
  })
  houseId?: string;
}

/**
 * Query DTO for class-specific endpoints
 */
export class SecureClassUserQueryDto extends SecureUserQueryDto {
}

/**
 * Query DTO for subject-specific endpoints
 */
export class SecureSubjectUserQueryDto extends SecureClassUserQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by enrollment date range start',
    example: '2024-01-01'
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'enrolledAfter must be in YYYY-MM-DD format' })
  enrolledAfter?: string;

  @ApiPropertyOptional({
    description: 'Filter by enrollment date range end',
    example: '2024-12-31'
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'enrolledBefore must be in YYYY-MM-DD format' })
  enrolledBefore?: string;
}
