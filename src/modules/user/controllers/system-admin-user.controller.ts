/**
 * System Admin User Controller
 * 
 * API endpoints for system administrators to create and manage users
 * with minimal information requirements.
 * 
 * Access: SUPER_ADMIN only
 */

import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Query,
  Param,
  UseGuards,
  Request,
  HttpStatus,
  HttpCode
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
  ApiQuery,
  ApiParam
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { FlexibleAccessGuard } from '../../../auth/guards/flexible-access.guard';
import { RequireAnyOfRoles } from '../../../auth/decorators/flexible-access.decorator';
import { UserType } from '../enums/user-type.enum';
import { NoDataMasking } from '../../../common/decorators/no-data-masking.decorator';
import { SystemAdminUserService } from '../services/system-admin-user.service';
import {
  CreateFamilyUnitDto,
  CreateFamilyUnitResponseDto,
  BulkCreateFamilyDto,
  BulkCreateFamilyResponseDto,
  GenerateProfileImageUrlDto,
  GenerateProfileImageUrlResponseDto,
  AssignProfileImageDto,
  AssignProfileImageResponseDto,
  LookupStudentResponseDto,
  GenerateProfileImageUrlByUserIdDto,
  AssignProfileImageByUserIdDto,
} from '../dto/create-family-unit.dto';
import {
  GetUnverifiedUsersQueryDto,
  PaginatedUnverifiedUsersResponseDto,
  ApproveUserImageDto,
  ApproveUserImageResponseDto,
  RejectUserImageDto,
  RejectUserImageResponseDto,
  ImageStatsResponseDto,
  UserImageHistoryResponseDto,
} from '../dto/image-verification.dto';

@ApiTags('System Admin - User Management')
@Controller('admin/users')
@UseGuards(JwtAuthGuard, FlexibleAccessGuard)
@RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
@ApiBearerAuth()
@NoDataMasking()
export class SystemAdminUserController {
  constructor(
    private readonly systemAdminUserService: SystemAdminUserService
  ) {}

