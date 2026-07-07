/**
 * Institute Admin User Controller
 *
 * Provides endpoints for **institute admins** to create and manage users
 * within their institute — including students, teachers, and sub-admins.
 *
 * Access: JWT authenticated user who is an INSTITUTE_ADMIN of the target institute.
 */

import {
  Controller,
  Post,
  Body,
  Param,
  UseGuards,
  Request,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { FlexibleAccessGuard } from '../../../auth/guards/flexible-access.guard';
import { RequireAnyOfRoles } from '../../../auth/decorators/flexible-access.decorator';
import { NoDataMasking } from '../../../common/decorators/no-data-masking.decorator';
import { ParseBigIntPipe } from '../../../common/pipes/parse-bigint.pipe';
import { ParseIdPipe } from '../../../common/pipes/parse-id.pipe';
import { InstituteAdminUserService } from '../services/institute-admin-user.service';
import { MockUserBatchCreationService } from '../services/mock-user-batch.service';
import {
  CreateInstituteUserDto,
  CreateInstituteUserResponseDto,
  LinkInstituteUserDto,
} from '../dto/create-institute-user.dto';

@ApiTags('Institute Admin - User Management')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, FlexibleAccessGuard)
@Controller('institutes/:instituteId/users')
@NoDataMasking()
export class InstituteAdminUserController {
  constructor(
    private readonly instituteAdminUserService: InstituteAdminUserService,
    private readonly mockUserBatchService: MockUserBatchCreationService,
  ) {}

