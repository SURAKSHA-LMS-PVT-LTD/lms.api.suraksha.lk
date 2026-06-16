import * as crypto from 'crypto';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';
import { ParseIdPipe } from '../../common/pipes/parse-id.pipe';
import { EmailDto, EmailOtpVerifyDto, PhoneNumberDto, PhoneOtpVerifyDto, RejectReasonDto, FileUploadRequestDto, ImageUrlDto } from '../../common/dto/common-body.dto';
import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseInterceptors,
  ClassSerializerInterceptor,
  HttpStatus,
  HttpCode,
  ValidationPipe,
  UseGuards,
  Request,
  ForbiddenException,
  NotFoundException,
  UploadedFile,
  UploadedFiles,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { 
  ApiTags, 
  ApiOperation, 
  ApiResponse, 
  ApiQuery, 
  ApiBearerAuth, 
  ApiBody, 
  ApiParam,
  ApiSecurity,
  ApiConsumes 
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ApiKeyOrJwtGuard } from '../../auth/guards/api-key-or-jwt.guard';
import { FlexibleAccessGuard } from '../../auth/guards/flexible-access.guard';
import { OriginValidationGuard } from '../../common/guards/origin-validation.guard';
import { RequireAnyOfRoles } from '../../auth/decorators/flexible-access.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { CloudStorageService } from '../../common/services/cloud-storage.service';
import { UserManagementService } from '../../common/services/cache-user-management.service';
import { CacheService } from '../../common/services/cache.service';
import { UserNotificationService } from './services/user-notification.service';
import { UsersService } from './user.service';
import { CreateUserDto } from './dto/create-user.dto';
import { nowTimestamp } from '../../common/utils/timezone.util';
import { CreateUserComprehensiveDto } from './dto/create-user-comprehensive.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpgradeUserTypeDto } from './dto/upgrade-user-type.dto';
import { UpdateImageUrlDto } from './dto/update-image-url.dto';
import { QueryUserDto } from './dto/query-user.dto';
import { AdvancedSearchUserDto } from './dto/advanced-search-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { PaginatedUserResponseDto } from './dto/paginated-user-response.dto';
import { RegisterRfidDto, RegisterRfidResponseDto } from './dto/register-rfid.dto';
import { UserType } from './enums/user-type.enum';
import { Gender } from './enums/gender.enum';
import { InstituteUserResponseDto } from '../institute_mudules/institue_user/dto/institute-user-response.dto';
import { UserInstitutesResponseDto } from '../institute_mudules/institue_user/dto/user-institutes-response.dto';
import { JwtRequest } from '@common/interfaces/jwt-request.interface';
import { UpdateTelegramIdDto } from './dto/update-telegram-id.dto';
import { NoDataMasking } from '../../common/decorators/no-data-masking.decorator';

/**
 * Enhanced User Management Controller
 * 
 * This controller provides comprehensive user management functionality with:
 * - Role-based access control
 * - Enhanced security features
 * - Comprehensive API documentation
 * - Profile management
 * - Advanced search and filtering
 * - Institute type validation
 * 
 * @version 2.0.0
 * @author LAAS System
 */
@ApiTags('User Management')
@ApiBearerAuth()
@ApiSecurity('bearer')
@Controller('users')
@UseGuards(ApiKeyOrJwtGuard, OriginValidationGuard)
@UseInterceptors(ClassSerializerInterceptor)
export class UsersController {
  private readonly logger = new Logger(UsersController.name);
  
  constructor(
    private readonly usersService: UsersService,
    private readonly cloudStorageService: CloudStorageService,
    private readonly userManagementService: UserManagementService,
    private readonly cacheService: CacheService,
    private readonly userNotificationService: UserNotificationService,
  ) {}

