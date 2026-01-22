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
import { SystemAdminGuard } from '../../user-card-management/guards/system-admin.guard';
import { SystemAdminUserService } from '../services/system-admin-user.service';
import {
  CreateFamilyUnitDto,
  CreateFamilyUnitResponseDto,
  BulkCreateFamilyDto,
  BulkCreateFamilyResponseDto
} from '../dto/create-family-unit.dto';

@ApiTags('System Admin - User Management')
@Controller('admin/users')
@UseGuards(JwtAuthGuard, SystemAdminGuard)
@ApiBearerAuth()
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
}
