import {
  Controller,
  Post,
  Get,
  Query,
  Body,
  UseGuards,
  HttpStatus,
  BadRequestException,
  Logger,
  Headers,
  Ip,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiBody,
  ApiQuery,
  ApiHeader,
  ApiProperty,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsString, IsNotEmpty, IsNumber, IsEnum } from 'class-validator';
import { CloudStorageService } from '../services/cloud-storage.service';
import { ApiKeyOrJwtGuard } from '../../auth/guards/api-key-or-jwt.guard';
import { Public } from '../decorators/public.decorator';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';

class PublicGenerateUploadUrlDto {
  @ApiProperty({
    enum: ['institute-images'],
    description: 'Target folder (institute registration only)',
    example: 'institute-images',
  })
  @IsEnum(['institute-images'])
  folder: 'institute-images';

  @ApiProperty({
    description: 'Original filename (will be made unique)',
    example: 'logo.png',
  })
  @IsString()
  @IsNotEmpty()
  fileName: string;

  @ApiProperty({
    description: 'MIME type of the file',
    example: 'image/png',
  })
  @IsString()
  @IsNotEmpty()
  contentType: string;

  @ApiProperty({
    description: 'File size in bytes (max 5MB for images)',
    example: 2048576,
  })
  @IsNumber()
  fileSize: number;
}

class PublicVerifyUploadDto {
  @ApiProperty({
    description: 'Relative path to the uploaded file',
    example: 'institute-images/file-uuid.png',
  })
  @IsString()
  @IsNotEmpty()
  relativePath: string;
}

/**
 * 🌐 PUBLIC UPLOAD CONTROLLER
 * 
 * Publicly accessible file upload APIs for institute registration
 * 
 * SECURITY:
 * ✅ API Key authentication required
 * ✅ Rate limiting: 10 requests per minute
 * ✅ Limited to institute-images folder only
 * ✅ File size limits enforced (max 5MB)
 * ✅ File type validation
 * ✅ Comprehensive logging
 * ✅ IP tracking
 * 
 * WORKFLOW:
 * 1. Get signed URL → 2. Upload file → 3. Verify & publish → 4. Use URL in institute creation
 * 
 * @version 2.0.0
 */
@ApiTags('Public File Upload')
@ApiSecurity('api-key')
@Controller('public/upload')
@Public() // Bypass JWT requirement
@UseGuards(ApiKeyOrJwtGuard) // But require API key
@Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 requests per minute
export class PublicUploadController {
  private readonly logger = new Logger(PublicUploadController.name);

