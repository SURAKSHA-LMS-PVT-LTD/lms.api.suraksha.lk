import { ParseBigIntPipe } from '../../../common/pipes/parse-bigint.pipe';
import { ParseIdPipe } from '../../../common/pipes/parse-id.pipe';
import { Controller, Post, Get, Delete, Body, BadRequestException, Param, UseGuards, Request, Req, HttpStatus, HttpCode, UseFilters } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBearerAuth, ApiConsumes, ApiProperty } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { FlexibleAccessGuard } from '../../../auth/guards/flexible-access.guard';
import { RequireAnyOfRoles } from '../../../auth/decorators/flexible-access.decorator';
import { CloudStorageService } from '../../../common/services/cloud-storage.service';
import { UsersService } from '../user.service';
import { JwtRequest } from '@common/interfaces/jwt-request.interface';
import { IsUrl, IsString, IsOptional, IsEnum } from 'class-validator';
import { Transform } from 'class-transformer';
import { ImageScope } from '../entities/user-image.entity';

/** Encode spaces (and other illegal characters) in the path portion of a URL so
 *  that @IsUrl() accepts filenames with spaces like 'Screenshot 2025-03-29.png'. */
function encodeUrlSpaces(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  return value.replace(/ /g, '%20');
}

class UpdateImageUrlDto {
  @ApiProperty({ 
    description: 'Profile image URL obtained from /upload/generate-signed-url endpoint',
    example: 'https://storage.suraksha.lk/profile-images/user-123-profile.png'
  })
  @Transform(({ value }) => encodeUrlSpaces(value))
  @IsUrl({}, { message: 'Image URL must be a valid URL' })
  imageUrl: string;

  @ApiProperty({
    description: 'Image scope: GLOBAL (visible everywhere) or INSTITUTE (tied to a specific institute)',
    enum: ImageScope,
    required: false,
    default: ImageScope.GLOBAL,
  })
  @IsOptional()
  @IsEnum(ImageScope)
  scope?: ImageScope;

  @ApiProperty({
    description: 'Institute ID — required when scope is INSTITUTE',
    required: false,
    example: '42',
  })
  @IsOptional()
  @IsString()
  instituteId?: string;
}

class UpdateIdDocumentUrlDto {
  @ApiProperty({ 
    description: 'ID document URL obtained from /upload/generate-signed-url endpoint',
    example: 'https://storage.suraksha.lk/id-documents/user-123-id.pdf'
  })
  @Transform(({ value }) => encodeUrlSpaces(value))
  @IsUrl({}, { message: 'ID document URL must be a valid URL' })
  idUrl: string;
}

