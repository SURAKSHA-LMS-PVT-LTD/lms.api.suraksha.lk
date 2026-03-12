import { ParseBigIntPipe } from '../../../common/pipes/parse-bigint.pipe';
import { Controller, Post, Body, BadRequestException, Param, UseGuards, Request, HttpStatus, HttpCode, UseFilters } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBearerAuth, ApiConsumes, ApiProperty } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { FlexibleAccessGuard } from '../../../auth/guards/flexible-access.guard';
import { RequireAnyOfRoles } from '../../../auth/decorators/flexible-access.decorator';
import { CloudStorageService } from '../../../common/services/cloud-storage.service';
import { UsersService } from '../user.service';
import { JwtRequest } from '@common/interfaces/jwt-request.interface';
import { IsUrl, IsString } from 'class-validator';

class UpdateImageUrlDto {
  @ApiProperty({ 
    description: 'Profile image URL obtained from /upload/generate-signed-url endpoint',
    example: 'https://storage.googleapis.com/suraksha-lms/profile-images/user-123-profile.png'
  })
  @IsUrl({}, { message: 'Image URL must be a valid URL' })
  imageUrl: string;
}

class UpdateIdDocumentUrlDto {
  @ApiProperty({ 
    description: 'ID document URL obtained from /upload/generate-signed-url endpoint',
    example: 'https://storage.googleapis.com/suraksha-lms/id-documents/user-123-id.pdf'
  })
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
    await this.userService.updateImageUrl(userId, relativePath);

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
      // Remove leading slash and bucket name if present
      let path = urlObj.pathname.substring(1);
      
      // If URL contains bucket name, remove it
      const bucketName = process.env.GCS_BUCKET_NAME || process.env.AWS_S3_BUCKET || '';
      if (bucketName && path.startsWith(bucketName + '/')) {
        path = path.substring(bucketName.length + 1);
      }
      
      return path;
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
    
    // ✅ SECURITY: Verify file exists in cloud storage before accepting URL
    const fileExists = await this.cloudStorageService.fileExists(relativePath);
    if (!fileExists) {
      throw new BadRequestException(
        'ID document file not found in storage. Please upload the file using /upload/generate-signed-url first.'
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
}