  constructor(
    private readonly cloudStorageService: CloudStorageService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * 🔗 Get Signed URL for Institute Images (Public API)
   */
  @Get('get-signed-url')
  @ApiOperation({
    summary: '🔗 Get signed URL for institute images (Public API with API Key)',
    description: `
      **PUBLIC ENDPOINT** - Requires API Key authentication
      
      Generates a short-lived signed URL (10 minutes) for uploading institute images.
      
      **🔐 Upload Flow:**
      1. Call this endpoint with file details
      2. Receive uploadUrl and relativePath
      3. Upload file to uploadUrl using PUT request with Content-Type header
      4. Call POST /public/upload/verify-and-publish with relativePath
      5. Use returned publicUrl in institute creation
      
      **Security:**
      - API key required
      - Limited to institute-images folder
      - Max file size: 5MB
      - Allowed types: jpg, png, webp, svg
      
      **Example:**
      GET /public/upload/get-signed-url?folder=institute-images&fileName=logo.png&contentType=image/png&fileSize=1024000
    `,
  })
  @ApiHeader({
    name: 'x-api-key',
    description: 'API Key for authentication',
    required: true,
  })
  @ApiQuery({
    name: 'folder',
    enum: ['institute-images'],
    description: 'Target folder (institute-images only)',
    example: 'institute-images',
  })
  @ApiQuery({
    name: 'fileName',
    type: String,
    description: 'Original filename (will be made unique)',
    example: 'logo.png',
  })
  @ApiQuery({
    name: 'contentType',
    type: String,
    description: 'MIME type (image/jpeg, image/png, image/webp, image/svg+xml)',
    example: 'image/png',
  })
  @ApiQuery({
    name: 'fileSize',
    type: Number,
    description: 'File size in bytes (max 5MB = 5242880 bytes)',
    example: 2048576,
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '✅ Signed URL generated successfully',
    schema: {
      example: {
        success: true,
        message: 'Signed URL generated successfully',
        uploadUrl: 'https://storage.googleapis.com/...',
        publicUrl: 'https://storage.googleapis.com/...',
        relativePath: 'institute-images/logo-uuid.png',
        expiresAt: '2026-01-18T10:10:00.000Z',
        requestId: 'UPLOAD-A1B2C3D4',
        instructions: {
          step1: 'Upload file using: PUT https://storage.googleapis.com/...',
          step2: 'Add header: Content-Type: image/png',
          step3: 'Call POST /public/upload/verify-and-publish',
          step4: 'Use publicUrl in institute creation',
        },
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: '❌ Invalid parameters or file too large',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: '❌ Missing or invalid API key',
  })
  async getSignedUrl(
    @Query('folder') folder: string,
    @Query('fileName') fileName: string,
    @Query('contentType') contentType: string,
    @Query('fileSize') fileSize: string,
    @Headers('x-api-key') apiKey: string,
    @Ip() ipAddress: string,
  ) {
    const requestId = `UPLOAD-${uuidv4().substring(0, 8).toUpperCase()}`;

    try {
      // 📝 LOG: Request received
      this.logger.log(
        `[${requestId}] 🔗 Public signed URL request - ` +
        `Folder: ${folder}, File: ${fileName}, Type: ${contentType}, ` +
        `Size: ${fileSize}, IP: ${ipAddress}`,
      );

      // Validate required parameters
      if (!folder || !fileName || !contentType || !fileSize) {
        this.logger.warn(
          `[${requestId}] ⚠️ Missing required parameters`,
        );
        throw new BadRequestException(
          'Missing required parameters: folder, fileName, contentType, fileSize',
        );
      }

      // Validate folder (only institute-images allowed for public API)
      if (folder !== 'institute-images') {
        this.logger.warn(
          `[${requestId}] ⚠️ Invalid folder: ${folder}`,
        );
        throw new BadRequestException(
          'Only institute-images folder is allowed for public upload',
        );
      }

      // Validate file size (max 5MB)
      const fileSizeNum = parseInt(fileSize, 10);
      const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
      if (fileSizeNum > MAX_FILE_SIZE) {
        this.logger.warn(
          `[${requestId}] ⚠️ File too large: ${fileSizeNum} bytes (max ${MAX_FILE_SIZE})`,
        );
        throw new BadRequestException(
          `File size exceeds maximum allowed size of ${MAX_FILE_SIZE / 1024 / 1024}MB`,
        );
      }

      // Validate content type
      const allowedTypes = [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/webp',
        'image/svg+xml',
      ];
      if (!allowedTypes.includes(contentType)) {
        this.logger.warn(
          `[${requestId}] ⚠️ Invalid content type: ${contentType}`,
        );
        throw new BadRequestException(
          `Invalid content type. Allowed: ${allowedTypes.join(', ')}`,
        );
      }

      // Validate file extension
      this.validateFileExtension(fileName);

      // Generate signed URL (10 minutes expiry)
      const expiresIn = 600; // 10 minutes
      const result = await this.cloudStorageService.generateSignedUploadUrl(
        folder,
        fileName,
        contentType,
        expiresIn,
      );

      const publicUrl = this.cloudStorageService.getPublicUrl(
        result.relativePath,
      );
      const uploadMethod = result.uploadUrl.includes('X-Goog-Signature')
        ? 'PUT'
        : 'POST';

      // ✅ Success logging
      this.logger.log(
        `[${requestId}] ✅ Signed URL generated - ` +
        `Path: ${result.relativePath}, Expires: ${result.expiresAt}`,
      );

      return {
        success: true,
        message: 'Signed URL generated successfully (10 min expiry)',
        uploadUrl: result.uploadUrl,
        publicUrl: publicUrl,
        relativePath: result.relativePath,
        expiresAt: result.expiresAt,
        requestId,
        ...(result.fields && { fields: result.fields }),
        instructions: {
          step1: `Upload file using: ${uploadMethod} ${result.uploadUrl}`,
          step2:
            uploadMethod === 'POST'
              ? 'Submit multipart/form-data with file field + provided fields'
              : `Add header: Content-Type: ${contentType}`,
          step3: `Call POST /public/upload/verify-and-publish with relativePath: ${result.relativePath}`,
          step4: `Use publicUrl in institute creation: ${publicUrl}`,
          important: 'File will be PRIVATE until you call /verify-and-publish',
        },
      };
    } catch (error) {
      // ❌ Error logging
      this.logger.error(
        `[${requestId}] ❌ Signed URL generation failed - ` +
        `Error: ${error.message}, Folder: ${folder}, File: ${fileName}, IP: ${ipAddress}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * 📤 POST version of get-signed-url
   */
  @Post('generate-signed-url')
  @ApiOperation({
    summary: '🔗 Generate signed URL (POST method)',
    description: `
      Same as GET /public/upload/get-signed-url but using POST method.
      Useful for requests with complex parameters or when GET is not preferred.
    `,
  })
  @ApiHeader({
    name: 'x-api-key',
    description: 'API Key for authentication',
    required: true,
  })
  @ApiBody({ type: PublicGenerateUploadUrlDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '✅ Signed URL generated successfully',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: '❌ Invalid input',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: '❌ Missing or invalid API key',
  })
  async generateSignedUrl(
    @Body() dto: PublicGenerateUploadUrlDto,
    @Headers('x-api-key') apiKey: string,
    @Ip() ipAddress: string,
  ) {
    // Reuse the GET endpoint logic
    return this.getSignedUrl(
      dto.folder,
      dto.fileName,
      dto.contentType,
      dto.fileSize.toString(),
      apiKey,
      ipAddress,
    );
  }

  /**
   * ✅ Verify and Publish Uploaded File (Public API)
   */
  @Post('verify-and-publish')
  @ApiOperation({
    summary: '✅ Verify and make file public (Public API with API Key)',
    description: `
      **PUBLIC ENDPOINT** - Requires API Key authentication
      
      Verifies that a file was uploaded successfully and makes it publicly accessible.
      
      **When to call:**
      After successfully uploading a file to the signed URL from step 1.
      
      **What it does:**
      1. Checks if file exists in storage
      2. Makes file publicly readable
      3. Returns permanent public URL
      
      **Security:**
      - API key required
      - Only verifies institute-images files
      - Prevents verification of other folders
      
      **Example:**
      POST /public/upload/verify-and-publish
      Body: { "relativePath": "institute-images/logo-uuid.png" }
    `,
  })
  @ApiHeader({
    name: 'x-api-key',
    description: 'API Key for authentication',
    required: true,
  })
  @ApiBody({
    type: PublicVerifyUploadDto,
    examples: {
      logo: {
        value: {
          relativePath: 'institute-images/logo-a1b2c3d4.png',
        },
      },
      banner: {
        value: {
          relativePath: 'institute-images/banner-e5f6g7h8.jpg',
        },
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '✅ File verified and made public',
    schema: {
      example: {
        success: true,
        message: 'File verified and made public successfully',
        publicUrl:
          'https://storage.googleapis.com/suraksha-lms/institute-images/logo-uuid.png',
        relativePath: 'institute-images/logo-uuid.png',
        requestId: 'VERIFY-A1B2C3D4',
        instructions: {
          nextStep: 'Use publicUrl in institute creation API',
          note: 'This URL is now publicly accessible with no expiration',
        },
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: '❌ File not found or invalid path',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: '❌ Missing or invalid API key',
  })
  async verifyAndPublish(
    @Body() dto: PublicVerifyUploadDto,
    @Headers('x-api-key') apiKey: string,
    @Ip() ipAddress: string,
  ) {
    const requestId = `VERIFY-${uuidv4().substring(0, 8).toUpperCase()}`;

    try {
      // 📝 LOG: Request received
      this.logger.log(
        `[${requestId}] 📤 Public verify request - ` +
        `Path: ${dto.relativePath}, IP: ${ipAddress}`,
      );

      // Validate relative path format
      if (!dto.relativePath || !dto.relativePath.includes('/')) {
        this.logger.warn(
          `[${requestId}] ⚠️ Invalid relativePath format: ${dto.relativePath}`,
        );
        throw new BadRequestException(
          'Invalid relativePath format. Expected: folder/filename.ext',
        );
      }

      // Validate folder (only institute-images allowed)
      const folder = dto.relativePath.split('/')[0];
      if (folder !== 'institute-images') {
        this.logger.warn(
          `[${requestId}] ⚠️ Invalid folder in path: ${folder}`,
        );
        throw new BadRequestException(
          'Only institute-images folder is allowed for public verification',
        );
      }

      // Verify file exists and make it public
      this.logger.log(
        `[${requestId}] 🔍 Verifying file: ${dto.relativePath}`,
      );

      const publicUrl = await this.cloudStorageService.verifyAndMakePublic(
        dto.relativePath,
      );

      // ✅ Success logging
      this.logger.log(
        `[${requestId}] ✅ File verified and published - ` +
        `URL: ${publicUrl}`,
      );

      return {
        success: true,
        message: 'File verified and made public successfully',
        publicUrl,
        relativePath: dto.relativePath,
        requestId,
        instructions: {
          nextStep: 'Use publicUrl in institute creation API',
          note: 'This URL is now publicly accessible with no expiration',
        },
      };
    } catch (error) {
      // ❌ Error logging
      this.logger.error(
        `[${requestId}] ❌ Verification failed - ` +
        `Error: ${error.message}, Path: ${dto.relativePath}, IP: ${ipAddress}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * 🔒 Validate file extension
   */
  private validateFileExtension(fileName: string): void {
    const normalizedFileName = fileName.toLowerCase();
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.svg'];

    const hasValidExtension = allowedExtensions.some((ext) =>
      normalizedFileName.endsWith(ext),
    );

    if (!hasValidExtension) {
      throw new BadRequestException(
        `Invalid file extension. Allowed: ${allowedExtensions.join(', ')}`,
      );
    }

    // Reject double extensions
    const lastDotIndex = normalizedFileName.lastIndexOf('.');
    const secondLastDotIndex = normalizedFileName.lastIndexOf(
      '.',
      lastDotIndex - 1,
    );

    if (secondLastDotIndex !== -1) {
      throw new BadRequestException(
        'Invalid filename: Double extensions not allowed (security risk)',
      );
    }
  }
}