  /**
   * 👨‍👩‍👧 Create Family Unit
   * 
   * Creates a complete family unit (student + optional parents) in one API call.
   * Each user only needs ONE of: email OR phoneNumber.
   * Incomplete profiles are created with INCOMPLETE status - users must complete
   * their profile via first-login flow before accessing the system.
   */
  @Post('family-unit')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create complete family unit (student + parents)',
    description: `
Creates a student with optional father, mother, and guardian in one transaction.

**Minimal Requirements:**
- Each user only needs ONE of: email OR phoneNumber
- All other fields are optional

**Profile Completion:**
- Users are created with INCOMPLETE status if missing required fields
- Users must complete first-login to set password and fill missing info
- Welcome email/SMS sent with first-login link

**Auto Features:**
- Student ID auto-generated if not provided
- Name with initials auto-generated from firstName + lastName
- Existing parents (matched by email/phone) are reused

**Example Request:**
\`\`\`json
{
  "student": {
    "firstName": "Kasun",
    "phoneNumber": "+94771234567"
  },
  "father": {
    "firstName": "Nimal",
    "phoneNumber": "+94772345678"
  },
  "mother": {
    "email": "mother@example.com"
  },
  "sendWelcomeNotifications": true,
  "instituteCode": "INST-20260122-001"
}
\`\`\`
    `
  })
  @ApiBody({ type: CreateFamilyUnitDto })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Family unit created successfully',
    type: CreateFamilyUnitResponseDto
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Validation error - student must have email or phone'
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'User with email/phone already exists'
  })
  async createFamilyUnit(
    @Body() dto: CreateFamilyUnitDto,
    @Request() req: any
  ): Promise<CreateFamilyUnitResponseDto> {
    return this.systemAdminUserService.createFamilyUnit(dto, req.user.userId);
  }

  /**
   * 📦 Bulk Create Family Units
   * 
   * Creates multiple family units in batch.
   * Useful for importing multiple students with families.
   */
  @Post('family-units/bulk')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Bulk create multiple family units',
    description: `
Creates multiple family units in batch. Each family is created in its own transaction.

**Options:**
- \`continueOnError: true\` - Continue with remaining families if one fails
- \`continueOnError: false\` - Stop on first error

**Response includes:**
- Success/failure count
- Individual results for each family
- Error details for failed creations
    `
  })
  @ApiBody({ type: BulkCreateFamilyDto })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Bulk creation completed',
    type: BulkCreateFamilyResponseDto
  })
  async bulkCreateFamilyUnits(
    @Body() dto: BulkCreateFamilyDto,
    @Request() req: any
  ): Promise<BulkCreateFamilyResponseDto> {
    return this.systemAdminUserService.bulkCreateFamilyUnits(dto, req.user.userId);
  }

  /**
   * 🔐 Complete First Login
   * 
   * Allows a user with INCOMPLETE profile to set their password
   * and optionally provide additional information.
   */
  @Patch('first-login/:userId')
  @ApiOperation({
    summary: 'Complete first login for incomplete profile user',
    description: `
Allows users created by admin to complete their registration by:
1. Setting a password (required)
2. Providing missing profile information (optional)

After completion, user can login normally.
    `
  })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['password'],
      properties: {
        password: { type: 'string', minLength: 8, description: 'New password' },
        firstName: { type: 'string', description: 'First name (if not provided earlier)' },
        lastName: { type: 'string', description: 'Last name (if not provided earlier)' },
        dateOfBirth: { type: 'string', format: 'date', description: 'Date of birth (YYYY-MM-DD)' },
        gender: { type: 'string', enum: ['MALE', 'FEMALE', 'OTHER'] }
      }
    }
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'First login completed',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        canLogin: { type: 'boolean' }
      }
    }
  })
  async completeFirstLogin(
    @Param('userId') userId: string,
    @Body() body: {
      password: string;
      firstName?: string;
      lastName?: string;
      dateOfBirth?: string;
      gender?: string;
    }
  ) {
    return this.systemAdminUserService.completeFirstLogin(
      userId,
      body.password,
      {
        firstName: body.firstName,
        lastName: body.lastName,
        dateOfBirth: body.dateOfBirth,
        gender: body.gender
      }
    );
  }

  /**
   * 📊 Get Incomplete Profiles
   * 
   * Lists all users with INCOMPLETE profile status.
   * Useful for tracking users who haven't completed registration.
   */
  @Get('incomplete-profiles')
  @ApiOperation({
    summary: 'Get users with incomplete profiles',
    description: 'Lists users who need to complete their first login'
  })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page (default: 20)' })
  @ApiQuery({ name: 'createdByAdminId', required: false, type: String, description: 'Filter by admin who created' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'List of users with incomplete profiles',
    schema: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              firstName: { type: 'string' },
              lastName: { type: 'string' },
              email: { type: 'string' },
              phoneNumber: { type: 'string' },
              profileCompletionStatus: { type: 'string' },
              profileCompletionPercentage: { type: 'number' },
              createdAt: { type: 'string', format: 'date-time' }
            }
          }
        },
        total: { type: 'number' },
        page: { type: 'number' },
        limit: { type: 'number' }
      }
    }
  })
  async getIncompleteProfiles(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('createdByAdminId') createdByAdminId?: string
  ) {
    return this.systemAdminUserService.getIncompleteProfiles({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      createdByAdminId
    });
  }

  /**
   * 📧 Resend Welcome Notification
   * 
   * Resends the first-login notification to a user.
   */
  @Post(':userId/resend-welcome')
  @ApiOperation({
    summary: 'Resend welcome notification to user',
    description: 'Resends the first-login email/SMS to a user with incomplete profile'
  })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Notification sent',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' }
      }
    }
  })
  async resendWelcomeNotification(
    @Param('userId') userId: string
  ) {
    return this.systemAdminUserService.resendWelcomeNotification(userId);
  }

  // ==========================================
  // 📸 PROFILE IMAGE MANAGEMENT APIs
  // ==========================================

  /**
   * 🔍 Lookup Student by Student ID
   * 
   * Find a student using their student ID (e.g., STU-20260123-001)
   */
  @Get('student/lookup/:studentId')
  @ApiOperation({
    summary: 'Lookup student by student ID',
    description: `
Find a student using their student ID (from students.student_id field).

**Use Case:**
- Before uploading profile image, verify student exists
- Get student details including current profile image

**Example:**
\`\`\`
GET /admin/users/student/lookup/STU-20260123-001
\`\`\`
    `
  })
  @ApiParam({ name: 'studentId', description: 'Student ID (e.g., STU-20260123-001)' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Student found',
    type: LookupStudentResponseDto
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Student not found with given ID'
  })
  async lookupStudentById(
    @Param('studentId') studentId: string
  ): Promise<LookupStudentResponseDto> {
    return this.systemAdminUserService.lookupStudentById(studentId);
  }

  /**
   * 🔗 Generate Signed URL for Profile Image Upload
   * 
   * Generates a pre-signed URL for uploading profile image directly to cloud storage.
   * After successful upload, call assign-profile-image to update student's profile.
   */
  @Post('student/profile-image/generate-url')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Generate signed URL for profile image upload',
    description: `
Generates a pre-signed URL for uploading a student's profile image directly to cloud storage.

**Workflow:**
1. Call this endpoint with student ID and file details
2. Upload file directly to the returned uploadUrl (PUT method)
3. Call /assign-profile-image with the relativePath to update profile

**Supported Formats:** JPEG, PNG, GIF, WebP
**Max File Size:** 5MB
**URL Expiry:** 10 minutes

**Example Request:**
\`\`\`json
{
  "studentId": "STU-20260123-001",
  "fileName": "profile.jpg",
  "contentType": "image/jpeg",
  "fileSize": 1048576
}
\`\`\`

**Upload Example (curl):**
\`\`\`bash
curl -X PUT "uploadUrl" \\
  -H "Content-Type: image/jpeg" \\
  --data-binary @profile.jpg
\`\`\`
    `
  })
  @ApiBody({ type: GenerateProfileImageUrlDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Signed URL generated successfully',
    type: GenerateProfileImageUrlResponseDto
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Student not found'
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid content type or file size'
  })
  async generateProfileImageUrl(
    @Body() dto: GenerateProfileImageUrlDto,
    @Request() req: any
  ): Promise<GenerateProfileImageUrlResponseDto> {
    return this.systemAdminUserService.generateProfileImageUrl(dto);
  }

  /**
   * 📸 Assign Profile Image to Student
   * 
   * After uploading image using signed URL, call this to update student's profile.
   */
  @Post('student/profile-image/assign')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Assign uploaded profile image to student',
    description: `
After uploading the image to the signed URL, call this endpoint to update the student's profile.

**Prerequisites:**
1. Generate signed URL using /generate-url endpoint
2. Upload image to the returned uploadUrl
3. Call this endpoint with studentId and relativePath

**Example Request:**
\`\`\`json
{
  "studentId": "STU-20260123-001",
  "relativePath": "user-profiles/profile-abc123.jpg"
}
\`\`\`
    `
  })
  @ApiBody({ type: AssignProfileImageDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Profile image assigned successfully',
    type: AssignProfileImageResponseDto
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Student not found'
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid relative path or file not found'
  })
  async assignProfileImage(
    @Body() dto: AssignProfileImageDto,
    @Request() req: any
  ): Promise<AssignProfileImageResponseDto> {
    return this.systemAdminUserService.assignProfileImage(dto, req.user.userId);
  }

  /**
   * 🔄 Update Profile Image (Combined - Generate + Assign)
   * 
   * One-step endpoint that generates URL, expects upload, then assigns.
   * Returns the signed URL for upload.
   */
  @Post('student/:studentId/profile-image')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Quick profile image upload URL by student ID',
    description: `
Simplified endpoint to get upload URL directly using student ID in path.
Equivalent to calling /generate-url with studentId.

**Example:**
\`\`\`
POST /admin/users/student/STU-20260123-001/profile-image
{
  "fileName": "profile.jpg",
  "contentType": "image/jpeg"
}
\`\`\`
    `
  })
  @ApiParam({ name: 'studentId', description: 'Student ID (e.g., STU-20260123-001)' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['fileName', 'contentType'],
      properties: {
        fileName: { type: 'string', example: 'profile.jpg' },
        contentType: { type: 'string', example: 'image/jpeg' },
        fileSize: { type: 'number', example: 1048576 }
      }
    }
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Signed URL generated',
    type: GenerateProfileImageUrlResponseDto
  })
  async generateProfileImageUrlByPath(
    @Param('studentId') studentId: string,
    @Body() body: { fileName: string; contentType: string; fileSize?: number }
  ): Promise<GenerateProfileImageUrlResponseDto> {
    return this.systemAdminUserService.generateProfileImageUrl({
      studentId,
      fileName: body.fileName,
      contentType: body.contentType,
      fileSize: body.fileSize
    });
  }

  // ==================== USER ID BASED PROFILE IMAGE ENDPOINTS ====================

  /**
   * Lookup user by user ID
   * GET /admin/users/lookup/:userId
   */
  @Get('lookup/:userId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Lookup user by user ID',
    description: 'Get user details including current profile image by user ID'
  })
  @ApiParam({ name: 'userId', description: 'User ID (numeric)', example: 123 })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'User found',
    type: LookupStudentResponseDto
  })
  async lookupUserById(@Param('userId') userId: number): Promise<LookupStudentResponseDto> {
    return this.systemAdminUserService.lookupUserById(userId);
  }

  /**
   * Generate profile image upload URL by user ID
   * POST /admin/users/profile-image/generate-url
   */
  @Post('profile-image/generate-url')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Generate profile image upload URL by user ID',
    description: 'Generates a signed upload URL for uploading profile image directly to cloud storage using user ID'
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Upload URL generated successfully',
    type: GenerateProfileImageUrlResponseDto
  })
  async generateProfileImageUrlByUserId(
    @Body() dto: GenerateProfileImageUrlByUserIdDto
  ): Promise<GenerateProfileImageUrlResponseDto> {
    return this.systemAdminUserService.generateProfileImageUrlByUserId(dto);
  }

  /**
   * Assign profile image by user ID
   * POST /admin/users/profile-image/assign
   */
  @Post('profile-image/assign')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Assign profile image to user by user ID',
    description: 'Assigns an uploaded profile image to user after successful upload to cloud storage using user ID'
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Profile image assigned successfully',
    type: AssignProfileImageResponseDto
  })
  async assignProfileImageByUserId(
    @Body() dto: AssignProfileImageByUserIdDto,
    @Request() req
  ): Promise<AssignProfileImageResponseDto> {
    return this.systemAdminUserService.assignProfileImageByUserId(dto, req.user.userId);
  }

  /**
   * Quick profile image URL generation by user ID (path param)
   * POST /admin/users/:userId/profile-image
   */
  @Post(':userId/profile-image')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Quick generate profile image upload URL by user ID',
    description: 'Convenience endpoint that generates upload URL using userId from path parameter'
  })
  @ApiParam({ name: 'userId', description: 'User ID (numeric)', example: 123 })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Upload URL generated successfully',
    type: GenerateProfileImageUrlResponseDto
  })
  async quickGenerateProfileImageUrlByUserId(
    @Param('userId') userId: number,
    @Body() body: { fileName: string; contentType: string; fileSize?: number }
  ): Promise<GenerateProfileImageUrlResponseDto> {
    return this.systemAdminUserService.generateProfileImageUrlByUserId({
      userId,
      fileName: body.fileName,
      contentType: body.contentType,
      fileSize: body.fileSize
    });
  }

  /**
   * ✅ Get Unverified Users
   * GET /admin/users/unverified
   * GET /admin/users/unverified-images  (alias for frontend compatibility)
   */
  @Get('unverified')
  @Get('unverified-images')
  @ApiOperation({
    summary: 'Get users with pending/unverified profile images',
    description: 'System Admin can review and moderate user profile images that need verification'
  })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (default: 1)', example: 1 })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page (default: 20)', example: 20 })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by verification status', enum: ['PENDING', 'VERIFIED', 'REJECTED'] })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'List of unverified users retrieved successfully',
    type: PaginatedUnverifiedUsersResponseDto
  })
  async getUnverifiedUsers(
    @Query() query: GetUnverifiedUsersQueryDto
  ): Promise<PaginatedUnverifiedUsersResponseDto> {
    return this.systemAdminUserService.getUnverifiedUsers(query);
  }

  /**
   * ✅ Approve User Profile Image
   * POST /admin/users/:userId/approve-image
   */
  @Post(':userId/approve-image')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Approve user profile image',
    description: 'Mark user profile image as verified and send confirmation email to user'
  })
  @ApiParam({ name: 'userId', description: 'User ID', example: 123 })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Profile image approved successfully',
    type: ApproveUserImageResponseDto
  })
  async approveUserImage(
    @Param('userId') userId: number,
    @Body() dto: ApproveUserImageDto,
    @Request() req
  ): Promise<ApproveUserImageResponseDto> {
    return this.systemAdminUserService.approveUserImage(
      { ...dto, userId },
      req.user.userId
    );
  }

  /**
   * ✅ Reject User Profile Image
   * POST /admin/users/:userId/reject-image
   * 
   * Deletes rejected image, generates 7-day signed upload URL, sends email with re-upload link
   */
  @Post(':userId/reject-image')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reject user profile image with reason',
    description: 'Reject user profile image, delete from cloud storage, and send email with 7-day upload link'
  })
  @ApiParam({ name: 'userId', description: 'User ID', example: 123 })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Profile image rejected successfully',
    type: RejectUserImageResponseDto
  })
  async rejectUserImage(
    @Param('userId') userId: number,
    @Body() dto: RejectUserImageDto,
    @Request() req
  ): Promise<RejectUserImageResponseDto> {
    return this.systemAdminUserService.rejectUserImage(
      { ...dto, userId },
      req.user.userId
    );
  }

  /** GET /admin/users/image-stats — overall profile image verification counts */
  @Get('image-stats')
  @ApiOperation({ summary: 'Profile image verification statistics', description: 'Counts of pending / verified / rejected user profile image submissions' })
  @ApiResponse({ status: HttpStatus.OK, type: ImageStatsResponseDto })
  async getImageStats(): Promise<ImageStatsResponseDto> {
    return this.systemAdminUserService.getImageStats();
  }

  /** GET /admin/users/:userId/image-history — full submission history for one user */
  @Get(':userId/image-history')
  @ApiOperation({ summary: 'User profile image submission history', description: 'All past image submissions for a user with their verification outcomes' })
  @ApiParam({ name: 'userId', description: 'User ID', example: 123 })
  @ApiResponse({ status: HttpStatus.OK, type: UserImageHistoryResponseDto })
  async getUserImageHistory(@Param('userId') userId: string): Promise<UserImageHistoryResponseDto> {
    return this.systemAdminUserService.getUserImageHistory(userId);
  }

  // ==========================================
  // 🎴 CARD MANAGEMENT ENDPOINTS
  // ==========================================

  /**
   * Get card info for a user (normal + RFID)
   * GET /admin/users/:userId/card-info
   */
  @Get(':userId/card-info')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get user card information (normal + RFID)',
    description: 'Returns both normal card (QR/barcode) and RFID card status, IDs, and expiry dates'
  })
  @ApiParam({ name: 'userId', description: 'User ID', example: 123 })
  async getUserCardInfo(@Param('userId') userId: number) {
    return this.systemAdminUserService.getUserCardInfo(userId);
  }

  /**
   * Assign a normal card (QR/barcode) to a user
   * POST /admin/users/:userId/assign-card
   */
  @Post(':userId/assign-card')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Assign normal card (QR/barcode) to user',
    description: 'Assigns a card ID to the user. If user already has a card, old one is replaced.'
  })
  @ApiParam({ name: 'userId', description: 'User ID', example: 123 })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        cardId: { type: 'string', example: 'CARD-2025-0001' },
        cardExpiryDate: { type: 'string', example: '2026-12-31', description: 'Optional expiry date (ISO format)' }
      },
      required: ['cardId']
    }
  })
  async assignNormalCard(
    @Param('userId') userId: number,
    @Body() dto: { cardId: string; cardExpiryDate?: string },
    @Request() req
  ) {
    return this.systemAdminUserService.assignNormalCard(userId, dto, req.user.userId);
  }

  /**
   * Update card status (normal or RFID, independently)
   * PATCH /admin/users/:userId/card-status
   */
  @Patch(':userId/card-status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update card status (normal or RFID independently)',
    description: 'Update card status for a user. Normal card and RFID card are independent - deactivating one does not affect the other.'
  })
  @ApiParam({ name: 'userId', description: 'User ID', example: 123 })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        cardType: { type: 'string', enum: ['normal', 'rfid'], example: 'normal' },
        status: { type: 'string', enum: ['ACTIVE', 'INACTIVE', 'DEACTIVATED', 'EXPIRED', 'LOST', 'DAMAGED', 'REPLACED'], example: 'DEACTIVATED' }
      },
      required: ['cardType', 'status']
    }
  })
  async updateUserCardStatus(
    @Param('userId') userId: number,
    @Body() dto: { cardType: 'normal' | 'rfid'; status: any },
    @Request() req
  ) {
    return this.systemAdminUserService.updateUserCardStatus(userId, dto, req.user.userId);
  }

  /**
   * Lookup user by card ID or RFID
   * GET /admin/users/card-lookup/:cardId
   */
  @Get('card-lookup/:cardId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Lookup user by card ID or RFID',
    description: 'Finds user by normal card ID first, then fallback to RFID. Returns full card info for both card types.'
  })
  @ApiParam({ name: 'cardId', description: 'Card ID or RFID to look up', example: 'CARD-2025-0001' })
  async lookupUserByCard(@Param('cardId') cardId: string) {
    return this.systemAdminUserService.lookupUserByCard(cardId);
  }
}