  /**
   * 🏫 Create user within an institute
   *
   * Institute admins can create students, teachers, and sub-admins in one request.
   *
   * **Key features:**
   * - Provide `instituteUserImageUrl` (obtained from the signed-upload endpoint) to
   *   attach an **institute-scoped image** that is **automatically verified**.
   * - Provide `globalImageUrl` to request a **global profile image** — this is
   *   saved as `PENDING` and requires **system admin approval**.
   * - No ID card email is sent until the global image is approved.
   * - For `STUDENT` role: optionally enroll in classes (`classEnrollments`) with
   *   nested subject enrollments, and provide parent information.
   *
   * **Image flow recap:**
   * ```
   * instituteUserImageUrl  →  user_images(scope=INSTITUTE, status=VERIFIED)
   *                          institute_user.institute_user_image_url ← URL
   *
   * globalImageUrl         →  user_images(scope=GLOBAL, status=PENDING)
   *                          user.imageVerificationStatus = PENDING
   *                          user.imageUrl = NULL (set by system admin after approval)
   *                          ⚠️ No ID card email until VERIFIED
   * ```
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequireAnyOfRoles({ instituteAdmin: true })
  @ApiParam({
    name: 'instituteId',
    description: 'Institute ID',
    example: '42',
  })
  @ApiOperation({
    summary: 'Create user within institute (institute admin only)',
    description: `
Creates a new user and immediately enrolls them in the institute.

**Who can call this:** Active INSTITUTE_ADMIN of the target institute.

**Roles you can create:**
| \`instituteUserType\`  | Global type assigned      | Student record? | Parent records? |
|------------------------|---------------------------|-----------------|-----------------|
| STUDENT                | USER                      | ✅ Yes           | Optional        |
| TEACHER                | USER_WITHOUT_STUDENT      | No              | No              |
| INSTITUTE_ADMIN        | USER_WITHOUT_STUDENT      | No              | No              |
| ATTENDANCE_MARKER      | USER_WITHOUT_STUDENT      | No              | No              |

**Image handling:**
- \`instituteUserImageUrl\` → INSTITUTE-scoped, **auto-VERIFIED**, stored in \`institute_user\` table.
- \`globalImageUrl\` → GLOBAL-scoped, **PENDING**, requires system admin approval.
  Until approved: \`user.imageUrl\` is \`null\` and no ID card email is dispatched.

**Class & subject enrollment (STUDENT only):**
Provide \`classEnrollments\` with nested \`subjectEnrollments\` — all enrollments are 
auto-verified and immediately ACTIVE.

**First-login flow:**
If \`password\` is omitted, the user receives a first-login email with a link to set 
their password and complete their profile.
    `,
  })
  @ApiBody({ type: CreateInstituteUserDto })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'User created and enrolled successfully',
    type: CreateInstituteUserResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Validation error — at least email or phone required, or user already exists',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 400 },
        message: { type: 'string', example: 'User with email x@y.com already exists (ID: 123). Use assign endpoint instead.' },
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Caller is not an active INSTITUTE_ADMIN of this institute',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 403 },
        message: { type: 'string', example: 'You must be an active INSTITUTE_ADMIN of this institute to create users.' },
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Institute not found',
  })
  async createInstituteUser(
    @Param('instituteId', ParseIdPipe) instituteId: string,
    @Body() dto: CreateInstituteUserDto,
    @Request() req: any,
  ): Promise<CreateInstituteUserResponseDto> {
    const adminUserId: string = req.user.s ?? req.user.userId ?? req.user.sub;
    return this.instituteAdminUserService.createInstituteUser(instituteId, adminUserId, dto);
  }

  /**
   * 🔗 Link an EXISTING user to the institute (and complete missing data).
   *
   * Same payload shape as create ({@link CreateInstituteUserDto}). The user is resolved
   * by `:userId`; we never create a new user. Only columns that are currently EMPTY on
   * the user / student / parent records are written — existing data is never overwritten.
   * For STUDENT role, a student record is created if missing and empty parent slots are
   * linked. Use `GET /users/:userId/link-profile` first to know which fields to collect.
   */
  @Post(':userId/link')
  @HttpCode(HttpStatus.CREATED)
  @RequireAnyOfRoles({ instituteAdmin: true })
  @ApiParam({ name: 'instituteId', description: 'Institute ID', example: '42' })
  @ApiParam({ name: 'userId', description: 'Existing system user ID to link', example: '123' })
  @ApiOperation({
    summary: 'Link an existing user to the institute, completing only the missing data',
    description:
      'Assigns an already-registered user to the institute and fills only the empty ' +
      'user/student/parent columns from the payload. Existing values are never overwritten. ' +
      'Creates a student record if the role is STUDENT and none exists; links empty parent slots only.',
  })
  @ApiBody({ type: LinkInstituteUserDto })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'User linked successfully', type: CreateInstituteUserResponseDto })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Role conflict or invalid request' })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'User already assigned to this institute for this role' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Institute or user not found' })
  async linkInstituteUser(
    @Param('instituteId', ParseIdPipe) instituteId: string,
    @Param('userId', ParseBigIntPipe) userId: string,
    @Body() dto: LinkInstituteUserDto,
    @Request() req: any,
  ): Promise<CreateInstituteUserResponseDto> {
    const adminUserId: string = req.user.s ?? req.user.userId ?? req.user.sub;
    return this.instituteAdminUserService.linkInstituteUser(instituteId, adminUserId, userId, dto as CreateInstituteUserDto);
  }


  /**
   * 🎭 Create a batch of mock (hollow) student records.
   *
   * Pre-creates student shells with no name/email/phone — just a system ID, institute
   * enrollment, class assignment, and optionally a smart card. Students claim these
   * later by entering their institute user ID on the public registration form.
   */
  @Post('mock-batch')
  @HttpCode(HttpStatus.CREATED)
  @RequireAnyOfRoles({ instituteAdmin: true })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiOperation({
    summary: 'Batch-create hollow mock student records (institute admin only)',
    description:
      'Creates hollow student records (isMock=true) pre-assigned to classes. ' +
      'Students claim them later via the public registration form using their institute user ID.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['classDistribution'],
      properties: {
        classDistribution: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              classId: { type: 'string' },
              count: { type: 'number' },
            },
          },
          example: [{ classId: 'abc-123', count: 30 }],
        },
        assignCards: { type: 'boolean', default: false, description: 'Deprecated — use assignInstituteCard' },
        assignInstituteCard: { type: 'boolean', default: false },
        assignSurakshaCard: { type: 'boolean', default: false },
      },
    },
  })
  async createMockBatch(
    @Param('instituteId', ParseIdPipe) instituteId: string,
    @Body() body: { classDistribution: Array<{ classId: string; count: number }>; assignCards?: boolean; assignInstituteCard?: boolean; assignSurakshaCard?: boolean },
    @Request() req: any,
  ) {
    const adminUserId: string = String(req.user.s ?? req.user.userId ?? req.user.sub);
    return this.mockUserBatchService.createMockBatch({
      instituteId,
      adminUserId,
      classDistribution: body.classDistribution ?? [],
      assignCards: body.assignCards,
      assignInstituteCard: body.assignInstituteCard,
      assignSurakshaCard: body.assignSurakshaCard,
    });
  }

}