  /**
   * ðŸš€ CREATE USER (Multi-Table Creation)
   * 
   * Advanced user creation endpoint that creates records across multiple tables
   * based on the userType:
   * 
   * **Creation Logic:**
   * - USER: Creates in users + students + parents tables (3 tables)
   * - USER_WITHOUT_PARENT: Creates in users + students tables (2 tables)
   * - USER_WITHOUT_STUDENT: Creates in users + parents tables (2 tables)
   * - SUPER_ADMIN, ORGANIZATION_MANAGER: Creates in users table only (1 table)
   * 
   * **Parent Linking:**
   * - Provide fatherId/motherId/guardianId directly, OR
   * - Provide fatherPhoneNumber/motherPhoneNumber/guardianPhoneNumber
   * - System will automatically fetch user IDs by phone numbers
   * 
   * **Authentication:**
   * - Option 1: JWT Bearer token (standard authentication)
   * - Option 2: Special API Key (from SPECIAL_API_KEY environment variable)
   *   - Use: Authorization: Bearer <SPECIAL_API_KEY>
   *   - Bypasses role-based access control
   *   - Allows external systems to create users
   * 
   * **Access Control (JWT only):**
   * - SUPERADMIN: Can create any user type
   * - ORGANIZATION_MANAGER: Can create users within their organization
   * - INSTITUTE_ADMIN: Can create users within their institute
   * - TEACHER: Can create users within their institute
   * 
   * @param dto - Comprehensive user data including student and parent information
   * @returns Created user with all related table data
   */
  @Public() // Bypass global JwtAuthGuard
  @Post('comprehensive')
  @UseGuards(ApiKeyOrJwtGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({ 
    global: [UserType.SUPERADMIN, UserType.ORGANIZATION_MANAGER],
    instituteAdmin: true,
    teacher: true
  })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ 
    summary: 'ðŸš€ Create comprehensive user with optional image (Multi-table creation) - Supports API Key',
    description: `Advanced user creation that automatically creates records in multiple tables based on userType.
    
    **ðŸ” Two Authentication Methods:**
    
    1ï¸âƒ£ **JWT Bearer Token (Standard):**
       - Authorization: Bearer <JWT_TOKEN>
       - Subject to role-based access control (SUPERADMIN, ORGANIZATION_MANAGER, INSTITUTE_ADMIN, TEACHER)
    
    2ï¸âƒ£ **Special API Key (External Systems):**
       - Authorization: Bearer <SPECIAL_API_KEY>
       - Use environment variable: SPECIAL_API_KEY
       - Bypasses all role checks - full access
       - Ideal for external integrations and automated systems
       - Generate secure key: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
    
    **ðŸ“Š Two Input Methods Supported:**
    
    1ï¸âƒ£ **JSON Request (with image URLs):**
       - Content-Type: application/json
       - Provide imageUrl and/or idUrl as strings in the JSON body
       - Example: { "firstName": "John", "imageUrl": "https://example.com/profile.jpg", "idUrl": "https://example.com/id.pdf" }
    
    2ï¸âƒ£ **Multipart/Form-Data (with file uploads):**
       - Content-Type: multipart/form-data
       - Upload files directly: 'image' field for profile image, 'idDocument' field for ID document
       - Supports: JPG, JPEG, PNG for images; PDF, JPG, JPEG, PNG for ID documents
       - Max size: 5MB per file
    
    **userType Behavior:**
    
    1. **USER** (Student with parent):
       - âœ… Creates user in users table
       - âœ… Creates student record in students table
       - âœ… Creates parent record in parents table
       - âœ… Links parent to student automatically
       - ðŸ“‹ Required fields: All user fields + studentData + parentData
    
    2. **USER_WITHOUT_PARENT** (Student only):
       - âœ… Creates user in users table
       - âœ… Creates student record in students table
       - ðŸ“‹ Required fields: All user fields + studentData
    
    3. **USER_WITHOUT_STUDENT** (Parent only):
       - âœ… Creates user in users table
       - âœ… Creates parent record in parents table
       - ðŸ“‹ Required fields: All user fields + parentData
    
    4. **SUPER_ADMIN / ORGANIZATION_MANAGER**:
       - âœ… Creates user in users table only
       - ðŸ“‹ Required fields: All user fields
    
    **Response includes:**
    - Created user data
    - Created student data (if applicable)
    - Created parent data (if applicable)
    - Summary of tables affected`
  })
  @ApiBody({ 
    description: 'Comprehensive user creation data',
    schema: {
      type: 'object',
      required: ['firstName', 'lastName', 'email', 'phoneNumber', 'userType', 'gender', 'district', 'province', 'country'],
      properties: {
        firstName: { type: 'string', example: 'John' },
        lastName: { type: 'string', example: 'Doe' },
        email: { type: 'string', example: 'john.doe@example.com' },
        phoneNumber: { type: 'string', example: '+94771234567' },
        userType: { 
          type: 'string', 
          enum: ['SUPER_ADMIN', 'ORGANIZATION_MANAGER', 'USER', 'USER_WITHOUT_PARENT', 'USER_WITHOUT_STUDENT'],
          example: 'USER'
        },
        gender: { type: 'string', enum: ['MALE', 'FEMALE', 'OTHER'], example: 'MALE' },
        dateOfBirth: { type: 'string', example: '1995-05-15' },
        nic: { type: 'string', example: '199512345678' },
        birthCertificateNo: { type: 'string', example: 'BC-123456789' },
        addressLine1: { type: 'string', example: '123 Main Street' },
        addressLine2: { type: 'string', example: 'Apartment 4B' },
        city: { type: 'string', example: 'Colombo' },
        district: { type: 'string', enum: ['COLOMBO', 'GAMPAHA', 'KALUTARA'], example: 'COLOMBO' },
        province: { type: 'string', enum: ['WESTERN', 'CENTRAL', 'SOUTHERN'], example: 'WESTERN' },
        postalCode: { type: 'string', example: '00100' },
        country: { type: 'string', example: 'Sri Lanka' },
        imageUrl: { 
          type: 'string', 
          description: 'ðŸ–¼ï¸ Profile image URL (for JSON requests)', 
          example: 'https://example.com/images/profile.jpg' 
        },
        idUrl: { 
          type: 'string', 
          description: 'ðŸ“„ ID document URL (for JSON requests)', 
          example: 'https://example.com/documents/id-card.pdf' 
        },
        isActive: { type: 'boolean', default: true },
        studentData: {
          type: 'object',
          description: 'Required if userType is USER or USER_WITHOUT_PARENT',
          properties: {
            studentId: { type: 'string', example: 'STU-2024-001' },
            emergencyContact: { type: 'string', example: '+94771234567' },
            medicalConditions: { type: 'string', example: 'Asthma' },
            allergies: { type: 'string', example: 'Peanuts' },
            bloodGroup: { type: 'string', enum: ['A_POSITIVE', 'A_NEGATIVE', 'B_POSITIVE', 'B_NEGATIVE', 'O_POSITIVE', 'O_NEGATIVE', 'AB_POSITIVE', 'AB_NEGATIVE'], example: 'O_POSITIVE' },
            fatherId: { type: 'string', description: 'User ID of existing father (optional)', example: 'b5e1e2f8-4a6b-4c1d-8e9f-3a2b1c4d5e6f' },
            fatherPhoneNumber: { type: 'string', description: 'Phone number to fetch father user (optional)', example: '+94771234567' },
            motherId: { type: 'string', description: 'User ID of existing mother (optional)', example: 'c6f2f3g9-5b7c-5d2e-9f0g-4b3c2d5e6f7g' },
            motherPhoneNumber: { type: 'string', description: 'Phone number to fetch mother user (optional)', example: '+94777654321' },
            guardianId: { type: 'string', description: 'User ID of existing guardian (optional)', example: 'd7g3g4h0-6c8d-6e3f-0g1h-5c4d3e6f7g8h' },
            guardianPhoneNumber: { type: 'string', description: 'Phone number to fetch guardian user (optional)', example: '+94773333333' }
          }
        },
        parentData: {
          type: 'object',
          description: 'Required if userType is USER or USER_WITHOUT_STUDENT',
          properties: {
            occupation: { type: 'string', example: 'ENGINEER' },
            workplace: { type: 'string', example: 'ABC Corporation' },
            workPhone: { type: 'string', example: '+94112345678' },
            educationLevel: { type: 'string', example: 'Bachelor of Engineering' }
          }
        }
      }
    }
  })
  @ApiResponse({ 
    status: HttpStatus.CREATED, 
    description: 'User created successfully across all applicable tables',
    schema: {
      type: 'object',
      properties: {
        user: {
          type: 'object',
          properties: {
            id: { type: 'string', example: '123' },
            firstName: { type: 'string', example: 'John' },
            lastName: { type: 'string', example: 'Doe' },
            email: { type: 'string', example: 'jo***e@example.com' },
            phoneNumber: { type: 'string', example: '+947*****567' },
            userType: { type: 'string', example: 'USER' },
            gender: { type: 'string', example: 'MALE' },
            isActive: { type: 'boolean', example: true },
            createdAt: { type: 'string', example: '2024-01-15T10:30:00Z' },
            subscriptionPlan: { type: 'string', example: 'FREE' }
          }
        },
        student: {
          type: 'object',
          nullable: true,
          properties: {
            userId: { type: 'string', example: '123' },
            studentId: { type: 'string', example: 'STU-2024-001' },
            emergencyContact: { type: 'string', example: '+94771234567' },
            medicalConditions: { type: 'string', example: 'Asthma' },
            bloodGroup: { type: 'string', example: 'O_POSITIVE' }
          }
        },
        parent: {
          type: 'object',
          nullable: true,
          properties: {
            id: { type: 'string', example: '456' },
            userId: { type: 'string', example: '123' },
            occupation: { type: 'string', example: 'ENGINEER' },
            workplace: { type: 'string', example: 'ABC Corporation' },
            workPhone: { type: 'string', example: '+94112345678' }
          }
        },
        summary: {
          type: 'object',
          properties: {
            tablesCreated: { type: 'array', items: { type: 'string' }, example: ['users', 'students', 'parents'] },
            userType: { type: 'string', example: 'USER' },
            totalTablesAffected: { type: 'number', example: 3 }
          }
        }
      }
    }
  })
  @ApiResponse({ 
    status: HttpStatus.BAD_REQUEST, 
    description: 'Invalid data - Missing required fields or validation error',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 400 },
        message: { type: 'string', example: 'Validation failed' },
        errors: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              field: { type: 'string', example: 'studentData' },
              message: { type: 'string', example: 'studentData is required for USER type' }
            }
          }
        }
      }
    }
  })
  @ApiResponse({ 
    status: HttpStatus.CONFLICT, 
    description: 'User already exists - Duplicate email, phone, or NIC',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 409 },
        message: { type: 'string', example: 'Email already exists' },
        error: { type: 'string', example: 'Conflict' }
      }
    }
  })
  @ApiResponse({ 
    status: HttpStatus.FORBIDDEN, 
    description: 'Insufficient permissions',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 403 },
        message: { type: 'string', example: 'Insufficient permissions to create user' },
        error: { type: 'string', example: 'Forbidden' }
      }
    }
  })
  @ApiConsumes('application/json')
  async createComprehensive(
    @Body() dto: any,
    @Request() req?: JwtRequest
  ): Promise<any> {
    const requestId = `req_${nowTimestamp()}_${crypto.randomBytes(6).toString('base64url')}`;
    
    try {
      // ðŸ›¡ï¸ CRITICAL VALIDATION: Check if dto exists
      if (!dto || typeof dto !== 'object') {
        throw new BadRequestException('Invalid request body - expected object with user data');
      }

      // ðŸ›¡ï¸ CRITICAL VALIDATION: Required fields check
      if (!dto.email || typeof dto.email !== 'string' || dto.email.trim() === '') {
        throw new BadRequestException('Email is required and must be a valid string');
      }
      
      if (!dto.firstName || typeof dto.firstName !== 'string' || dto.firstName.trim() === '') {
        throw new BadRequestException('First name is required and must be a valid string');
      }
      
      if (!dto.userType || typeof dto.userType !== 'string') {
        throw new BadRequestException('User type is required and must be a valid string');
      }
      
      // Validate userType is one of the allowed values
      const validUserTypes = ['USER', 'USER_WITHOUT_PARENT', 'USER_WITHOUT_STUDENT', 'INSTITUTE_USER'];
      if (!validUserTypes.includes(dto.userType)) {
        throw new BadRequestException(`Invalid userType. Must be one of: ${validUserTypes.join(', ')}`);
      }
      
      const currentUser = req?.user;

    // ðŸ”’ SECURITY: Whitelist allowed top-level fields to prevent mass assignment
    const allowedFields = [
      'email', 'firstName', 'lastName', 'nameWithInitials', 'userType', 'password',
      'phoneNumber', 'dateOfBirth', 'gender', 'address', 'city', 'district', 'province',
      'profileImage', 'isActive', 'parentInfo', 'studentInfo', 'instituteAssignment',
      'birthCertificateNumber', 'nicNumber', 'school', 'medium', 'stream'
    ];
    const sanitizedDto: Record<string, any> = {};
    for (const key of allowedFields) {
      if (dto[key] !== undefined) {
        sanitizedDto[key] = dto[key];
      }
    }
    // Use sanitized DTO from here on
    const originalDto = dto;
    dto = sanitizedDto;
    
    // ðŸ”§ Transform flat form-data into nested structure
    // Form-data sends all fields flat, so we need to organize them
    
    // Helper function to clean empty strings to null or undefined
    const cleanField = (value: any): any => {
      try {
        // Handle explicit null/undefined/empty string values
        if (value === '' || value === null || value === undefined || value === 'null' || value === 'undefined') {
          return undefined; // undefined so it won't be saved to DB
        }
        if (typeof value === 'string') {
          const trimmed = value.trim();
          // Return undefined for empty strings after trimming
          return trimmed === '' ? undefined : trimmed;
        }
        // For booleans, numbers, etc., return as-is
        return value;
      } catch (error) {
        this.logger.warn(`[${requestId}] Failed to clean field value, returning undefined: ${error.message}`);
        return undefined;
      }
    };
    
    // Helper to recursively clean all fields in an object
    const cleanObject = (obj: any): any => {
      if (!obj || typeof obj !== 'object') return obj;
      const cleaned: any = {};
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          cleaned[key] = cleanField(obj[key]);
        }
      }
      return cleaned;
    };
    
    // ðŸ”§ CRITICAL: Clean firstName and lastName FIRST before using them
    dto.firstName = cleanField(dto.firstName);
    dto.lastName = cleanField(dto.lastName);
    
    // ðŸ”§ FIX: Clean and validate nameWithInitials - auto-generate if empty
    dto.nameWithInitials = cleanField(dto.nameWithInitials);
    if (!dto.nameWithInitials) {
      const firstName = dto.firstName || '';
      const lastName = dto.lastName || '';
      
      if (firstName && lastName) {
        // ðŸ”§ IMPROVED: Sri Lankan naming convention
        // "anura kumara" + "disse aiya kumara" -> "A.K.D.A. Kumara"
        // All words become initials EXCEPT the last word which is shown in full
        
        // Get all words from firstName and lastName
        const firstNameWords = firstName.split(/\s+/).filter(word => word.length > 0);
        const lastNameWords = lastName.split(/\s+/).filter(word => word.length > 0);
        
        // Generate initials from firstName
        const firstNameInitials = firstNameWords
          .map(word => word.charAt(0).toUpperCase() + '.')
          .join('');
        
        // Generate initials from lastName EXCEPT the last word
        const lastNameInitials = lastNameWords.slice(0, -1)
          .map(word => word.charAt(0).toUpperCase() + '.')
          .join('');
        
        // Get the last word of lastName in full (capitalized)
        const finalWord = lastNameWords[lastNameWords.length - 1];
        const capitalizedFinalWord = finalWord.charAt(0).toUpperCase() + finalWord.slice(1).toLowerCase();
        
        // Combine all parts
        const allInitials = firstNameInitials + lastNameInitials;
        dto.nameWithInitials = `${allInitials} ${capitalizedFinalWord}`;
        
        this.logger.log(
          `[${requestId}] ðŸ”§ AUTO-GENERATED nameWithInitials: "${dto.nameWithInitials}" from firstName "${firstName}" and lastName "${lastName}"`
        );
      } else if (firstName) {
        dto.nameWithInitials = firstName;
        this.logger.log(
          `[${requestId}] ðŸ”§ Using firstName as nameWithInitials: "${dto.nameWithInitials}"`
        );
      } else {
        throw new BadRequestException('nameWithInitials is empty and cannot be generated - firstName is required');
      }
    } else {
      this.logger.log(
        `[${requestId}] âœ… nameWithInitials received from request: "${dto.nameWithInitials}"`
      );
    }
    
    // ðŸ”§ Clean other main user fields - convert empty strings to undefined
    dto.email = cleanField(dto.email);
    dto.phoneNumber = cleanField(dto.phoneNumber);
    dto.nic = cleanField(dto.nic);
    dto.birthCertificateNo = cleanField(dto.birthCertificateNo);
    dto.dateOfBirth = cleanField(dto.dateOfBirth);
    dto.addressLine1 = cleanField(dto.addressLine1);
    dto.addressLine2 = cleanField(dto.addressLine2);
    dto.city = cleanField(dto.city);
    dto.postalCode = cleanField(dto.postalCode);
    dto.imageUrl = cleanField(dto.imageUrl);
    dto.idUrl = cleanField(dto.idUrl);
    dto.instituteId = cleanField(dto.instituteId);
    
    // ðŸ”§ FIX: Normalize enum values to match backend expectations
    // Clean enum fields first to handle empty strings
    dto.district = cleanField(dto.district);
    dto.province = cleanField(dto.province);
    dto.country = cleanField(dto.country);
    dto.language = cleanField(dto.language);
    dto.gender = cleanField(dto.gender);
    
    // District: Must be uppercase (e.g., "Colombo" -> "COLOMBO")
    if (dto.district && typeof dto.district === 'string') {
      dto.district = dto.district.toUpperCase().replace(/\s+/g, '_');
    }
    
    // Province: Must be uppercase with underscores (e.g., "Western" -> "WESTERN")
    if (dto.province && typeof dto.province === 'string') {
      dto.province = dto.province.toUpperCase().replace(/\s+/g, '_');
    }
    
    // Country: Backend expects "Sri Lanka" (with space, proper case)
    if (dto.country && typeof dto.country === 'string') {
      const countryLower = dto.country.toLowerCase().trim();
      if (countryLower === 'sri lanka' || countryLower === 'srilanka' || countryLower === 'sri_lanka') {
        dto.country = 'Sri Lanka';
      }
    }
    
    // Language: Should already be E, S, or T (single letter)
    if (dto.language && typeof dto.language === 'string') {
      dto.language = dto.language.toUpperCase().trim();
      // If still empty after trim, set to undefined
      if (dto.language === '') dto.language = undefined;
    }
    
    // Gender: Should be MALE, FEMALE, or OTHER
    if (dto.gender && typeof dto.gender === 'string') {
      dto.gender = dto.gender.toUpperCase().trim();
    }
    
    if (!dto.studentData && (dto.userType === UserType.USER || dto.userType === UserType.USER_WITHOUT_PARENT)) {
      try {
        // Auto-organize student fields into studentData object
        dto.studentData = {
          studentId: cleanField(dto.studentId),
          emergencyContact: cleanField(dto.emergencyContact),
          medicalConditions: cleanField(dto.medicalConditions),
          allergies: cleanField(dto.allergies),
          bloodGroup: cleanField(dto.bloodGroup),
          fatherId: cleanField(dto.fatherId),
          motherId: cleanField(dto.motherId),
          guardianId: cleanField(dto.guardianId),
          fatherPhoneNumber: cleanField(dto.fatherPhoneNumber),
          motherPhoneNumber: cleanField(dto.motherPhoneNumber),
          guardianPhoneNumber: cleanField(dto.guardianPhoneNumber),
          fatherSkipReason: cleanField(dto.fatherSkipReason),
          motherSkipReason: cleanField(dto.motherSkipReason),
          guardianSkipReason: cleanField(dto.guardianSkipReason),
        };
        // Clean up flat fields
        delete dto.studentId;
        delete dto.emergencyContact;
        delete dto.medicalConditions;
        delete dto.allergies;
        delete dto.bloodGroup;
        delete dto.fatherId;
        delete dto.motherId;
        delete dto.guardianId;
      } catch (error) {
        this.logger.error(`[${requestId}] Failed to restructure studentData: ${error.message}`);
        throw new BadRequestException('Failed to process student data - please check your input format');
      }
    }
    
    if (!dto.parentData && (dto.userType === UserType.USER || dto.userType === UserType.USER_WITHOUT_STUDENT)) {
      try {
        // Auto-organize parent fields into parentData object
        dto.parentData = {
          fatherPhoneNumber: cleanField(dto.fatherPhoneNumber),
          motherPhoneNumber: cleanField(dto.motherPhoneNumber),
          guardianPhoneNumber: cleanField(dto.guardianPhoneNumber),
          occupation: cleanField(dto.occupation),
          workplace: cleanField(dto.workplace),
          workPhone: cleanField(dto.workPhone),
          educationLevel: cleanField(dto.educationLevel),
        };
        // Clean up flat fields
        delete dto.fatherPhoneNumber;
        delete dto.motherPhoneNumber;
        delete dto.guardianPhoneNumber;
        delete dto.occupation;
        delete dto.workplace;
        delete dto.workPhone;
        delete dto.educationLevel;
      } catch (error) {
        this.logger.error(`[${requestId}] Failed to restructure parentData: ${error.message}`);
        throw new BadRequestException('Failed to process parent data - please check your input format');
      }
    }
    
    // ðŸ”§ Clean nested objects if they exist (when sent as JSON)
    if (dto.studentData && typeof dto.studentData === 'object') {
      dto.studentData = cleanObject(dto.studentData);
    }
    if (dto.parentData && typeof dto.parentData === 'object') {
      dto.parentData = cleanObject(dto.parentData);
    }
    if (dto.institute && typeof dto.institute === 'object') {
      dto.institute = cleanObject(dto.institute);
    }
    
    // Validate userType-specific data requirements
    if (dto.userType === UserType.USER) {
      if (!dto.studentData) {
        throw new BadRequestException('studentData is required for USER type (student with parent)');
      }
      if (!dto.parentData) {
        throw new BadRequestException('parentData is required for USER type (student with parent)');
      }
    } else if (dto.userType === UserType.USER_WITHOUT_PARENT) {
      if (!dto.studentData) {
        throw new BadRequestException('studentData is required for USER_WITHOUT_PARENT type');
      }
    } else if (dto.userType === UserType.USER_WITHOUT_STUDENT) {
      if (!dto.parentData) {
        throw new BadRequestException('parentData is required for USER_WITHOUT_STUDENT type');
      }
    }

    // Pass imageUrl and idUrl from DTO to service
    const result = await this.usersService.createComprehensive(dto);
    
    if (result.success) {
    }

    // Send welcome notifications
    if (result.success && result.userId && dto.email) {
      this.logger.log(
        `[${requestId}] ðŸ“§ Sending welcome notifications - ` +
        `Email: ${dto.email}, Name: ${dto.nameWithInitials || dto.firstName || 'MISSING'}, UserId: ${result.userId}`
      );
      this.userNotificationService.sendWelcomeNotifications({
        email: dto.email,
        phoneNumber: dto.phoneNumber,
        nameWithInitials: dto.nameWithInitials,
        firstName: dto.firstName,
        userId: result.userId,
        instituteId: dto.instituteId,
      }).catch((error) => {
        this.logger.warn(`[${requestId}] âš ï¸ Failed to send welcome notifications: ${error.message}`);
      });
    } else {
      this.logger.warn(
        `[${requestId}] âš ï¸ Skipping welcome notifications - ` +
        `Success: ${result.success}, UserId: ${result.userId || 'MISSING'}, Email: ${dto.email || 'MISSING'}`
      );
    }
    
    return result;
      
    } catch (error) {
      this.logger.error(`[${requestId}] âŒ User creation failed: ${error.message}`);
      this.logger.error(`[${requestId}] Error stack: ${error.stack}`);
      
      // ðŸ›¡ï¸ STRICT ERROR HANDLING: Never expose internal errors to client
      if (error instanceof BadRequestException || 
          error instanceof ConflictException || 
          error instanceof NotFoundException ||
          error instanceof ForbiddenException) {
        // Known HTTP exceptions - pass through
        throw error;
      }
      
      // Unknown error - log details but send generic message to client
      this.logger.error(`[${requestId}] ðŸš¨ INTERNAL ERROR: ${JSON.stringify({
        message: error.message,
        name: error.name,
        code: error.code,
        dto: {
          userType: dto?.userType,
          email: dto?.email,
          hasStudentData: !!dto?.studentData,
          hasParentData: !!dto?.parentData
        }
      })}`);
      
      throw new BadRequestException(
        'Failed to create user. Please verify all required fields are provided correctly and try again.'
      );
    }
  }

  // ====================================================================
  // SPECIAL HIGH-PERFORMANCE BASIC INFO LOOKUP ENDPOINTS
  // ====================================================================
  // âš ï¸ IMPORTANT: Specific routes (phone, rfid) MUST come BEFORE generic (:userId)
  // to prevent incorrect route matching in NestJS

  /**
   * ðŸš€ SPECIAL API: Get User Basic Info by Phone Number (Ultra-Fast)
   * 
   * Returns only essential user information for UI display:
   * - imageUrl (profile picture)
   * - firstName + lastName (combined as fullName)
   * - userType (role)
   * 
   * Optimized for maximum performance with minimal database load.
   * Accessible to all authenticated users for system-wide user lookups.
   * **RATE LIMIT:** 20 requests per 15 minutes to prevent abuse.
   * 
   * @param phoneNumber - User phone number to lookup
   * @returns Minimal user information
   */
  @Get('basic/phone/:phoneNumber')
  @Throttle({ default: { limit: 20, ttl: 900000 } }) // 20 requests per 15 minutes
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'ðŸš€ Get basic user info by phone number (Ultra-Fast API)',
    description: `Special high-performance API that returns only essential user information for UI display using phone number lookup.
    
    **Performance Features:**
    - Only SELECT required fields (imageUrl, firstName, lastName, userType)
    - Uses primary key index for fastest possible lookup
    - Minimal network payload
    - Optimized for system-wide user lookups
    
    **Access Control:**
    - Available to all authenticated users
    - Works for: system admin, institute admin, teacher, attendance marker, student
    - Only returns active users
    
    **Response Data:**
    - imageUrl: Profile picture URL
    - fullName: Combined first name + last name
    - userType: User role (SUPERADMIN, INSTITUTE_ADMIN, TEACHER, etc.)
    - id: User ID`
  })
  @ApiParam({ 
    name: 'phoneNumber', 
    type: String,
    description: 'User phone number (with or without country code)',
    example: '0771234567'
  })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Basic user info retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'User ID', example: '40' },
        imageUrl: { type: 'string', nullable: true, description: 'Profile picture URL', example: 'https://example.com/profile.jpg' },
        fullName: { type: 'string', description: 'Combined first and last name', example: 'John Doe' },
        userType: { type: 'string', enum: Object.values(UserType), description: 'User role type', example: 'STUDENT' }
      }
    }
  })
  @ApiResponse({ 
    status: HttpStatus.NOT_FOUND, 
    description: 'User not found or inactive',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 404 },
        message: { type: 'string', example: 'User not found or inactive' },
        error: { type: 'string', example: 'Not Found' }
      }
    }
  })
  @ApiResponse({ 
    status: HttpStatus.UNAUTHORIZED, 
    description: 'Authentication required',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 401 },
        message: { type: 'string', example: 'Unauthorized' },
        error: { type: 'string', example: 'Unauthorized' }
      }
    }
  })
  async getUserBasicInfoByPhone(
    @Param('phoneNumber') phoneNumber: string
  ): Promise<{
    id: string;
    imageUrl: string | null;
    fullName: string;
    userType: UserType;
  }> {
    const user = await this.usersService.getUserBasicInfoByPhone(phoneNumber);
    
    if (!user) {
      throw new NotFoundException('User not found or inactive');
    }
    
    return user;
  }

  /**
   * ðŸš€ SPECIAL API: Get User Basic Info by RFID (Ultra-Fast)
   * 
   * Returns only essential user information for UI display:
   * - imageUrl (profile picture)
   * - firstName + lastName (combined as fullName)
   * - userType (role)
   * 
   * Optimized for maximum performance with minimal database load.
   * Accessible to all authenticated users for system-wide user lookups.
   * **RATE LIMIT:** 20 requests per 15 minutes to prevent abuse.
   * 
   * @param rfid - User RFID to lookup
   * @returns Minimal user information
   */
  @Get('basic/rfid/:rfid')
  @Throttle({ default: { limit: 20, ttl: 900000 } }) // 20 requests per 15 minutes
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'ðŸš€ Get basic user info by RFID (Ultra-Fast API)',
    description: `Special high-performance API that returns only essential user information for UI display using RFID lookup.
    
    **Performance Features:**
    - Only SELECT required fields (imageUrl, firstName, lastName, userType)
    - Uses RFID index for fastest possible lookup
    - Minimal network payload
    - Optimized for system-wide user lookups
    
    **Access Control:**
    - Available to all authenticated users
    - Works for: system admin, institute admin, teacher, attendance marker, student
    - Only returns active users
    
    **Response Data:**
    - imageUrl: Profile picture URL
    - fullName: Combined first name + last name
    - userType: User role (SUPERADMIN, INSTITUTE_ADMIN, TEACHER, etc.)
    - id: User ID`
  })
  @ApiParam({ 
    name: 'rfid', 
    type: String,
    description: 'User RFID identifier',
    example: 'RFID01234'
  })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Basic user info retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'User ID', example: '40' },
        imageUrl: { type: 'string', nullable: true, description: 'Profile picture URL', example: 'https://example.com/profile.jpg' },
        fullName: { type: 'string', description: 'Combined first and last name', example: 'John Doe' },
        userType: { type: 'string', enum: Object.values(UserType), description: 'User role type', example: 'STUDENT' }
      }
    }
  })
  @ApiResponse({ 
    status: HttpStatus.NOT_FOUND, 
    description: 'User not found or inactive',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 404 },
        message: { type: 'string', example: 'User not found or inactive' },
        error: { type: 'string', example: 'Not Found' }
      }
    }
  })
  @ApiResponse({ 
    status: HttpStatus.UNAUTHORIZED, 
    description: 'Authentication required',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 401 },
        message: { type: 'string', example: 'Unauthorized' },
        error: { type: 'string', example: 'Unauthorized' }
      }
    }
  })
  async getUserBasicInfoByRfid(
    @Param('rfid') rfid: string
  ): Promise<{
    id: string;
    imageUrl: string | null;
    fullName: string;
    userType: UserType;
  }> {
    const user = await this.usersService.getUserBasicInfoByRfid(rfid);
    
    if (!user) {
      throw new NotFoundException('User not found or inactive');
    }
    
    return user;
  }

  /**
   * ðŸš€ SPECIAL API: Get User Basic Info by Email (Ultra-Fast)
   * 
   * Returns only essential user information for UI display:
   * - imageUrl (profile picture)
   * - firstName + lastName (combined as fullName)
   * - userType (role)
   * 
   * Optimized for maximum performance with minimal database load.
   * Accessible to all authenticated users for system-wide user lookups.
   * **RATE LIMIT:** 20 requests per 15 minutes to prevent abuse.
   * 
   * @param email - User email to lookup
   * @returns Minimal user information
   */
  @Get('basic/email/:email')
  @Throttle({ default: { limit: 20, ttl: 900000 } }) // 20 requests per 15 minutes
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'ðŸš€ Get basic user info by email (Ultra-Fast API)',
    description: `Special high-performance API that returns only essential user information for UI display using email lookup.
    
    **Performance Features:**
    - Only SELECT required fields (imageUrl, firstName, lastName, userType)
    - Uses email index for fastest possible lookup
    - Minimal network payload
    - Optimized for system-wide user lookups
    
    **Access Control:**
    - Available to all authenticated users
    - Works for: system admin, institute admin, teacher, attendance marker, student
    - Only returns active users
    
    **Response Data:**
    - imageUrl: Profile picture URL
    - fullName: Combined first name + last name
    - userType: User role (SUPERADMIN, INSTITUTE_ADMIN, TEACHER, etc.)
    - id: User ID`
  })
  @ApiParam({ 
    name: 'email', 
    type: String,
    description: 'User email address',
    example: 'user@example.com'
  })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Basic user info retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'User ID', example: '40' },
        imageUrl: { type: 'string', nullable: true, description: 'Profile picture URL', example: 'https://example.com/profile.jpg' },
        fullName: { type: 'string', description: 'Combined first and last name', example: 'John Doe' },
        userType: { type: 'string', enum: Object.values(UserType), description: 'User role type', example: 'STUDENT' }
      }
    }
  })
  @ApiResponse({ 
    status: HttpStatus.NOT_FOUND, 
    description: 'User not found or inactive',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 404 },
        message: { type: 'string', example: 'User not found or inactive' },
        error: { type: 'string', example: 'Not Found' }
      }
    }
  })
  @ApiResponse({ 
    status: HttpStatus.UNAUTHORIZED, 
    description: 'Authentication required',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 401 },
        message: { type: 'string', example: 'Unauthorized' },
        error: { type: 'string', example: 'Unauthorized' }
      }
    }
  })
  async getUserBasicInfoByEmail(
    @Param('email') email: string
  ): Promise<{
    id: string;
    imageUrl: string | null;
    fullName: string;
    userType: UserType;
  }> {
    const user = await this.usersService.getUserBasicInfoByEmail(email);
    
    if (!user) {
      throw new NotFoundException('User not found or inactive');
    }
    
    return user;
  }

  /**
   * ðŸš€ SPECIAL API: Get User Basic Info by ID (Ultra-Fast)
   * 
   * Returns only essential user information for UI display:
   * - imageUrl (profile picture)
   * - firstName + lastName (combined as fullName)
   * - userType (role)
   * 
   * Optimized for maximum performance with minimal database load.
   * Accessible to all authenticated users for system-wide user lookups.
   * **RATE LIMIT:** 20 requests per 15 minutes to prevent abuse.
   * 
   * @param userId - User ID to lookup
   * @returns Minimal user information
   */
  @Get('basic/:userId')
  @Throttle({ default: { limit: 20, ttl: 900000 } }) // 20 requests per 15 minutes
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'ðŸš€ Get basic user info by ID (Ultra-Fast API)',
    description: `Special high-performance API that returns only essential user information for UI display.
    
    **Performance Features:**
    - Only SELECT required fields (imageUrl, firstName, lastName, userType)
    - Uses primary key index for fastest possible lookup
    - Minimal network payload
    - Optimized for system-wide user lookups
    
    **Access Control:**
    - Available to all authenticated users
    - Works for: system admin, institute admin, teacher, attendance marker, student
    - Only returns active users
    
    **Response Data:**
    - imageUrl: Profile picture URL
    - fullName: Combined first name + last name
    - userType: User role (SUPERADMIN, INSTITUTE_ADMIN, TEACHER, etc.)
    - id: User ID`
  })
  @ApiParam({ 
    name: 'userId', 
    type: String,
    description: 'User unique identifier (Long ID)',
    example: '40'
  })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Basic user info retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'User ID', example: '40' },
        imageUrl: { type: 'string', nullable: true, description: 'Profile picture URL', example: 'https://example.com/profile.jpg' },
        fullName: { type: 'string', description: 'Combined first and last name', example: 'John Doe' },
        userType: { type: 'string', enum: Object.values(UserType), description: 'User role type', example: 'STUDENT' }
      }
    }
  })
  @ApiResponse({ 
    status: HttpStatus.NOT_FOUND, 
    description: 'User not found or inactive',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 404 },
        message: { type: 'string', example: 'User not found or inactive' },
        error: { type: 'string', example: 'Not Found' }
      }
    }
  })
  @ApiResponse({ 
    status: HttpStatus.UNAUTHORIZED, 
    description: 'Authentication required',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 401 },
        message: { type: 'string', example: 'Unauthorized' },
        error: { type: 'string', example: 'Unauthorized' }
      }
    }
  })
  async getUserBasicInfoById(
    @Param('userId', ParseBigIntPipe) userId: string
  ): Promise<{
    id: string;
    imageUrl: string | null;
    fullName: string;
    userType: UserType;
  }> {
    const user = await this.usersService.getUserBasicInfoById(userId);
    
    if (!user) {
      throw new NotFoundException('User not found or inactive');
    }
    
    return user;
  }

  /**
   * Get Current User Profile
   * 
   * Retrieves the authenticated user's own profile information.
   * Users can only access their own profile data for privacy.
   * 
   * @param req - Request object containing authenticated user
   * @returns User profile data
   */
  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @NoDataMasking()
  @ApiOperation({ 
    summary: 'Get current user profile',
    description: `Retrieves the authenticated user's profile information.
    
    **Features:**
    - Self-service profile access
    - Data minimization (only user's own data)
    - Enhanced privacy protection
    - Comprehensive user information`
  })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Profile retrieved successfully', 
    type: UserResponseDto 
  })
  @ApiResponse({ 
    status: HttpStatus.UNAUTHORIZED, 
    description: 'Authentication required',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 401 },
        message: { type: 'string', example: 'Unauthorized' },
        error: { type: 'string', example: 'Unauthorized' }
      }
    }
  })
  async getProfile(@Request() req: JwtRequest): Promise<UserResponseDto> {
    const user = req.user;
    return await this.usersService.findOne(user.s);
  }

  /**
   * Update Current User Profile
   * 
   * Allows users to update their own profile information.
   * Enhanced with validation and security checks.
   * 
   * @param updateUserDto - Profile update data
   * @param req - Request object containing authenticated user
   * @returns Updated user profile
   */
  @Patch('profile')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Update current user profile',
    description: `Updates the authenticated user's profile information.
    
    **Features:**
    - Self-service profile management
    - Enhanced field validation
    - Automatic data sanitization
    - Conflict prevention for unique fields`
  })
  @ApiBody({ 
    type: UpdateUserDto,
    description: 'Profile update data'
  })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Profile updated successfully', 
    type: UserResponseDto 
  })
  @ApiResponse({ 
    status: HttpStatus.BAD_REQUEST, 
    description: 'Validation failed',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 400 },
        message: { type: 'array', items: { type: 'string' } },
        error: { type: 'string', example: 'Bad Request' }
      }
    }
  })
  @ApiResponse({ 
    status: HttpStatus.CONFLICT, 
    description: 'Email or NIC already exists',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 409 },
        message: { type: 'string', example: 'Email already exists' },
        error: { type: 'string', example: 'Conflict' }
      }
    }
  })
  async updateProfile(
    @Body(new ValidationPipe({ transform: true, whitelist: true })) updateUserDto: UpdateUserDto,
    @Request() req: JwtRequest
  ): Promise<UserResponseDto> {
    const user = req.user;
    const result = await this.usersService.update(user.s, updateUserDto);
    
    // ðŸ”„ Refresh user cache after profile update (indexes updated only if needed)
    try {
      await this.userManagementService.refreshUserCache(user.s);
    } catch (cacheError) {
      // Don't fail the request if caching fails
    }
    
    return result;
  }

  /**
   * Upgrade User Type
   * 
   * Allows users to upgrade from USER_WITHOUT_PARENT or USER_WITHOUT_STUDENT to USER
   * by providing the missing parent or student data.
   */
  @Patch('upgrade-type')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Upgrade user type to USER',
    description: `Upgrades the authenticated user's type to full USER by creating the missing record.
    
    **Allowed transitions:**
    - USER_WITHOUT_PARENT → USER (creates parent record, provide parentData)
    - USER_WITHOUT_STUDENT → USER (creates student record, provide studentData)`
  })
  @ApiBody({ type: UpgradeUserTypeDto })
  @ApiResponse({ status: HttpStatus.OK, description: 'User type upgraded successfully', type: UserResponseDto })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid upgrade path or record already exists' })
  async upgradeUserType(
    @Body(new ValidationPipe({ transform: true, whitelist: true })) dto: UpgradeUserTypeDto,
    @Request() req: JwtRequest
  ): Promise<UserResponseDto> {
    const user = req.user;
    return await this.usersService.upgradeUserType(user.s, dto);
  }

  /**
   * Get All Users with Enhanced Filtering
   * 
   * Retrieves paginated list of users with comprehensive filtering options.
   * Access restricted to SUPERADMIN only.
   * 
   * @param query - Query parameters for filtering and pagination
   * @param req - Request object containing authenticated user
   * @returns Paginated user list
   */
  @Get()
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ 
    global: [UserType.SUPERADMIN]
  })
  @HttpCode(HttpStatus.OK)
  @NoDataMasking()
  @ApiOperation({ 
    summary: 'Get all users with advanced filtering and pagination',
    description: `Retrieves a paginated list of users with comprehensive filtering capabilities.
    
    **Access Control:**
    - SUPERADMIN: Can view all users across all institutes
    - Access denied for all other user types including institute admins
    
    **Features:**
    - Advanced search across multiple fields
    - Geographic filtering (province, district, city)
    - User type and status filtering
    - Flexible pagination and sorting
    - Performance optimized queries`
  })
  @ApiQuery({ 
    name: 'search', 
    required: false, 
    type: String,
    description: 'Global search across firstName, lastName, email, NIC, and phone fields',
    example: 'john'
  })
  @ApiQuery({ 
    name: 'userType', 
    required: false, 
    enum: UserType, 
    description: 'Filter users by their role type',
    example: UserType.USER_WITHOUT_PARENT
  })
  @ApiQuery({ 
    name: 'gender', 
    required: false, 
    enum: Gender, 
    description: 'Filter users by gender',
    example: Gender.MALE
  })
  @ApiQuery({ 
    name: 'city', 
    required: false, 
    type: String,
    description: 'Filter by city (supports partial matching)',
    example: 'Colombo'
  })
  @ApiQuery({ 
    name: 'district', 
    required: false, 
    type: String,
    description: 'Filter by district (supports partial matching)',
    example: 'Colombo'
  })
  @ApiQuery({ 
    name: 'province', 
    required: false, 
    type: String,
    description: 'Filter by province (supports partial matching)',
    example: 'Western'
  })
  @ApiQuery({ 
    name: 'country', 
    required: false, 
    type: String,
    description: 'Filter by country (supports partial matching)',
    example: 'Sri Lanka'
  })
  @ApiQuery({ 
    name: 'postalCode', 
    required: false, 
    type: String,
    description: 'Filter by postal/ZIP code',
    example: '00100'
  })
  @ApiQuery({ 
    name: 'phone', 
    required: false, 
    type: String,
    description: 'Filter by phone number (partial matching)',
    example: '0771234567'
  })
  @ApiQuery({ 
    name: 'nic', 
    required: false, 
    type: String,
    description: 'Filter by National Identity Card number',
    example: '199512345678'
  })
  @ApiQuery({ 
    name: 'isActive', 
    required: false, 
    type: Boolean,
    description: 'Filter by user active status',
    example: true
  })
  @ApiQuery({ 
    name: 'page', 
    required: false, 
    type: Number,
    description: 'Page number for pagination (starts from 1)',
    example: 1
  })
  @ApiQuery({ 
    name: 'limit', 
    required: false, 
    type: Number,
    description: 'Number of items per page (maximum 100)',
    example: 10
  })
  @ApiQuery({ 
    name: 'sortBy', 
    required: false, 
    type: String,
    description: 'Field to sort by (createdAt, firstName, lastName, email)',
    example: 'createdAt'
  })
  @ApiQuery({ 
    name: 'sortOrder', 
    required: false, 
    enum: ['ASC', 'DESC'],
    description: 'Sort order direction',
    example: 'DESC'
  })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Users retrieved successfully', 
    type: PaginatedUserResponseDto 
  })
  @ApiResponse({ 
    status: HttpStatus.FORBIDDEN, 
    description: 'Insufficient permissions',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 403 },
        message: { type: 'string', example: 'Insufficient permissions' },
        error: { type: 'string', example: 'Forbidden' }
      }
    }
  })
  async findAll(
    @Query() query: QueryUserDto,
    @Request() req: JwtRequest
  ): Promise<PaginatedUserResponseDto> {
    const currentUser = req.user;
    
    // Enhanced access control for viewing users
    if (!this.hasUserViewPermission(currentUser)) {
      throw new ForbiddenException('Insufficient permissions to view users');
    }
    
    return await this.usersService.findAll(query);
  }

  /**
   * Get User Statistics
   * 
   * Provides comprehensive user statistics and analytics.
   * Useful for dashboard and reporting features.
   * 
   * @param req - Request object containing authenticated user
   * @returns Statistical data about users
   */
  @Get('statistics')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ 
    global: [UserType.SUPERADMIN]
  })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Get comprehensive user statistics',
    description: `Retrieves detailed statistical information about users in the system.
    
    **Access Control:**
    - SUPERADMIN: Can view all statistics across all institutes
    - Access denied for all other user types
    
    **Features:**
    - Total user counts by status
    - User type distribution
    - Gender distribution
    - Geographic distribution
    - Activity metrics`
  })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'User statistics retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        totalUsers: { type: 'number', description: 'Total number of users' },
        activeUsers: { type: 'number', description: 'Number of active users' },
        inactiveUsers: { type: 'number', description: 'Number of inactive users' },
        byUserType: {
          type: 'object',
          description: 'User count by user type',
          additionalProperties: { type: 'number' }
        },
        byGender: {
          type: 'object',
          description: 'User count by gender',
          additionalProperties: { type: 'number' }
        },
        byProvince: {
          type: 'object',
          description: 'User count by province',
          additionalProperties: { type: 'number' }
        }
      }
    }
  })
  @ApiResponse({ 
    status: HttpStatus.FORBIDDEN, 
    description: 'Insufficient permissions',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 403 },
        message: { type: 'string', example: 'Insufficient permissions' },
        error: { type: 'string', example: 'Forbidden' }
      }
    }
  })
  async getUserStatistics(@Request() req: JwtRequest): Promise<any> {
    const currentUser = req.user;
    
    // Enhanced access control for statistics
    if (!this.hasUserViewPermission(currentUser)) {
      throw new ForbiddenException('Insufficient permissions to view statistics');
    }
    
    return await this.usersService.getUserStatistics();
  }

  /**
   * Get User Institutes
   * 
   * Retrieves all institutes associated with a specific user.
   * Useful for understanding user's institutional affiliations.
   * 
   * @param id - User UUID
   * @param req - Request object containing authenticated user
   * @returns List of associated institutes
   */
  @Get(':id/institutes')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Get all institutes associated with a user',
    description: `âœ… ENHANCED: Retrieves COMPLETE institute details for all user affiliations.
    
    **Access Control:**
    - Any authenticated user can view their OWN institutes only
    - Users cannot access other users' institutes
    - User ID is validated against JWT token
    
    **Features:**
    - âœ… Complete institute details (all fields)
    - âœ… Paginated response with metadata
    - âœ… Email/phone masking for privacy
    - âœ… Sorted by institute name (A-Z)
    - âœ… Includes: logos, colors, address, vision, mission, social links
    
    **Response Format:**
    Returns full institute objects matching \`GET /institutes\` format with pagination metadata.`
  })
  @ApiParam({ 
    name: 'id', 
    type: String,
    description: 'User unique identifier (Long ID) - must match authenticated user',
    example: '40'
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (default: 1)',
    example: 1
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Items per page (default: 10, max: 100)',
    example: 10
  })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'User institutes retrieved successfully with pagination', 
    schema: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          items: { $ref: '#/components/schemas/UserInstitutesResponseDto' }
        },
        meta: {
          type: 'object',
          properties: {
            page: { type: 'number', example: 1 },
            limit: { type: 'number', example: 10 },
            total: { type: 'number', example: 7 },
            totalPages: { type: 'number', example: 1 },
            hasNext: { type: 'boolean', example: false },
            hasPrev: { type: 'boolean', example: false }
          }
        }
      }
    }
  })
  @ApiResponse({ 
    status: HttpStatus.NOT_FOUND, 
    description: 'User not found',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 404 },
        message: { type: 'string', example: 'User not found' },
        error: { type: 'string', example: 'Not Found' }
      }
    }
  })
  @ApiResponse({ 
    status: HttpStatus.FORBIDDEN, 
    description: 'Access denied - can only view own institutes',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 403 },
        message: { type: 'string', example: 'Access denied. You can only view your own institutes' },
        error: { type: 'string', example: 'Forbidden' }
      }
    }
  })
  async getUserInstitutes(
    @Param('id', ParseBigIntPipe) id: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Request() req: JwtRequest
  ): Promise<{
    data: UserInstitutesResponseDto[];
    meta: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
      hasNext: boolean;
      hasPrev: boolean;
    };
  }> {
    const currentUser = req.user;
    
    // âœ… Validate user can only access their own institutes
    if (currentUser.s !== id) {
      throw new ForbiddenException('Access denied. You can only view your own institutes');
    }
    
    // Parse pagination parameters
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 10));
    
    // Get all institutes for user
    const allInstitutes = await this.usersService.getUserInstitutes(id, currentUser);
    
    // Calculate pagination
    const total = allInstitutes.length;
    const totalPages = Math.ceil(total / limitNum);
    const startIndex = (pageNum - 1) * limitNum;
    const endIndex = startIndex + limitNum;
    const paginatedData = allInstitutes.slice(startIndex, endIndex);
    
    return {
      data: paginatedData,
      meta: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1
      }
    };
  }

  /**
   * Get Parent Institutes (Children's Schools Only)
   * 
   * ðŸŽ¯ PARENT-SPECIFIC API: Returns ONLY institutes where user's children are enrolled as students.
   * This ensures parents see ONLY their children's schools, NOT institutes where they might have other roles.
   * 
   * Uses fatherId/motherId/guardianId from student table + institute_class_student for enrollment.
   * 
   * @param id - Parent user UUID
   * @param req - Request object with JWT
   * @returns Institutes where children are students
   */
  @Get(':id/parent-institutes')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Get institutes where a child is enrolled (Parents only)',
    description: `Returns institutes where a specific child (student) is enrolled. This endpoint is ONLY for parents accessing their children's data.
    
**Use Case:**
- Parent can view institutes where their child is enrolled
- The :id parameter must be a child's userId that exists in JWT's 'c' (children) array
- Based on institute_class_student enrollment records

**Parent Access:**
- Parent with userId=2 and c=["500341", "500362"] can access:
  - /users/500341/parent-institutes âœ…
  - /users/500362/parent-institutes âœ…
  - /users/999999/parent-institutes âŒ (not their child)

**vs Regular /users/:id/institutes:**
- Regular API: Shows ALL institutes where user has ANY role
- Parent API: Shows ONLY institutes where child is enrolled as student`
  })
  @ApiParam({ name: 'id', description: 'Parent User UUID', example: '123' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number', example: 1 })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page (max 100)', example: 10 })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Parent institutes retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              instituteId: { type: 'string', example: '44' },
              instituteName: { type: 'string', example: 'Royal College' },
              shortName: { type: 'string', example: 'Royal' },
              logoUrl: { type: 'string', example: 'https://storage.googleapis.com/...' },
              primaryColorCode: { type: 'string', example: '#0066CC' },
              secondaryColorCode: { type: 'string', example: '#FFD700' },
              role: { type: 'string', example: 'PARENT' },
              enrollmentStatus: { type: 'boolean', example: true, description: 'Student enrollment status in institute' },
              instituteUserId: { type: 'string', example: '789', description: 'Institute user ID if exists' },
              studentInstituteImageUrl: { type: 'string', example: 'https://storage.googleapis.com/...', description: 'Student profile image in this institute' },
              isVerified: { type: 'boolean', example: true, description: 'Whether student is verified in institute' },
              instituteUserStatus: { type: 'string', example: 'ACTIVE', description: 'Institute user status (ACTIVE, PENDING, etc.)' },
              isParentInstitute: { type: 'boolean', example: true }
            }
          }
        },
        meta: {
          type: 'object',
          properties: {
            page: { type: 'number', example: 1 },
            limit: { type: 'number', example: 10 },
            total: { type: 'number', example: 3 },
            totalPages: { type: 'number', example: 1 }
          }
        }
      }
    }
  })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Access denied - can only view own parent institutes' })
  async getParentInstitutes(
    @Param('id', ParseBigIntPipe) id: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Request() req: JwtRequest
  ): Promise<{
    data: any[];
    meta: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
      hasNext: boolean;
      hasPrev: boolean;
    };
  }> {
    const currentUser = req.user;
    
    // âœ… Security: Only allow parents to access their children's institutes
    // The :id parameter should be a child's userId that exists in JWT's 'c' array
    const targetUserId = String(id);
    const childrenIds = currentUser.c ? currentUser.c.map(childId => String(childId)) : [];
    
    const isChildData = childrenIds.includes(targetUserId);
    
    this.logger.log(`Parent institutes access check: parentUserId=${currentUser.s}, targetChildId=${targetUserId}, childrenIds=${JSON.stringify(childrenIds)}, hasAccess=${isChildData}`);
    
    if (!isChildData) {
      throw new ForbiddenException(`Access denied. User ${targetUserId} is not your child. You can only view your children's institutes.`);
    }
    
    // Parse pagination
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 10));
    
    // Get parent institutes (children's schools only)
    const allInstitutes = await this.usersService.getParentInstitutes(id);
    
    // Calculate pagination
    const total = allInstitutes.length;
    const totalPages = Math.ceil(total / limitNum);
    const startIndex = (pageNum - 1) * limitNum;
    const endIndex = startIndex + limitNum;
    const paginatedData = allInstitutes.slice(startIndex, endIndex);
    
    return {
      data: paginatedData,
      meta: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1
      }
    };
  }

  /**
   * Get Parents for User's Institutes
  ): Promise<{
    data: UserInstitutesResponseDto[];
    meta: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
      hasNext: boolean;
      hasPrev: boolean;
    };
  }> {
    const currentUser = req.user;
    
    // âœ… Validate user can only access their own institutes
    if (currentUser.s !== id) {
      throw new ForbiddenException('Access denied. You can only view your own institutes');
    }
    
    // Parse pagination parameters
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 10));
    
    // Get all institutes for user
    const allInstitutes = await this.usersService.getUserInstitutes(id, currentUser);
    
    // Calculate pagination
    const total = allInstitutes.length;
    const totalPages = Math.ceil(total / limitNum);
    const startIndex = (pageNum - 1) * limitNum;
    const endIndex = startIndex + limitNum;
    const paginatedData = allInstitutes.slice(startIndex, endIndex);
    
    return {
      data: paginatedData,
      meta: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1
      }
    };
  }

  /**
   * Get Parents for User's Institutes
   * 
   * Retrieves all parents of students in institutes associated with the user.
   * Gets students from institute_user relationships, then their parents, removing duplicates.
   * 
   * @param id - User UUID
   * @param req - Request object containing authenticated user
   * @returns List of parent details with student information
   */
  @Get(':id/institutes/parents')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ 
    global: [UserType.SUPERADMIN], 
    instituteAdmin: true 
  })
  @HttpCode(HttpStatus.OK)
  @NoDataMasking()
  @ApiOperation({ 
    summary: 'Get all parents for students in user\'s institutes',
    description: `Retrieves all parents (father, mother, guardian) of students enrolled in institutes associated with the user.
    
    **Logic:**
    1. Get user's institutes from institute_user relationship
    2. Get all students enrolled in those institutes  
    3. Get parents (father, mother, guardian) for those students
    4. Remove duplicates and return with student details
    
    **Access Control:**
    - Users can only access their own data
    - Returns comprehensive parent information with student context`
  })
  @ApiParam({ 
    name: 'id', 
    type: String,
    description: 'User unique identifier (Long ID)',
    example: '40'
  })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Institute parents retrieved successfully',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Parent user ID' },
          firstName: { type: 'string', description: 'Parent first name' },
          lastName: { type: 'string', description: 'Parent last name' },
          email: { type: 'string', description: 'Parent email' },
          phone: { type: 'string', description: 'Parent phone number' },
          occupation: { type: 'string', description: 'Parent occupation' },
          workplace: { type: 'string', description: 'Parent workplace' },
          studentName: { type: 'string', description: 'Related student name' },
          studentId: { type: 'string', description: 'Related student ID' },
          relationship: { type: 'string', enum: ['father', 'mother', 'guardian'], description: 'Relationship to student' }
        }
      }
    }
  })
  @ApiResponse({ 
    status: HttpStatus.NOT_FOUND, 
    description: 'User not found',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 404 },
        message: { type: 'string', example: 'User not found' },
        error: { type: 'string', example: 'Not Found' }
      }
    }
  })
  @ApiResponse({ 
    status: HttpStatus.FORBIDDEN, 
    description: 'Insufficient permissions',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 403 },
        message: { type: 'string', example: 'Insufficient permissions' },
        error: { type: 'string', example: 'Forbidden' }
      }
    }
  })
  async getUserInstituteParents(
    @Param('id', ParseBigIntPipe) id: string,
    @Request() req: JwtRequest
  ): Promise<any[]> {
    const currentUser = req.user;
    
    // Security validation - user can only access their own data
    if (!currentUser) {
      throw new ForbiddenException('Authentication required');
    }
    
    // Convert userId to BigInt for comparison
    const userIdBigInt = BigInt(id);
    const currentUserIdBigInt = currentUser.s ? BigInt(currentUser.s) : null;
    const currentUserUserIdBigInt = currentUser.s ? BigInt(currentUser.s) : null;
    
    // Check if current user is requesting their own data
    const canAccess = 
      (currentUserIdBigInt && currentUserIdBigInt === userIdBigInt) || 
      (currentUserUserIdBigInt && currentUserUserIdBigInt === userIdBigInt);
    
    if (!canAccess) {
      throw new ForbiddenException('Unauthorized access - users can only access their own institute parents');
    }
    
    return await this.usersService.getUserInstituteParents(id);
  }

  /**
   * Get Parents for Students in Institute
   * 
   * Retrieves all parents of students enrolled in a specific institute.
   * Requires institute ID for secure access control.
   * 
   * @param instituteId - Institute Long ID
   * @param req - Request object containing authenticated user
   * @returns List of parent details with student information
   */
  @Get('institutes/:instituteId/parents')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ 
    global: [UserType.SUPERADMIN], 
    instituteAdmin: true,
    teacher: true
  })
  @HttpCode(HttpStatus.OK)
  @NoDataMasking()
  @ApiOperation({ 
    summary: 'Get all parents for students in specific institute',
    description: `Retrieves all parents (father, mother, guardian) of students enrolled in a specific institute.
    
    **Logic:**
    1. Validate user access to the institute
    2. Get all students enrolled in the institute from institute_user table
    3. Get parents (father, mother, guardian) for those students
    4. Remove duplicates and return with student details
    
    **Security:**
    - Validates user has access to the specified institute
    - Returns comprehensive parent information with student context`
  })
  @ApiParam({ 
    name: 'instituteId', 
    type: String,
    description: 'Institute unique identifier (Long ID)',
    example: '1'
  })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Institute parents retrieved successfully',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Parent user ID' },
          firstName: { type: 'string', description: 'Parent first name' },
          lastName: { type: 'string', description: 'Parent last name' },
          email: { type: 'string', description: 'Parent email' },
          phone: { type: 'string', description: 'Parent phone number' },
          occupation: { type: 'string', description: 'Parent occupation' },
          workplace: { type: 'string', description: 'Parent workplace' },
          studentName: { type: 'string', description: 'Related student name' },
          studentId: { type: 'string', description: 'Related student ID' },
          relationship: { type: 'string', enum: ['father', 'mother', 'guardian'], description: 'Relationship to student' }
        }
      }
    }
  })
  @ApiResponse({ 
    status: HttpStatus.NOT_FOUND, 
    description: 'Institute not found',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 404 },
        message: { type: 'string', example: 'Institute not found' },
        error: { type: 'string', example: 'Not Found' }
      }
    }
  })
  @ApiResponse({ 
    status: HttpStatus.FORBIDDEN, 
    description: 'Insufficient permissions',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 403 },
        message: { type: 'string', example: 'Insufficient permissions to access this institute' },
        error: { type: 'string', example: 'Forbidden' }
      }
    }
  })
  async getInstituteParents(
    @Param('instituteId', ParseIdPipe) instituteId: string,
    @Request() req: JwtRequest
  ): Promise<any[]> {
    const currentUser = req.user;
    
    if (!currentUser) {
      throw new ForbiddenException('Authentication required');
    }
    
    return await this.usersService.getInstituteParents(instituteId, currentUser);
  }

  /**
   * Get Parents for Students in Institute Class
   * 
   * Retrieves all parents of students enrolled in a specific institute class.
   * Requires institute ID and class ID for secure access control.
   * 
   * @param instituteId - Institute Long ID
   * @param classId - Class Long ID
   * @param req - Request object containing authenticated user
   * @returns List of parent details with student information
   */
  @Get('institutes/:instituteId/classes/:classId/parents')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ 
    global: [UserType.SUPERADMIN], 
    instituteAdmin: true,
    teacher: { requireClass: true }
  })
  @HttpCode(HttpStatus.OK)
  @NoDataMasking()
  @ApiOperation({ 
    summary: 'Get all parents for students in specific institute class',
    description: `Retrieves all parents (father, mother, guardian) of students enrolled in a specific institute class.
    
    **Logic:**
    1. Validate user access to the institute and class
    2. Get all students enrolled in the specific class from institute_user table
    3. Get parents (father, mother, guardian) for those students
    4. Remove duplicates and return with student details
    
    **Security:**
    - Validates user has access to the specified institute and class
    - Returns comprehensive parent information with student context`
  })
  @ApiParam({ 
    name: 'instituteId', 
    type: String,
    description: 'Institute unique identifier (Long ID)',
    example: '1'
  })
  @ApiParam({ 
    name: 'classId', 
    type: String,
    description: 'Class unique identifier (Long ID)',
    example: '5'
  })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Institute class parents retrieved successfully',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Parent user ID' },
          firstName: { type: 'string', description: 'Parent first name' },
          lastName: { type: 'string', description: 'Parent last name' },
          email: { type: 'string', description: 'Parent email' },
          phone: { type: 'string', description: 'Parent phone number' },
          occupation: { type: 'string', description: 'Parent occupation' },
          workplace: { type: 'string', description: 'Parent workplace' },
          studentName: { type: 'string', description: 'Related student name' },
          studentId: { type: 'string', description: 'Related student ID' },
          relationship: { type: 'string', enum: ['father', 'mother', 'guardian'], description: 'Relationship to student' }
        }
      }
    }
  })
  @ApiResponse({ 
    status: HttpStatus.NOT_FOUND, 
    description: 'Institute or class not found',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 404 },
        message: { type: 'string', example: 'Institute or class not found' },
        error: { type: 'string', example: 'Not Found' }
      }
    }
  })
  @ApiResponse({ 
    status: HttpStatus.FORBIDDEN, 
    description: 'Insufficient permissions',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 403 },
        message: { type: 'string', example: 'Insufficient permissions to access this institute class' },
        error: { type: 'string', example: 'Forbidden' }
      }
    }
  })
  async getInstituteClassParents(
    @Param('instituteId', ParseIdPipe) instituteId: string,
    @Param('classId', ParseIdPipe) classId: string,
    @Request() req: JwtRequest
  ): Promise<any[]> {
    const currentUser = req.user;
    
    if (!currentUser) {
      throw new ForbiddenException('Authentication required');
    }
    
    return await this.usersService.getInstituteClassParents(instituteId, classId, currentUser);
  }

  /**
   * Get Parents for Students in Institute Class Subject
   * 
   * Retrieves all parents of students enrolled in a specific institute class subject.
   * Requires institute ID, class ID, and subject ID for secure access control.
   * 
   * @param instituteId - Institute Long ID
   * @param classId - Class Long ID
   * @param subjectId - Subject Long ID
   * @param req - Request object containing authenticated user
   * @returns List of parent details with student information
   */
  @Get('institutes/:instituteId/classes/:classId/subjects/:subjectId/parents')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ 
    global: [UserType.SUPERADMIN], 
    instituteAdmin: true,
    teacher: { requireClass: true, requireSubject: true }
  })
  @HttpCode(HttpStatus.OK)
  @NoDataMasking()
  @ApiOperation({ 
    summary: 'Get all parents for students in specific institute class subject',
    description: `Retrieves all parents (father, mother, guardian) of students enrolled in a specific institute class subject.
    
    **Logic:**
    1. Validate user access to the institute, class, and subject
    2. Get all students enrolled in the specific class subject from institute_user table
    3. Get parents (father, mother, guardian) for those students
    4. Remove duplicates and return with student details
    
    **Security:**
    - Validates user has access to the specified institute, class, and subject
    - Returns comprehensive parent information with student context`
  })
  @ApiParam({ 
    name: 'instituteId', 
    type: String,
    description: 'Institute unique identifier (Long ID)',
    example: '1'
  })
  @ApiParam({ 
    name: 'classId', 
    type: String,
    description: 'Class unique identifier (Long ID)',
    example: '5'
  })
  @ApiParam({ 
    name: 'subjectId', 
    type: String,
    description: 'Subject unique identifier (Long ID)',
    example: '10'
  })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Institute class subject parents retrieved successfully',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Parent user ID' },
          firstName: { type: 'string', description: 'Parent first name' },
          lastName: { type: 'string', description: 'Parent last name' },
          email: { type: 'string', description: 'Parent email' },
          phone: { type: 'string', description: 'Parent phone number' },
          occupation: { type: 'string', description: 'Parent occupation' },
          workplace: { type: 'string', description: 'Parent workplace' },
          studentName: { type: 'string', description: 'Related student name' },
          studentId: { type: 'string', description: 'Related student ID' },
          relationship: { type: 'string', enum: ['father', 'mother', 'guardian'], description: 'Relationship to student' }
        }
      }
    }
  })
  @ApiResponse({ 
    status: HttpStatus.NOT_FOUND, 
    description: 'Institute, class, or subject not found',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 404 },
        message: { type: 'string', example: 'Institute, class, or subject not found' },
        error: { type: 'string', example: 'Not Found' }
      }
    }
  })
  @ApiResponse({ 
    status: HttpStatus.FORBIDDEN, 
    description: 'Insufficient permissions',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 403 },
        message: { type: 'string', example: 'Insufficient permissions to access this institute class subject' },
        error: { type: 'string', example: 'Forbidden' }
      }
    }
  })
  async getInstituteClassSubjectParents(
    @Param('instituteId', ParseIdPipe) instituteId: string,
    @Param('classId', ParseIdPipe) classId: string,
    @Param('subjectId', ParseBigIntPipe) subjectId: string,
    @Request() req: JwtRequest
  ): Promise<any[]> {
    const currentUser = req.user;
    
    if (!currentUser) {
      throw new ForbiddenException('Authentication required');
    }
    
    return await this.usersService.getInstituteClassSubjectParents(instituteId, classId, subjectId, currentUser);
  }

  /**
   * Get User by ID
   * 
   * Retrieves a specific user by their unique identifier.
   * Access control enforced based on user roles.
   * 
   * @param id - User UUID
   * @param req - Request object containing authenticated user
   * @returns User data
   */
  @Get(':id')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ 
    global: [UserType.SUPERADMIN], 
    instituteAdmin: true,
    allowSelf: true,
    parent: { requireStudent: true }
  })
  @HttpCode(HttpStatus.OK)
  @NoDataMasking()
  @ApiOperation({ 
    summary: 'Get user by ID',
    description: `Retrieves a specific user by their unique identifier.
    
    **Access Control:**
    - SUPERADMIN: Can view any user
    - INSTITUTE_ADMIN: Can view users within their institute
    - Other users: Can only view their own profile
    
    **Features:**
    - UUID validation
    - Role-based data access
    - Comprehensive user information`
  })
  @ApiParam({ 
    name: 'id', 
    type: String,
    description: 'User unique identifier (Long ID)',
    example: '40'
  })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'User retrieved successfully', 
    type: UserResponseDto 
  })
  @ApiResponse({ 
    status: HttpStatus.NOT_FOUND, 
    description: 'User not found',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 404 },
        message: { type: 'string', example: 'User not found' },
        error: { type: 'string', example: 'Not Found' }
      }
    }
  })
  @ApiResponse({ 
    status: HttpStatus.FORBIDDEN, 
    description: 'Insufficient permissions',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 403 },
        message: { type: 'string', example: 'Insufficient permissions' },
        error: { type: 'string', example: 'Forbidden' }
      }
    }
  })
  async findOne(
    @Param('id', ParseBigIntPipe) id: string,
    @Request() req: JwtRequest
  ): Promise<UserResponseDto> {
    const currentUser = req.user;
    
    // Enhanced access control for viewing specific user
    if (!this.hasUserAccessPermission(currentUser, id)) {
      throw new ForbiddenException('Insufficient permissions to view this user');
    }
    
    return await this.usersService.findOne(id);
  }

  /**
   * Update User by ID
   * 
   * Updates a specific user's information with enhanced validation.
   * Restricted to authorized users based on role-based access control.
   * 
   * @param id - User UUID
   * @param updateUserDto - User update data
   * @param req - Request object containing authenticated user
   * @returns Updated user data
   */
  @Patch(':id')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ 
    global: [UserType.SUPERADMIN], 
    instituteAdmin: true 
  })
  @HttpCode(HttpStatus.OK)
  @NoDataMasking()
  @ApiOperation({ 
    summary: 'Update user by ID',
    description: `Updates a specific user's information with comprehensive validation.
    
    **Access Control:**
    - SUPERADMIN: Can update any user
    - INSTITUTE_ADMIN: Can update users within their institute
    - Users: Can update their own profile
    
    **Features:**
    - Advanced field validation
    - Conflict prevention for unique fields
    - Selective field updates
    - Audit trail maintenance`
  })
  @ApiParam({ 
    name: 'id', 
    type: String,
    description: 'User unique identifier (Long ID)',
    example: '40'
  })
  @ApiBody({ 
    type: UpdateUserDto,
    description: 'User update data with selective field updates'
  })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'User updated successfully', 
    type: UserResponseDto 
  })
  @ApiResponse({ 
    status: HttpStatus.BAD_REQUEST, 
    description: 'Validation failed',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 400 },
        message: { type: 'array', items: { type: 'string' } },
        error: { type: 'string', example: 'Bad Request' }
      }
    }
  })
  @ApiResponse({ 
    status: HttpStatus.NOT_FOUND, 
    description: 'User not found',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 404 },
        message: { type: 'string', example: 'User not found' },
        error: { type: 'string', example: 'Not Found' }
      }
    }
  })
  @ApiResponse({ 
    status: HttpStatus.CONFLICT, 
    description: 'Email or NIC already exists',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 409 },
        message: { type: 'string', example: 'Email already exists' },
        error: { type: 'string', example: 'Conflict' }
      }
    }
  })
  @ApiResponse({ 
    status: HttpStatus.FORBIDDEN, 
    description: 'Insufficient permissions',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 403 },
        message: { type: 'string', example: 'Insufficient permissions' },
        error: { type: 'string', example: 'Forbidden' }
      }
    }
  })
  async update(
    @Param('id', ParseBigIntPipe) id: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true })) updateUserDto: UpdateUserDto,
    @Request() req: JwtRequest
  ): Promise<UserResponseDto> {
    const currentUser = req.user;
    
    // Enhanced access control for updating user
    if (!this.hasUserUpdatePermission(currentUser, id)) {
      throw new ForbiddenException('Insufficient permissions to update this user');
    }
    
    const result = await this.usersService.update(id, updateUserDto);
    
    // ðŸ”„ Refresh user cache after admin update (indexes updated only if needed)
    try {
      await this.userManagementService.refreshUserCache(id);
    } catch (cacheError) {
      // Don't fail the request if caching fails
    }
    
    return result;
  }

  /**
   * Activate User Account
   * 
   * Activates a user account, restoring access to the system.
   * Restricted to SUPERADMIN and INSTITUTE_ADMIN users.
   * 
   * @param id - User UUID
   * @param req - Request object containing authenticated user
   * @returns Updated user data
   */
  @Patch(':id/activate')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ 
    global: [UserType.SUPERADMIN], 
    instituteAdmin: true 
  })
  @HttpCode(HttpStatus.OK)
  @NoDataMasking()
  @ApiOperation({ 
    summary: 'Activate user account',
    description: `Activates a user account, enabling system access.
    
    **Access Control:**
    - SUPERADMIN: Can activate any user
    - INSTITUTE_ADMIN: Can activate users within their institute
    
    **Features:**
    - Account status validation
    - Audit trail logging
    - Immediate effect activation`
  })
  @ApiParam({ 
    name: 'id', 
    type: String,
    description: 'User unique identifier (Long ID)',
    example: '40'
  })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'User activated successfully', 
    type: UserResponseDto 
  })
  @ApiResponse({ 
    status: HttpStatus.NOT_FOUND, 
    description: 'User not found',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 404 },
        message: { type: 'string', example: 'User not found' },
        error: { type: 'string', example: 'Not Found' }
      }
    }
  })
  @ApiResponse({ 
    status: HttpStatus.FORBIDDEN, 
    description: 'Insufficient permissions',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 403 },
        message: { type: 'string', example: 'Insufficient permissions' },
        error: { type: 'string', example: 'Forbidden' }
      }
    }
  })
  async activate(
    @Param('id', ParseBigIntPipe) id: string,
    @Request() req: JwtRequest
  ): Promise<UserResponseDto> {
    const currentUser = req.user;
    
    // Enhanced access control for user activation
    if (!this.hasUserManagementPermission(currentUser)) {
      throw new ForbiddenException('Insufficient permissions to activate users');
    }
    
    const result = await this.usersService.activate(id);
    
    // ðŸ”„ Refresh user cache after activation (status change only)
    try {
      await this.userManagementService.refreshUserCache(id);
    } catch (cacheError) {
      // Don't fail the request if caching fails
    }
    
    return result;
  }

  /**
   * Deactivate User Account
   * 
   * Deactivates a user account without permanent deletion.
   * Maintains data integrity while preventing system access.
   * 
   * @param id - User UUID
   * @param req - Request object containing authenticated user
   * @returns Updated user data
   */
  @Patch(':id/deactivate')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ 
    global: [UserType.SUPERADMIN], 
    instituteAdmin: true 
  })
  @HttpCode(HttpStatus.OK)
  @NoDataMasking()
  @ApiOperation({ 
    summary: 'Deactivate user account (soft delete)',
    description: `Deactivates a user account while preserving data for audit purposes.
    
    **Access Control:**
    - SUPERADMIN: Can deactivate any user
    - INSTITUTE_ADMIN: Can deactivate users within their institute
    
    **Features:**
    - Soft deletion (reversible)
    - Data preservation
    - Audit trail maintenance
    - Immediate access revocation`
  })
  @ApiParam({ 
    name: 'id', 
    type: String,
    description: 'User unique identifier (Long ID)',
    example: '40'
  })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'User deactivated successfully', 
    type: UserResponseDto 
  })
  @ApiResponse({ 
    status: HttpStatus.NOT_FOUND, 
    description: 'User not found',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 404 },
        message: { type: 'string', example: 'User not found' },
        error: { type: 'string', example: 'Not Found' }
      }
    }
  })
  @ApiResponse({ 
    status: HttpStatus.FORBIDDEN, 
    description: 'Insufficient permissions',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 403 },
        message: { type: 'string', example: 'Insufficient permissions' },
        error: { type: 'string', example: 'Forbidden' }
      }
    }
  })
  async deactivate(
    @Param('id', ParseBigIntPipe) id: string,
    @Request() req: JwtRequest
  ): Promise<UserResponseDto> {
    const currentUser = req.user;
    
    // Enhanced access control for user deactivation
    if (!this.hasUserManagementPermission(currentUser)) {
      throw new ForbiddenException('Insufficient permissions to deactivate users');
    }
    
    const result = await this.usersService.softDelete(id);
    
    // ðŸ”„ Refresh user cache after deactivation (status change only)
    try {
      await this.userManagementService.refreshUserCache(id);
    } catch (cacheError) {
      // Don't fail the request if caching fails
    }
    
    return result;
  }

  /**
   * Delete User Permanently
   * 
   * Permanently removes a user from the system.
   * CRITICAL OPERATION - Restricted to SUPERADMIN only.
   * 
   * @param id - User UUID
   * @param req - Request object containing authenticated user
   */
  @Delete(':id')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ 
    global: [UserType.SUPERADMIN]
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ 
    summary: 'Delete user permanently',
    description: `Permanently removes a user from the system.
    
    **âš ï¸ CRITICAL OPERATION âš ï¸**
    This action is irreversible and will permanently delete all user data.
    
    **Access Control:**
    - SUPERADMIN: Only role with deletion permissions
    - Data backup recommended before deletion
    
    **Features:**
    - Permanent data removal
    - Cascade deletion handling
    - Audit trail logging
    - No recovery possible`
  })
  @ApiParam({ 
    name: 'id', 
    type: String,
    description: 'User unique identifier (Long ID)',
    example: '40'
  })
  @ApiResponse({ 
    status: HttpStatus.NO_CONTENT, 
    description: 'User deleted successfully (no content returned)'
  })
  @ApiResponse({ 
    status: HttpStatus.NOT_FOUND, 
    description: 'User not found',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 404 },
        message: { type: 'string', example: 'User not found' },
        error: { type: 'string', example: 'Not Found' }
      }
    }
  })
  @ApiResponse({ 
    status: HttpStatus.FORBIDDEN, 
    description: 'Insufficient permissions - SUPERADMIN required',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 403 },
        message: { type: 'string', example: 'Only SUPERADMIN can delete users permanently' },
        error: { type: 'string', example: 'Forbidden' }
      }
    }
  })
  async remove(
    @Param('id', ParseBigIntPipe) id: string,
    @Request() req: JwtRequest
  ): Promise<void> {
    const currentUser = req.user;
    
    // Enhanced access control for permanent deletion - SUPERADMIN only
    if (!this.hasSuperAdminPermission(currentUser)) {
      throw new ForbiddenException('Only SUPERADMIN can delete users permanently');
    }
    
    // ðŸ—‘ï¸ Remove user cache and access cache before deletion
    try {
      // Remove user indexes (phone, email, RFID lookups)
      await this.userManagementService.removeUserIndexes(id);
      
      // Remove user access cache (hierarchical permissions)
      await this.cacheService.removeUserCache(id);
      
      // Remove main user data cache
      await this.cacheService.removeUserCache(id);
      
    } catch (cacheError) {
      // Continue with deletion even if cache removal fails
    }
    
    return await this.usersService.remove(id);
  }

  // ====================================================================
  // HELPER METHODS - Role-Based Access Control
  // ====================================================================

  /**
   * Check if user has permission to create users
   * @param currentUser - Authenticated user
   * @param targetUserType - Type of user being created
   * @returns Boolean indicating permission
   */
  private hasUserCreationPermission(currentUser: any, targetUserType?: UserType): boolean {
    if (!currentUser) return false;
    
    const userType = currentUser.userType || String(currentUser.u);
    // SUPERADMIN and ORG_MANAGER can create users
    if (userType === UserType.SUPERADMIN || currentUser.u === 0) return true;
    if (userType === UserType.ORGANIZATION_MANAGER || currentUser.u === 1) return true;
    // Institute admins can create users (checked via decorator, but provide basic gate)
    if (currentUser.i && currentUser.i.length > 0) return true;
    return false;
  }

  /**
   * Check if user has permission to view users list
   * @param currentUser - Authenticated user
   * @returns Boolean indicating permission
   */
  private hasUserViewPermission(currentUser: any): boolean {
    if (!currentUser) return false;
    
    const userType = currentUser.userType || String(currentUser.u);
    // SUPERADMIN, ORG_MANAGER, or users with institute access can view users
    if (userType === UserType.SUPERADMIN || currentUser.u === 0) return true;
    if (userType === UserType.ORGANIZATION_MANAGER || currentUser.u === 1) return true;
    if (currentUser.i && currentUser.i.length > 0) return true;
    return false;
  }

  /**
   * Check if user has permission to access specific user data
   * @param currentUser - Authenticated user
   * @param targetUserId - ID of user being accessed
   * @returns Boolean indicating permission
   */
  private hasUserAccessPermission(currentUser: any, targetUserId: string): boolean {
    if (!currentUser) return false;
    
    const userId = currentUser.s || currentUser.sub;
    
    // Users can always access their own data
    if (userId === targetUserId) {
      return true;
    }
    
    const userType = currentUser.userType || String(currentUser.u);
    // SUPERADMIN, ORG_MANAGER can access any user
    if (userType === UserType.SUPERADMIN || currentUser.u === 0) return true;
    if (userType === UserType.ORGANIZATION_MANAGER || currentUser.u === 1) return true;
    // Users with institute access can access users in their institutes
    if (currentUser.i && currentUser.i.length > 0) return true;
    // Parents can access their children's user data (children userIds from JWT 'c' array)
    if (currentUser.c && Array.isArray(currentUser.c)) {
      const childUserIds = currentUser.c.map((child: any) => 
        typeof child === 'object' ? String(child.userId || child.u) : String(child)
      );
      if (childUserIds.includes(String(targetUserId))) return true;
    }
    return false;
  }

  /**
   * Check if user has permission to update specific user
   * @param currentUser - Authenticated user
   * @param targetUserId - ID of user being updated
   * @returns Boolean indicating permission
   */
  private hasUserUpdatePermission(currentUser: any, targetUserId: string): boolean {
    if (!currentUser) return false;
    
    const userId = currentUser.s || currentUser.sub;
    
    // Users can update their own profile
    if (userId === targetUserId) {
      return true;
    }
    
    const userType = currentUser.userType || String(currentUser.u);
    // SUPERADMIN, ORG_MANAGER can update any user
    if (userType === UserType.SUPERADMIN || currentUser.u === 0) return true;
    if (userType === UserType.ORGANIZATION_MANAGER || currentUser.u === 1) return true;
    // Institute admins can update users in their institutes
    if (currentUser.i && currentUser.i.length > 0) return true;
    return false;
  }

  /**
   * Check if user has permission to manage (activate/deactivate) users
   * @param currentUser - Authenticated user
   * @returns Boolean indicating permission
   */
  private hasUserManagementPermission(currentUser: any): boolean {
    if (!currentUser) return false;
    
    const userType = currentUser.userType || String(currentUser.u);
    // Only SUPERADMIN and ORG_MANAGER can manage (activate/deactivate) users
    if (userType === UserType.SUPERADMIN || currentUser.u === 0) return true;
    if (userType === UserType.ORGANIZATION_MANAGER || currentUser.u === 1) return true;
    return false;
  }

  /**
   * Check if user has SUPERADMIN permission
   * @param currentUser - Authenticated user
   * @returns Boolean indicating SUPERADMIN status
   */
  private hasSuperAdminPermission(currentUser: any): boolean {
    if (!currentUser) return false;
    
    const userType = currentUser.userType || String(currentUser.u);
    return userType === UserType.SUPERADMIN || currentUser.u === 0;
  }

  /**
   * Special API to update telegram ID with security token validation
   * This endpoint requires the 'p' parameter to match the JWT token for access
   */
  @Post('update-telegram-id')
  @UseGuards(ApiKeyOrJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ 
    summary: 'Update user telegram ID (Special API)',
    description: 'Special secured API to update telegram ID. The p parameter must match the JWT token for authorization.'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Telegram ID updated successfully',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Telegram ID updated successfully' },
        success: { type: 'boolean', example: true }
      }
    }
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid JWT token' })
  @ApiResponse({ status: 403, description: 'Forbidden - Security token does not match JWT token' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiBody({
    description: 'Telegram ID update request',
    schema: {
      type: 'object',
      required: ['userid', 'telgramId', 'p'],
      properties: {
        userid: {
          type: 'string',
          description: 'User ID to update telegram ID for',
          example: '123'
        },
        telgramId: {
          type: 'string', 
          description: 'Telegram ID to set for the user',
          example: '7633577879'
        },
        p: {
          type: 'string',
          description: 'Security token that must match JWT token for authorization',
          example: 'lkfannlsflk'
        }
      }
    }
  })
  async updateTelegramId(
    @Body() updateTelegramDto: UpdateTelegramIdDto,
    @Request() req: JwtRequest
  ): Promise<{ message: string; success: boolean }> {
    // Extract JWT token from authorization header
    const authHeader = req.headers.authorization;
    const jwtToken = authHeader?.replace('Bearer ', '') || '';

    const result = await this.usersService.updateTelegramId(
      updateTelegramDto.s,
      updateTelegramDto.telgramId, // Note: keeping the typo as requested
      updateTelegramDto.p,
      jwtToken
    );
    
    // ðŸ”„ Refresh user cache after Telegram ID update (no index changes needed)
    try {
      await this.userManagementService.refreshUserCache(updateTelegramDto.s.toString());
    } catch (cacheError) {
      // Don't fail the request if caching fails
    }
    
    return result;
  }

  @Post('register-rfid')
  @UseGuards(ApiKeyOrJwtGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({ 
    global: [UserType.SUPERADMIN], 
    instituteAdmin: true 
  })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Register/Update RFID for a user - System Admin Only',
    description: 'Registers or updates an RFID tag for a specific user. Only accessible to system administrators. Uses database transactions with automatic rollback on failure.'
  })
  @ApiBearerAuth()
  @ApiBody({
    type: RegisterRfidDto,
    description: 'User ID and RFID data'
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'RFID registered/updated successfully',
    type: RegisterRfidResponseDto
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid input data or validation errors'
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Authentication required'
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Access denied - System Admin access required'
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'User not found'
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'RFID already assigned to another user'
  })
  @ApiResponse({
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    description: 'Failed to register RFID or database operation failed'
  })
  async registerRfid(
    @Body() registerRfidDto: RegisterRfidDto,
    @Request() req: JwtRequest
  ): Promise<RegisterRfidResponseDto> {
    // Access control will be handled by decorators
    // Admin can assign RFID to any user in their institute

    const result = await this.usersService.registerRfid(
      registerRfidDto.userId,
      registerRfidDto.userRfid
    );
    
    // ðŸ”„ Refresh user cache and update indexes after RFID registration
    try {
      await this.userManagementService.refreshUserCache(req.user.s.toString());
      await this.userManagementService.setUserIndexes(req.user.s.toString());
    } catch (cacheError) {
      await this.userManagementService.refreshUserCache(registerRfidDto.userId);
      await this.userManagementService.setUserIndexes(registerRfidDto.userId);
     // Don't fail the request if caching fails
    }
    
    return result;
  }

  /**
   * ðŸ“¸ Upload Profile Photo - Self Service
   * Allows authenticated users to upload their own profile photo
   */
  @Patch('profile/upload-photo')
  @UseGuards(ApiKeyOrJwtGuard)
  @ApiTags('User Profile Management')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'ðŸ“¸ Upload Profile Photo (Self Service)',
    description: `
    ðŸŽ¯ **Purpose**: Allow users to upload their own profile photo
    
    ðŸ“‹ **Features**:
    â€¢ Self-service profile photo upload
    â€¢ Automatic image optimization and resizing
    â€¢ Secure GCS storage with CDN delivery
    â€¢ Cache refresh with 3-5ms response time
    â€¢ Automatic cleanup of old profile photos
    
    ðŸ”’ **Security**: 
    â€¢ JWT authentication required
    â€¢ Users can only update their own profile
    â€¢ File type validation (JPG, PNG, WebP)
    â€¢ File size limit (5MB max)
    
    âš¡ **Performance**: 
    â€¢ GCS upload: ~200-500ms
    â€¢ Database update: ~3-5ms
    â€¢ Total response: ~300-600ms
    `
  })
  @ApiConsumes('application/json')
  @ApiBody({
    description: 'Profile photo URL from signed URL upload',
    schema: {
      type: 'object',
      properties: {
        imageUrl: {
          type: 'string',
          format: 'uri',
          description: 'Profile photo URL from /upload/verify-and-publish endpoint'
        }
      },
      required: ['imageUrl']
    }
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Profile photo uploaded successfully',
    schema: {
      example: {
        success: true,
        message: 'Profile photo uploaded successfully',
        data: {
          userId: 12345,
          imageUrl: 'https://storage.googleapis.com/your-bucket/profile-photos/user-12345-1696118400000.jpg',
          uploadedAt: '2024-10-01T10:00:00.000Z'
        },
        performance: {
          uploadTime: '450ms',
          syncTime: '4ms',
          totalTime: '454ms'
        }
      }
    }
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid file or validation errors',
    schema: {
      example: {
        success: false,
        message: 'Invalid file format. Only JPG, PNG, and WebP are allowed',
        error: 'INVALID_FILE_FORMAT'
      }
    }
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Authentication required'
  })
  @ApiResponse({
    status: HttpStatus.PAYLOAD_TOO_LARGE,
    description: 'File size exceeds 2MB limit'
  })
  @ApiResponse({
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    description: 'Upload failed or database operation error'
  })
  async uploadProfilePhoto(
    @Body() body: ImageUrlDto,
    @Request() req: JwtRequest
  ) {
    const startTime = nowTimestamp();
    const userId = req.user.s;

    // Validate imageUrl presence
    if (!body.imageUrl) {
      throw new BadRequestException({
        success: false,
        message: 'imageUrl is required',
        error: 'MISSING_IMAGE_URL'
      });
    }

    try {
      const uploadStartTime = nowTimestamp();
      
      // Get current user to check for existing photo
      const currentUser = await this.usersService.findOne(userId);
      const oldImageUrl = currentUser.imageUrl;
      
      // Use imageUrl from signed URL upload
      const imageUrl = body.imageUrl;
      
      const uploadEndTime = nowTimestamp();
      const uploadTime = uploadEndTime - uploadStartTime;

      const syncStartTime = nowTimestamp();
      
      // Update user profile with new image URL using dedicated method
      const updatedUser = await this.usersService.updateImageUrl(userId.toString(), imageUrl);
      
      // ðŸ”„ Refresh user cache after image update (imageUrl change only)
      try {
        await this.userManagementService.refreshUserCache(userId.toString());
      } catch (cacheError) {
        // Don't fail the request if caching fails
      }
      
      const syncEndTime = nowTimestamp();
      const syncTime = syncEndTime - syncStartTime;

      // Extract old image key for cleanup if exists
      if (oldImageUrl && oldImageUrl !== imageUrl) {
        try {
          // Extract key from old URL (assuming GCS URL format)
          const oldImageKey = this.extractImageKeyFromUrl(oldImageUrl);
          if (oldImageKey) {
            await this.cloudStorageService.deleteFile(oldImageKey);
          }
        } catch (cleanupError) {
          // Log but don't fail the request for cleanup errors
        }
      }

      const totalTime = nowTimestamp() - startTime;

      return {
        success: true,
        message: 'Profile photo uploaded successfully',
        data: {
          userId: updatedUser.id,
          // ? Transform imageUrl to full URL
          imageUrl: updatedUser.imageUrl ? this.cloudStorageService.getFullUrl(updatedUser.imageUrl) : updatedUser.imageUrl,
          uploadedAt: new Date().toISOString()
        },
        performance: {
          uploadTime: `${uploadTime}ms`,
          syncTime: `${syncTime}ms`,
          totalTime: `${totalTime}ms`
        }
      };

    } catch (error) {
      // If upload succeeded but update failed, cleanup the uploaded file
      if (error.uploadResult?.key) {
        try {
          await this.cloudStorageService.deleteFile(error.uploadResult.key);
        } catch (cleanupError) {
        }
      }

      throw new BadRequestException({
        success: false,
        message: 'Failed to upload profile photo',
        error: error.message || 'UPLOAD_FAILED'
      });
    }
  }

  /**
   * ðŸ–¼ï¸ Update Profile Image URL - JSON Method
   * Allows users to update their profile image using a URL (no file upload needed)
   */
  @Patch('profile/image-url')
  @UseGuards(ApiKeyOrJwtGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN]
  })
  @HttpCode(HttpStatus.OK)
  @ApiTags('User Profile Management')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'ðŸ–¼ï¸ Update Profile Image URL (JSON) - SUPERADMIN Only',
    description: `
    ðŸŽ¯ **Purpose**: Update user profile image using an external image URL
    
    ðŸ“‹ **Use Cases**:
    â€¢ Use existing image from another service
    â€¢ Import user data with images from external systems
    â€¢ Update image without uploading file
    â€¢ Faster updates when image is already hosted
    
    ðŸ”’ **Security**: 
    â€¢ JWT authentication required
    â€¢ SUPERADMIN role required
    â€¢ URL validation
    â€¢ Must be a valid HTTP/HTTPS URL
    
    âš¡ **Performance**: 
    â€¢ Database update: ~3-5ms
    â€¢ No file upload required
    â€¢ Instant update
    `
  })
  @ApiBody({
    description: 'Image URL and User ID to update',
    schema: {
      type: 'object',
      properties: {
        userId: {
          type: 'string',
          description: 'User ID to update image for',
          example: '12345'
        },
        imageUrl: {
          type: 'string',
          format: 'uri',
          description: 'External image URL (must be a valid HTTP/HTTPS URL)',
          example: 'https://example.com/images/profile.jpg'
        }
      },
      required: ['userId', 'imageUrl']
    }
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Profile image URL updated successfully',
    schema: {
      example: {
        success: true,
        message: 'Profile image URL updated successfully',
        data: {
          userId: '12345',
          imageUrl: 'https://example.com/images/profile.jpg',
          updatedAt: '2025-11-07T00:15:00.000Z'
        }
      }
    }
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid URL or validation error',
    schema: {
      example: {
        success: false,
        message: 'Invalid image URL format',
        error: 'INVALID_URL'
      }
    }
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Authentication required'
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'SUPERADMIN role required'
  })
  async updateProfileImageUrl(
    @Body() updateImageUrlDto: UpdateImageUrlDto,
    @Request() req: JwtRequest
  ) {
    try {
      // Update user profile with new image URL
      const updatedUser = await this.usersService.updateImageUrl(updateImageUrlDto.userId, updateImageUrlDto.imageUrl);
      
      // Refresh user cache after image update
      try {
        await this.userManagementService.refreshUserCache(updateImageUrlDto.userId);
      } catch (cacheError) {
        // Don't fail the request if caching fails
      }

      return {
        success: true,
        message: 'Profile image URL updated successfully',
        data: {
          userId: updatedUser.id,
          // ? Transform imageUrl to full URL
          imageUrl: updatedUser.imageUrl ? this.cloudStorageService.getFullUrl(updatedUser.imageUrl) : updatedUser.imageUrl,
          updatedAt: new Date().toISOString()
        }
      };

    } catch (error) {
      throw new BadRequestException({
        success: false,
        message: 'Failed to update profile image URL',
        error: error.message || 'UPDATE_FAILED'
      });
    }
  }

  /**
   * Helper method to extract GCS object key from full URL
   * @param imageUrl - Full GCS URL
   * @returns Object key for deletion
   */
  private extractImageKeyFromUrl(imageUrl: string): string | null {
    try {
      const url = new URL(imageUrl);
      // S3 host-style URL: bucket is in hostname, path IS the key
      // e.g. https://suraksha-lms-main-bucket.s3.us-east-1.amazonaws.com/folder/file.jpg
      if (url.hostname.includes('.amazonaws.com')) {
        return url.pathname.substring(1) || null; // strip leading /
      }
      // GCS URL: https://storage.googleapis.com/bucket-name/folder/filename
      // First path segment is the bucket name — skip it
      const pathParts = url.pathname.split('/');
      return pathParts.slice(2).join('/') || null;
    } catch (error) {
      return null;
    }
  }

  // ============================================================
  // ðŸ“§ðŸ“± OTP VERIFICATION ENDPOINTS
  // ============================================================

  /**
   * ðŸ“§ Request Email OTP
   * 
   * Sends a 6-digit OTP code to the provided email address
   * - 1 minute TTL
   * - Maximum 2 requests per day
   * 
   * @ApiKey required for system-to-system authentication
   */
  @Public()
  @Post('create-email-otp/request')
  @UseGuards(ApiKeyOrJwtGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Request Email OTP',
    description: 'Sends a 6-digit OTP code to the provided email. Valid for 1 minute. Maximum 2 requests per day.'
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['email'],
      properties: {
        email: { type: 'string', format: 'email', example: 'user@example.com' }
      }
    }
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'OTP sent successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'OTP sent to user@example.com. Valid for 1 minute(s).' },
        expiresAt: { type: 'string', format: 'date-time' },
        remainingAttempts: { type: 'number', example: 1 }
      }
    }
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Daily limit reached or invalid email'
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Email already registered',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'This email is already registered. Please login or use a different email.' },
        userId: { type: 'string', example: '12345' },
        statusCode: { type: 'number', example: 409 }
      }
    }
  })
  async requestEmailOtp(
    @Body() body: EmailDto,
    @Request() req: any,
  ) {
    const requestId = `req_${nowTimestamp()}_${crypto.randomBytes(6).toString('base64url')}`;
    const ipAddress = req.ip || req.connection.remoteAddress;
    
    const result = await this.usersService.requestEmailOtp(body.email, ipAddress);
    
    return result;
  }

  /**
   * âœ… Verify Email OTP
   * 
   * Verifies the OTP code sent to the email address
   * 
   * @ApiKey required for system-to-system authentication
   */
  @Public()
  @Post('create-email-otp/verify')
  @UseGuards(ApiKeyOrJwtGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify Email OTP',
    description: 'Verifies the 6-digit OTP code sent to the email address'
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['email', 'otpCode'],
      properties: {
        email: { type: 'string', format: 'email', example: 'user@example.com' },
        otpCode: { type: 'string', pattern: '^[0-9]{6}$', example: '123456' }
      }
    }
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Email verified successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'Email verified successfully' }
      }
    }
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid or expired OTP'
  })
  async verifyEmailOtp(
    @Body() body: EmailOtpVerifyDto,
  ) {
    const requestId = `req_${nowTimestamp()}_${crypto.randomBytes(6).toString('base64url')}`;
    
    const result = await this.usersService.verifyEmailOtp(body.email, body.otpCode);
    
    return result;
  }

  /**
   * ðŸ”„ Re-request Email OTP
   * 
   * Resends OTP to the email address (same as request endpoint)
   * Maximum 2 requests per day (including initial request)
   * 
   * @ApiKey required for system-to-system authentication
   */
  @Public()
  @Post('create-email-otp/re-request')
  @UseGuards(ApiKeyOrJwtGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Re-request Email OTP',
    description: 'Resends OTP to the email. Counts towards daily limit of 2 requests per day.'
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['email'],
      properties: {
        email: { type: 'string', format: 'email', example: 'user@example.com' }
      }
    }
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'OTP resent successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'OTP sent to user@example.com. Valid for 1 minute(s).' },
        expiresAt: { type: 'string', format: 'date-time' },
        remainingAttempts: { type: 'number', example: 0 }
      }
    }
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Daily limit reached'
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Email already registered',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'This email is already registered. Please login or use a different email.' },
        userId: { type: 'string', example: '12345' },
        statusCode: { type: 'number', example: 409 }
      }
    }
  })
  async reRequestEmailOtp(
    @Body() body: EmailDto,
    @Request() req: any,
  ) {
    const requestId = `req_${nowTimestamp()}_${crypto.randomBytes(6).toString('base64url')}`;
    const ipAddress = req.ip || req.connection.remoteAddress;
    
    const result = await this.usersService.requestEmailOtp(body.email, ipAddress);
    
    return result;
  }

  /**
   * ðŸ“± Request Phone Number OTP
   * 
   * Sends a 6-digit OTP code to the provided phone number via SMS
   * - 1 minute TTL
   * - Maximum 2 requests per day
   * 
   * @ApiKey required for system-to-system authentication
   */
  @Public()
  @Post('create-phone-number-otp/request')
  @UseGuards(ApiKeyOrJwtGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Request Phone OTP',
    description: 'Sends a 6-digit OTP code to the provided phone number via SMS. Valid for 1 minute. Maximum 2 requests per day.'
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['phoneNumber'],
      properties: {
        phoneNumber: { type: 'string', example: '0771234567', description: 'Sri Lankan phone number (077X, 94X, +94X)' }
      }
    }
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'OTP sent successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'OTP sent to +94771234567. Valid for 1 minute(s).' },
        expiresAt: { type: 'string', format: 'date-time' },
        remainingAttempts: { type: 'number', example: 1 }
      }
    }
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Daily limit reached or invalid phone number'
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Phone number already registered',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'This phone number is already registered. Please login or use a different phone number.' },
        userId: { type: 'string', example: '12345' },
        statusCode: { type: 'number', example: 409 }
      }
    }
  })
  async requestPhoneOtp(
    @Body() body: PhoneNumberDto,
    @Request() req: any,
  ) {
    const requestId = `req_${nowTimestamp()}_${crypto.randomBytes(6).toString('base64url')}`;
    const ipAddress = req.ip || req.connection.remoteAddress;
    
    const result = await this.usersService.requestPhoneOtp(body.phoneNumber, ipAddress);
    
    return result;
  }

  /**
   * âœ… Verify Phone Number OTP
   * 
   * Verifies the OTP code sent to the phone number
   * 
   * @ApiKey required for system-to-system authentication
   */
  @Public()
  @Post('create-phone-number-otp/verify')
  @UseGuards(ApiKeyOrJwtGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify Phone OTP',
    description: 'Verifies the 6-digit OTP code sent to the phone number'
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['phoneNumber', 'otpCode'],
      properties: {
        phoneNumber: { type: 'string', example: '0771234567' },
        otpCode: { type: 'string', pattern: '^[0-9]{6}$', example: '123456' }
      }
    }
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Phone verified successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'Phone number verified successfully' }
      }
    }
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid or expired OTP'
  })
  async verifyPhoneOtp(
    @Body() body: PhoneOtpVerifyDto,
  ) {
    const requestId = `req_${nowTimestamp()}_${crypto.randomBytes(6).toString('base64url')}`;

    const result = await this.usersService.verifyPhoneOtp(body.phoneNumber, body.otpCode);

    return result;
  }

  /**
   * 💬 Request WhatsApp-link Phone OTP (reverse-OTP, registration)
   *
   * Generates a 6-digit code and returns a wa.me deep link. The user sends the
   * code from their OWN WhatsApp to the business number; the webhook confirms
   * it (code + sender phone must match) and flips the verified flag. No SMS.
   * The frontend renders the link as a QR (desktop) or a tap link (mobile) and
   * polls /create-phone-number-otp/status on the "Next" click.
   */
  @Public()
  @Post('create-phone-number-otp/request-whatsapp')
  @UseGuards(ApiKeyOrJwtGuard)
  @Throttle({ default: { limit: 5, ttl: 900000 } }) // 5 per 15 min per IP
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Request Phone OTP via WhatsApp link (reverse-OTP)',
    description: 'Returns a wa.me link the user sends from their own WhatsApp to verify. No SMS is sent.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['phoneNumber'],
      properties: { phoneNumber: { type: 'string', example: '0771234567' } },
    },
  })
  async requestPhoneOtpWhatsApp(
    @Body() body: PhoneNumberDto,
    @Request() req: any,
  ) {
    const ipAddress = req.ip || req.connection?.remoteAddress;
    return this.usersService.requestPhoneOtpWhatsApp(body.phoneNumber, ipAddress);
  }

  /**
   * 🔎 WhatsApp Phone OTP status check (the "Next" click)
   *
   * Returns only { verified, expired } — never the code. Used by the frontend
   * after the user reports they have sent the WhatsApp message.
   */
  @Public()
  @Get('create-phone-number-otp/status')
  @UseGuards(ApiKeyOrJwtGuard)
  @Throttle({ default: { limit: 30, ttl: 900000 } }) // 30 polls per 15 min (user clicks Next repeatedly)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Check WhatsApp phone OTP verification status' })
  async getPhoneOtpStatus(
    @Query('phoneNumber') phoneNumber: string,
  ) {
    return this.usersService.getPhoneOtpStatus(phoneNumber);
  }

  /**
   * ðŸ”„ Re-request Phone Number OTP
   * 
   * Resends OTP to the phone number (same as request endpoint)
   * Maximum 2 requests per day (including initial request)
   * 
   * @ApiKey required for system-to-system authentication
   */
  @Public()
  @Post('create-phone-number-otp/re-request')
  @UseGuards(ApiKeyOrJwtGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Re-request Phone OTP',
    description: 'Resends OTP to the phone number via SMS. Counts towards daily limit of 2 requests per day.'
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['phoneNumber'],
      properties: {
        phoneNumber: { type: 'string', example: '0771234567' }
      }
    }
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'OTP resent successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'OTP sent to +94771234567. Valid for 1 minute(s).' },
        expiresAt: { type: 'string', format: 'date-time' },
        remainingAttempts: { type: 'number', example: 0 }
      }
    }
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Daily limit reached'
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Phone number already registered',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'This phone number is already registered. Please login or use a different phone number.' },
        userId: { type: 'string', example: '12345' },
        statusCode: { type: 'number', example: 409 }
      }
    }
  })
  async reRequestPhoneOtp(
    @Body() body: PhoneNumberDto,
    @Request() req: any,
  ) {
    const requestId = `req_${nowTimestamp()}_${crypto.randomBytes(6).toString('base64url')}`;
    const ipAddress = req.ip || req.connection.remoteAddress;
    
    const result = await this.usersService.requestPhoneOtp(body.phoneNumber, ipAddress);
    
    return result;
  }

  // ============================================================
  // 📱 PHONE NUMBER CHANGE (AUTHENTICATED USERS ONLY – SELF)
  // ============================================================

  /**
   * 📱 Step 1 – Request OTP to verify new phone number
   *
   * Sends a 6-digit OTP via SMS to the new phone number.
   * The user must verify the OTP (Step 2) before the change is committed.
   *
   * Rules:
   *  - Requires valid JWT (only for the requesting user's own account).
   *  - New number must differ from the current number.
   *  - New number must NOT already be registered by another user.
   *  - Maximum 5 OTP requests per day (inclusive of re-requests).
   */
  @Post('phone/change/request-otp')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Request OTP to Change Phone Number',
    description:
      'Sends a 6-digit OTP via SMS to the NEW phone number. ' +
      'The user must then verify the OTP (Step 2) before the change is committed. ' +
      'Only the authenticated user can change their own phone number. ' +
      'Maximum 5 OTP requests per day.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['phoneNumber'],
      properties: {
        phoneNumber: {
          type: 'string',
          example: '0771234567',
          description: 'New Sri Lankan phone number (077X, 075X, +94X format)',
        },
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'OTP sent successfully to the new phone number',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: {
          type: 'string',
          example: 'OTP sent to +94771234567. Valid for 30 minute(s). 4 requests remaining today.',
        },
        expiresAt: { type: 'string', format: 'date-time' },
        remainingAttempts: { type: 'number', example: 4 },
        totalRequests: { type: 'number', example: 1 },
      },
    },
  })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid phone number, same as current, or daily limit reached' })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'Phone number already registered by another user' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'JWT token missing or invalid' })
  async requestPhoneChangeOtp(
    @Body() body: PhoneNumberDto,
    @Request() req: JwtRequest,
  ) {
    const ipAddress = req.ip || (req as any).connection?.remoteAddress;
    return this.usersService.requestPhoneChangeOtp(req.user.s, body.phoneNumber, ipAddress);
  }

  /**
   * 💬 Request WhatsApp-link OTP to change phone number (authenticated user).
   * Returns a wa.me link; no SMS is sent.
   */
  @Post('phone/change/request-otp-whatsapp')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Request phone-change OTP via WhatsApp link (reverse-OTP)' })
  @ApiBody({
    schema: { type: 'object', required: ['phoneNumber'], properties: { phoneNumber: { type: 'string', example: '0771234567' } } },
  })
  async requestPhoneChangeOtpWhatsApp(
    @Body() body: PhoneNumberDto,
    @Request() req: JwtRequest,
  ) {
    const ipAddress = req.ip || (req as any).connection?.remoteAddress;
    return this.usersService.requestPhoneChangeOtpWhatsApp(req.user.s, body.phoneNumber, ipAddress);
  }

  /**
   * 🔎 Status check + commit for WhatsApp phone-change (the "Next" click).
   * If the webhook has confirmed the OTP, commits the phone-number update.
   */
  @Post('phone/change/commit-whatsapp')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Commit phone change once WhatsApp-verified' })
  @ApiBody({
    schema: { type: 'object', required: ['phoneNumber'], properties: { phoneNumber: { type: 'string', example: '0771234567' } } },
  })
  async commitPhoneChangeWhatsApp(
    @Body() body: PhoneNumberDto,
    @Request() req: JwtRequest,
  ) {
    return this.usersService.commitPhoneChangeIfVerified(req.user.s, body.phoneNumber);
  }

  /**
   * ✅ Step 2 – Verify OTP and commit the phone number change
   *
   * Verifies the 6-digit OTP that was sent to the new phone number.
   * On success the user's phone number is updated immediately.
   *
   * Rules:
   *  - Requires valid JWT (only the requesting user's own account).
   *  - OTP must match the code sent in Step 1 and must not be expired.
   *  - New number is re-checked to still be free before committing.
   */
  @Post('phone/change/verify-otp')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Verify OTP and Confirm Phone Number Change',
    description:
      "Verifies the 6-digit OTP sent to the new phone number and, if valid, " +
      "updates the authenticated user's phone number. " +
      "Only the authenticated user can update their own phone number.",
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['phoneNumber', 'otpCode'],
      properties: {
        phoneNumber: {
          type: 'string',
          example: '0771234567',
          description: 'The new phone number (must match the number used in the request-otp step)',
        },
        otpCode: {
          type: 'string',
          pattern: '^[0-9]{6}$',
          example: '482931',
          description: '6-digit OTP received via SMS on the new phone number',
        },
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Phone number changed successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'Phone number updated successfully.' },
        newPhoneNumber: { type: 'string', example: '+94771234567' },
      },
    },
  })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid or expired OTP' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'JWT token missing or invalid' })
  async verifyPhoneChangeAndUpdate(
    @Body() body: PhoneOtpVerifyDto,
    @Request() req: JwtRequest,
  ) {
    return this.usersService.verifyPhoneChangeAndUpdate(req.user.s, body.phoneNumber, body.otpCode);
  }

  // ============================================================
  // 📧 EMAIL CHANGE (AUTHENTICATED USERS ONLY – SELF)
  // ============================================================

  /**
   * 📧 Step 1 – Request OTP to verify new email address
   *
   * Sends a 6-digit OTP via email to the NEW address.
   * The user must verify the OTP (Step 2) before the change is committed.
   *
   * Rules:
   *  - Requires valid JWT (only for the requesting user's own account).
   *  - New email must differ from the current email.
   *  - New email must NOT already be registered by another user.
   *  - Maximum 5 OTP requests per day (inclusive of re-requests).
   */
  @Post('email/change/request-otp')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Request OTP to Change Email Address',
    description:
      'Sends a 6-digit OTP to the NEW email address. ' +
      'The user must then verify the OTP (Step 2) before the change is committed. ' +
      'Only the authenticated user can change their own email. ' +
      'Maximum 5 OTP requests per day.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['email'],
      properties: {
        email: {
          type: 'string',
          format: 'email',
          example: 'newaddress@example.com',
          description: 'New email address to verify',
        },
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'OTP sent successfully to the new email address',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: {
          type: 'string',
          example: 'OTP sent to newaddress@example.com. Valid for 30 minute(s). 4 requests remaining today.',
        },
        expiresAt: { type: 'string', format: 'date-time' },
        remainingAttempts: { type: 'number', example: 4 },
        totalRequests: { type: 'number', example: 1 },
      },
    },
  })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid email, same as current, or daily limit reached' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Email already registered by another user' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'JWT token missing or invalid' })
  async requestEmailChangeOtp(
    @Body() body: EmailDto,
    @Request() req: JwtRequest,
  ) {
    const ipAddress = req.ip || (req as any).connection?.remoteAddress;
    return this.usersService.requestEmailChangeOtp(req.user.s, body.email, ipAddress);
  }

  /**
   * ✅ Step 2 – Verify OTP and commit the email address change
   *
   * Verifies the 6-digit OTP sent to the new email address.
   * On success the user's email is updated immediately.
   *
   * Rules:
   *  - Requires valid JWT (only the requesting user's own account).
   *  - OTP must match the code sent in Step 1 and must not be expired.
   *  - New email is re-checked to still be free before committing.
   */
  @Post('email/change/verify-otp')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Verify OTP and Confirm Email Address Change',
    description:
      "Verifies the 6-digit OTP sent to the new email address and, if valid, " +
      "updates the authenticated user's email. " +
      "Only the authenticated user can update their own email address.",
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['email', 'otpCode'],
      properties: {
        email: {
          type: 'string',
          format: 'email',
          example: 'newaddress@example.com',
          description: 'The new email address (must match the address used in the request-otp step)',
        },
        otpCode: {
          type: 'string',
          pattern: '^[0-9]{6}$',
          example: '391847',
          description: '6-digit OTP received via email',
        },
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Email address changed successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'Email address updated successfully.' },
        newEmail: { type: 'string', example: 'newaddress@example.com' },
      },
    },
  })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid or expired OTP' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'JWT token missing or invalid' })
  async verifyEmailChangeAndUpdate(
    @Body() body: EmailOtpVerifyDto,
    @Request() req: JwtRequest,
  ) {
    return this.usersService.verifyEmailChangeAndUpdate(req.user.s, body.email, body.otpCode);
  }

  // ============================================================
  // ðŸš« PROFILE IMAGE REJECTION (SUPERADMIN ONLY)
  // ============================================================

  /**
   * ðŸš« Reject User Profile Image
   * 
   * Allows SUPERADMIN to reject a user's profile image
   * - Clears the imageUrl field
   * - Sends email notification to user with update link
   * - Only accessible by SUPERADMIN
   * 
   * @SuperAdmin only
   */
  @Post('reject-profile-image/:userId')
  @UseGuards(ApiKeyOrJwtGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({ 
    global: [UserType.SUPERADMIN]
  })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reject User Profile Image - SUPERADMIN Only',
    description: 'Rejects a user profile image, clears it from database, and sends email notification with profile update link'
  })
  @ApiBearerAuth()
  @ApiParam({
    name: 'userId',
    type: 'string',
    description: 'User ID whose profile image to reject',
    example: '123456'
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          description: 'Reason for rejection (optional)',
          example: 'Image does not meet quality standards'
        }
      }
    }
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Profile image rejected successfully and email sent',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'Profile image rejected successfully. Email notification sent to user.' },
        data: {
          type: 'object',
          properties: {
            userId: { type: 'string', example: '123456' },
            emailSent: { type: 'boolean', example: true },
            userEmail: { type: 'string', example: 'user@example.com' }
          }
        }
      }
    }
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'User not found'
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Access denied - SUPERADMIN access required'
  })
  async rejectProfileImage(
    @Param('userId', ParseBigIntPipe) userId: string,
    @Body() body: RejectReasonDto,
    @Request() req: any,
  ) {
    const requestId = `req_${nowTimestamp()}_${crypto.randomBytes(6).toString('base64url')}`;
    const adminUser = req.user;
    
    try {
      const result = await this.usersService.rejectProfileImage(userId, body.reason, adminUser.id);
      
      return {
        success: true,
        message: 'Profile image rejected successfully. Email notification sent to user.',
        data: result
      };
    } catch (error) {
      this.logger.error(`[${requestId}] âŒ Failed to reject profile image: ${error.message}`);
      throw error;
    }
  }
}