@ApiTags('User Profile Image')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UserProfileImageController {
  constructor(
    private readonly cloudStorageService: CloudStorageService,
    private readonly userService: UsersService
  ) {}

  /**
   * Get the calling user's profile image verification status.
   * GET /users/profile/image-status
   */
  @Get('profile/image-status')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ anyInstituteRole: true, global: [] })
  @ApiOperation({
    summary: 'Get current user profile image status',
    description: 'Returns the profile image URL and verification status (PENDING, VERIFIED, REJECTED) for the authenticated user.'
  })
  @ApiResponse({
    status: 200,
    description: 'Image status retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: {
          type: 'object',
          properties: {
            userId: { type: 'string' },
            imageUrl: { type: 'string', nullable: true },
            imageVerificationStatus: { type: 'string', enum: ['PENDING', 'VERIFIED', 'REJECTED'], nullable: true }
          }
        }
      }
    }
  })
  async getProfileImageStatus(@Req() request: JwtRequest): Promise<any> {
    const userId = request.user.s;
    const user = await this.userService.findOne(userId);
    if (!user) {
      throw new BadRequestException('User not found');
    }

    // Also return the URL of the image currently under review (from user_images table)
    let pendingImageUrl: string | null = null;
    let pendingImageId: string | null = null;
    if ((user as any).imageVerificationStatus === 'PENDING') {
      const history = await this.userService.getUserImageHistory(userId);
      const pending = history.find(r => r.status === 'PENDING');
      if (pending) {
        pendingImageUrl = this.cloudStorageService.getFullUrl(pending.imageUrl);
        pendingImageId = pending.id;
      }
    }

    return {
      success: true,
      data: {
        userId,
        // Current approved image (null until an image has been approved)
        imageUrl: (user as any).imageUrl
          ? this.cloudStorageService.getFullUrl((user as any).imageUrl)
          : null,
        // Image currently under review (PENDING submission)
        pendingImageUrl,
        pendingImageId,
        imageVerificationStatus: (user as any).imageVerificationStatus ?? null,
      },
    };
  }

  @Post(':id/profile-image')
  @Throttle({ default: { limit: 5, ttl: 900000 } }) // 🔒 SECURITY: 5 profile image updates per 15 minutes
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    anyInstituteRole: true,
    global: []
  })
  @ApiOperation({ 
    summary: 'Update user profile image', 
    description: 'Update user profile image URL. Image will be set to PENDING status for System Admin verification. First upload the image using /upload/generate-signed-url endpoint, then send the public URL here.' 
  })
  @ApiConsumes('application/json')
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Profile image URL updated successfully',
    schema: {
      example: {
        success: true,
        message: 'Profile image updated successfully',
        data: {
          userId: '123',
          imageUrl: 'https://storage.googleapis.com/suraksha-lms/profile-images/user-123-profile.png'
        }
      }
    }
  })
  @ApiResponse({ 
    status: HttpStatus.BAD_REQUEST, 
    description: 'Invalid image URL or user not found' 
  })
  @ApiParam({ name: 'id', description: 'User ID' })
  @HttpCode(HttpStatus.OK)
  async uploadProfileImage(
    @Param('id', ParseBigIntPipe) userId: string,
    @Body() dto: UpdateImageUrlDto,
    @Request() req: JwtRequest
  ) {
    // Verify user exists
    const user = await this.userService.findOne(userId);
    if (!user) {
      throw new BadRequestException('User not found');
    }

    // Strip base URL to store only relative path
    const relativePath = this.stripBaseUrl(dto.imageUrl);
    
    // ✅ SECURITY: Verify file exists in cloud storage before accepting URL
    const fileExists = await this.cloudStorageService.fileExists(relativePath);
    if (!fileExists) {
      throw new BadRequestException(
        'Image file not found in storage. Please upload the file using /upload/generate-signed-url first.'
      );
    }
    
    // Store relative path in database
    await this.userService.updateImageUrl(userId, relativePath, dto.scope, dto.instituteId);

    // Generate full URL for API response
    const fullPublicUrl = this.cloudStorageService.getPublicUrl(relativePath);

    return {
      success: true,
      message: 'Profile image updated successfully',
      data: {
        userId,
        imageUrl: fullPublicUrl
      }
    };
  }

  private stripBaseUrl(url: string): string {
    // Remove base URL to store only relative path
    // e.g., "https://storage.googleapis.com/bucket/path/file.png" -> "path/file.png"
    try {
      const urlObj = new URL(url);
      // Remove leading slash; then decode %20 etc. so the path matches
      // the actual S3/GCS key (which was stored with literal spaces, not %20).
      let filePath = decodeURIComponent(urlObj.pathname.substring(1));
      
      // If URL contains bucket name as first path segment, remove it
      const bucketName = process.env.GCS_BUCKET_NAME || process.env.AWS_S3_BUCKET || '';
      if (bucketName && filePath.startsWith(bucketName + '/')) {
        filePath = filePath.substring(bucketName.length + 1);
      }
      
      return filePath;
    } catch (error) {
      // If not a valid URL, assume it's already a relative path
      return url.startsWith('/') ? url.substring(1) : url;
    }
  }

  @Post(':userId/upload-id-document')
  @Throttle({ default: { limit: 5, ttl: 900000 } }) // 🔒 SECURITY: 5 ID document updates per 15 minutes
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    anyInstituteRole: true,
    global: []
  })
  @ApiOperation({
    summary: 'Update user ID document',
    description: 'Update user ID document URL. First upload the document using /upload/generate-signed-url endpoint, then send the public URL here.'
  })
  @ApiParam({
    name: 'userId',
    description: 'User ID',
    example: '123'
  })
  @ApiConsumes('application/json')
  @ApiResponse({
    status: 200,
    description: 'ID document URL updated successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'ID document updated successfully' },
        data: {
          type: 'object',
          properties: {
            userId: { type: 'string', example: '123' },
            idUrl: { type: 'string', example: 'https://storage.googleapis.com/suraksha-lms/id-documents/user-123-id.pdf' }
          }
        }
      }
    }
  })
  @ApiResponse({
    status: 400,
    description: 'Bad Request - Invalid URL or user not found'
  })
  async uploadIdDocument(
    @Param('userId') userId: string,
    @Body() dto: UpdateIdDocumentUrlDto
  ): Promise<any> {
    // Verify user exists
    const user = await this.userService.findOne(userId);
    if (!user) {
      throw new BadRequestException('User not found');
    }

    // Strip base URL to store only relative path
    const relativePath = this.stripBaseUrl(dto.idUrl);
    
    // ✅ SECURITY: Verify file exists in cloud storage before accepting URL.
    // Retry once after a short delay to handle the race condition where the S3
    // presigned POST upload has just completed when this endpoint is called.
    let fileExists = await this.cloudStorageService.fileExists(relativePath);
    if (!fileExists) {
      await new Promise(resolve => setTimeout(resolve, 1500));
      fileExists = await this.cloudStorageService.fileExists(relativePath);
    }
    if (!fileExists) {
      throw new BadRequestException(
        'ID document file not found in storage. Please ensure the file upload has completed before calling this endpoint.'
      );
    }
    
    // Store relative path in database
    await this.userService.updateIdUrl(userId, relativePath);

    // Generate full URL for API response
    const fullPublicUrl = this.cloudStorageService.getPublicUrl(relativePath);

    return {
      success: true,
      message: 'ID document updated successfully',
      data: {
        userId,
        idUrl: fullPublicUrl
      }
    };
  }

  /**
   * ✅ PUBLIC ENDPOINT: Re-upload Profile Image After Rejection
   * POST /users/profile/image/reupload?token=xxx
   * 
   * Allows users to re-upload profile image using token from rejection email
   * No authentication required - validates upload token instead
   */
  @Post('profile/image/reupload')
  @Throttle({ default: { limit: 10, ttl: 3600000 } }) // 🔒 SECURITY: 10 re-uploads per hour
  @ApiOperation({
    summary: '🔓 Public: Re-upload profile image after rejection',
    description: 'Allows users to re-upload their profile image using the token received in rejection email. No authentication required.'
  })
  @ApiConsumes('application/json')
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Profile image re-uploaded successfully. Status set to PENDING for review.',
    schema: {
      example: {
        success: true,
        message: 'Profile image uploaded successfully. It will be reviewed by our team.',
        data: {
          userId: '123',
          imageUrl: 'https://storage.googleapis.com/suraksha-lms/profile-images/user-123-profile.png',
          status: 'PENDING'
        }
      }
    }
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid or expired token'
  })
  @HttpCode(HttpStatus.OK)
  async reuploadProfileImage(
    @Body() body: { token: string; imageUrl: string }
  ) {
    const { token, imageUrl } = body;

    // Validate and decode upload token
    let tokenData: any;
    try {
      const decoded = Buffer.from(token, 'base64url').toString('utf-8');
      tokenData = JSON.parse(decoded);

      // Check expiration
      if (tokenData.exp < Date.now()) {
        throw new BadRequestException('Upload token has expired. Please request a new link from support.');
      }

      // Verify purpose
      if (tokenData.purpose !== 'profile-image-reupload') {
        throw new BadRequestException('Invalid upload token');
      }
    } catch (error) {
      throw new BadRequestException('Invalid or malformed upload token');
    }

    const userId = tokenData.userId?.toString();
    if (!userId) {
      throw new BadRequestException('Invalid token: missing user ID');
    }

    // Verify user exists
    const user = await this.userService.findOne(userId);
    if (!user) {
      throw new BadRequestException('User not found');
    }

    // Strip base URL to store only relative path
    const relativePath = this.stripBaseUrl(imageUrl);
    
    // ✅ SECURITY: Verify file exists in cloud storage before accepting URL
    const fileExists = await this.cloudStorageService.fileExists(relativePath);
    if (!fileExists) {
      throw new BadRequestException(
        'Image file not found in storage. Please upload the file first using the provided signed URL.'
      );
    }
    
    // Store relative path in database with PENDING status
    await this.userService.updateImageUrl(userId, relativePath);

    // Generate full URL for API response
    const fullPublicUrl = this.cloudStorageService.getPublicUrl(relativePath);

    return {
      success: true,
      message: 'Profile image uploaded successfully. It will be reviewed by our team.',
      data: {
        userId,
        imageUrl: fullPublicUrl,
        status: 'PENDING'
      }
    };
  }

  /**
   * Get the authenticated user's profile image history / current status.
   * GET /users/profile/image-history
   *
   * Returns an array with the current image record (status, URL, verification
   * metadata). A separate history table does not exist, so the single current
   * record is returned inside a consistent array envelope so the frontend can
   * iterate it exactly like a real history list.
   */
  @Get('profile/image-history')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ anyInstituteRole: true, global: [] })
  @ApiOperation({
    summary: 'Get current user profile image history',
    description: 'Returns the profile image status record for the authenticated user. Includes current image URL, verification status, rejection reason (if any), and verification timestamps.',
  })
  @ApiResponse({
    status: 200,
    description: 'Image history retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              imageUrl: { type: 'string', nullable: true },
              status: { type: 'string', enum: ['PENDING', 'VERIFIED', 'REJECTED'], nullable: true },
              rejectionReason: { type: 'string', nullable: true },
              verifiedAt: { type: 'string', format: 'date-time', nullable: true },
              verifiedBy: { type: 'string', nullable: true },
            },
          },
        },
      },
    },
  })
  async getProfileImageHistory(@Req() request: JwtRequest): Promise<any> {
    const userId = request.user.s;
    const user = await this.userService.findOne(userId);
    if (!user) {
      throw new BadRequestException('User not found');
    }

    const records = await this.userService.getUserImageHistory(userId);

    const currentImageUrl = (user as any).imageUrl
      ? this.cloudStorageService.getFullUrl((user as any).imageUrl)
      : null;
    const currentStatus = (user as any).imageVerificationStatus ?? null;

    // Legacy users: image only stored on users.imageUrl, no user_images rows yet
    if (records.length === 0 && (user as any).imageUrl) {
      const legacyStatus = currentStatus ?? 'PENDING';
      return {
        success: true,
        currentImageUrl,
        currentStatus: legacyStatus,
        data: [{
          imageId: null,
          imageUrl: currentImageUrl,
          scope: 'GLOBAL',
          instituteId: null,
          status: legacyStatus,
          rejectionReason: null,
          verifiedAt: null,
          verifiedBy: null,
          uploadedAt: null,
        }],
      };
    }

    const history = records.map(record => ({
      imageId: record.id,
      imageUrl: this.cloudStorageService.getFullUrl(record.imageUrl),
      scope: record.scope,
      instituteId: record.instituteId ?? null,
      status: record.status,
      rejectionReason: record.rejectionReason ?? null,
      verifiedAt: record.verifiedAt ? record.verifiedAt.toISOString() : null,
      verifiedBy: record.verifiedBy ?? null,
      uploadedAt: record.createdAt ? record.createdAt.toISOString() : null,
    }));

    return {
      success: true,
      currentImageUrl,
      currentStatus,
      data: history,
    };
  }

  /** GET /users/:id/profile-image/institute/:instituteId/history
   * All institute-scoped image submissions for a user in a specific institute.
   */
  @Get(':id/profile-image/institute/:instituteId/history')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ anyInstituteRole: true, global: [] })
  @ApiOperation({ summary: 'Institute image history for a user', description: 'Returns all past image submissions scoped to the specified institute.' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Institute image history retrieved successfully' })
  async getInstituteImageHistory(
    @Param('id', ParseBigIntPipe) userId: string,
    @Param('instituteId', ParseIdPipe) instituteId: string,
  ): Promise<any> {
    const { currentInstituteImageUrl, currentInstituteImageStatus, records } =
      await this.userService.getInstituteImageHistory(userId, instituteId);
    const history = records.map(r => ({
      imageId: r.id,
      imageUrl: this.cloudStorageService.getFullUrl(r.imageUrl),
      status: r.status,
      rejectionReason: r.rejectionReason ?? null,
      verifiedBy: r.verifiedBy ?? null,
      verifiedAt: r.verifiedAt ? r.verifiedAt.toISOString() : null,
      submittedAt: r.createdAt.toISOString(),
    }));
    return {
      success: true,
      currentInstituteImageUrl,
      currentInstituteImageStatus,
      data: history,
    };
  }

  /** DELETE /users/:id/profile-image/institute/:instituteId
   * Deletes the PENDING institute-scoped image. Only allowed while status is PENDING.
   */
  @Delete(':id/profile-image/institute/:instituteId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ anyInstituteRole: true, global: [] })
  @ApiOperation({ summary: 'Delete pending institute image', description: 'Removes the pending institute-scoped image submission. Only works while status is PENDING.' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Pending institute image deleted successfully' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'No pending image found or image already verified/rejected' })
  async deleteInstituteProfileImage(
    @Param('id', ParseBigIntPipe) userId: string,
    @Param('instituteId', ParseIdPipe) instituteId: string,
  ): Promise<any> {
    return this.userService.deleteInstituteProfileImage(userId, instituteId);
  }
}

