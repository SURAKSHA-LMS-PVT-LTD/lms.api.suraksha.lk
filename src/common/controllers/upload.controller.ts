import { Controller, Post, Delete, Get, Query, Body, UseGuards, HttpStatus, BadRequestException, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiBody, ApiQuery, ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsNumber, IsEnum } from 'class-validator';
import { CloudStorageService } from '../services/cloud-storage.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ApiKeyOrJwtGuard } from '../../auth/guards/api-key-or-jwt.guard';
import { Public } from '../decorators/public.decorator';
import { ConfigService } from '@nestjs/config';

class GenerateUploadUrlDto {
  @ApiProperty()
  @IsEnum(['profile-images', 'student-images', 'institute-images', 'institute-user-images', 'subject-images', 'homework-files', 'correction-files', 'institute-payment-receipts', 'subject-payment-receipts', 'enrollment-payment-receipts', 'class-payment-receipts', 'id-documents', 'bookhire-vehicle-images', 'bookhire-owner-images', 'service-payment-receipts', 'structured-lecture-covers', 'structured-lecture-documents', 'lecture-thumbnails', 'institute-branding'])
  folder: 'profile-images' | 'student-images' | 'institute-images' | 'institute-user-images' | 'subject-images' | 'homework-files' | 'correction-files' | 'institute-payment-receipts' | 'subject-payment-receipts' | 'enrollment-payment-receipts' | 'class-payment-receipts' | 'id-documents' | 'bookhire-vehicle-images' | 'bookhire-owner-images' | 'service-payment-receipts' | 'structured-lecture-covers' | 'structured-lecture-documents' | 'lecture-thumbnails' | 'institute-branding';
  
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  fileName: string;
  
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  contentType: string;
  
  @ApiProperty()
  @IsNumber()
  fileSize: number; // File size in bytes - REQUIRED for validation
  // NOTE: expiresIn is FIXED at 600 seconds (10 minutes) for security - not user-configurable
}

class VerifyUploadDto {
  @ApiProperty({
    description: 'Relative path to the uploaded file',
    example: 'institute-images/file-uuid.png'
  })
  @IsString()
  @IsNotEmpty()
  relativePath: string;
}

@ApiTags('File Upload')
@Controller('upload')
@ApiBearerAuth()
export class UploadController {
  private readonly logger = new Logger(UploadController.name);

  /** Folders an authenticated caller may upload into and publish. Single source of truth. */
  private static readonly PUBLISHABLE_FOLDERS = new Set<string>([
    'profile-images', 'student-images', 'institute-images', 'institute-user-images',
    'subject-images', 'homework-files', 'correction-files', 'institute-payment-receipts',
    'subject-payment-receipts', 'enrollment-payment-receipts', 'class-payment-receipts',
    'id-documents', 'bookhire-vehicle-images', 'bookhire-owner-images',
    'service-payment-receipts', 'structured-lecture-covers', 'structured-lecture-documents',
    'lecture-thumbnails', 'institute-branding',
  ]);

  constructor(
    private readonly cloudStorageService: CloudStorageService,
    private readonly configService: ConfigService
  ) {}

  @Get('get-signed-url')
  @ApiOperation({
    summary: '🔗 Get signed URL (GET method for easy integration)',
    description: `
      Simple GET endpoint to generate signed upload URLs using query parameters.
      Perfect for frontend integration, mobile apps, and quick testing.
      
      **🔐 Upload Flow:**
      1. Call this endpoint with file details as query parameters
      2. Receive uploadUrl and publicUrl in response
      3. Upload file to uploadUrl using PUT request with Content-Type header
      4. Call /upload/verify-and-publish with relativePath to make file public
      5. Use returned publicUrl in your application
      
      **Example Request:**
      GET /upload/get-signed-url?folder=profile-images&fileName=avatar.jpg&contentType=image/jpeg&fileSize=2048576
    `
  })
  @ApiQuery({ 
    name: 'folder', 
    enum: ['profile-images', 'student-images', 'institute-images', 'institute-user-images', 'subject-images', 'homework-files', 'correction-files', 'institute-payment-receipts', 'subject-payment-receipts', 'enrollment-payment-receipts', 'id-documents', 'bookhire-vehicle-images', 'bookhire-owner-images', 'institute-branding'],
    description: 'Target folder for file upload',
    example: 'profile-images'
  })
  @ApiQuery({ 
    name: 'fileName', 
    type: String,
    description: 'Original filename (will be made unique)',
    example: 'user-avatar.jpg'
  })
  @ApiQuery({ 
    name: 'contentType', 
    type: String,
    description: 'MIME type of the file',
    example: 'image/jpeg'
  })
  @ApiQuery({ 
    name: 'fileSize', 
    type: Number,
    description: 'File size in bytes (required for validation)',
    example: 2048576
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Signed URL generated successfully (expires in 10 minutes)',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string' },
        uploadUrl: { 
          type: 'string',
          description: 'Use this URL for PUT upload',
          example: 'https://storage.googleapis.com/suraksha-lms/...'
        },
        publicUrl: {
          type: 'string',
          description: 'Public URL after verification',
          example: 'https://storage.googleapis.com/suraksha-lms/profile-images/avatar-uuid.jpg'
        },
        relativePath: {
          type: 'string',
          description: 'Send this to /verify-and-publish',
          example: 'profile-images/avatar-uuid.jpg'
        },
        expiresAt: {
          type: 'string',
          example: '2025-11-08T12:10:00.000Z'
        }
      }
    }
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid parameters or file size exceeds limit'
  })
  async getSignedUrl(
    @Query('folder') folder: string,
    @Query('fileName') fileName: string,
    @Query('contentType') contentType: string,
    @Query('fileSize') fileSize: string
  ) {
    // Validate required parameters
    if (!folder || !fileName || !contentType || !fileSize) {
      throw new BadRequestException('Missing required parameters: folder, fileName, contentType, fileSize');
    }

    const fileSizeNum = parseInt(fileSize, 10);
    if (isNaN(fileSizeNum)) {
      throw new BadRequestException('fileSize must be a valid number');
    }

    // SECURITY: Fixed expiry from environment - not user-configurable
    const FIXED_EXPIRY_SECONDS = this.configService.get<number>('UPLOAD_URL_EXPIRY_SECONDS', 600);

    const dto: GenerateUploadUrlDto = {
      folder: folder as any,
      fileName,
      contentType,
      fileSize: fileSizeNum
    };

    // Sanitize filename: replace inner dots (all but the last) with underscores so
    // benign names like "pngimg.com - tiktok_PNG7.png" don't trigger the double-extension check.
    const originalFileName = dto.fileName;
    const sanitizedFileName = (() => {
      const parts = originalFileName.split('.');
      if (parts.length <= 2) return originalFileName;
      const ext = parts.pop();
      const base = parts.join('_');
      return `${base}.${ext}`;
    })();

    // Validate folder type (shared allowlist — see PUBLISHABLE_FOLDERS)
    if (!UploadController.PUBLISHABLE_FOLDERS.has(folder)) {
      throw new BadRequestException(`Invalid folder. Must be one of: ${[...UploadController.PUBLISHABLE_FOLDERS].join(', ')}`);
    }

    // Use sanitized filename for validation and signed URL generation
    this.validateFileExtension(sanitizedFileName, folder);
    this.validateFileSize(fileSizeNum, folder);

    // Get max file size for this folder to enforce in signed URL
    const maxFileSize = this.getMaxFileSizeForFolder(folder);

    const result = await this.cloudStorageService.generateSignedUploadUrl(
      folder,
      sanitizedFileName,
      contentType,
      FIXED_EXPIRY_SECONDS,
      maxFileSize // 🔒 SECURITY: Enforce file size limit in GCS signature
    );

    // Construct public URL using provider-aware helper (handles GCS, S3, local correctly)
    const publicUrl = this.cloudStorageService.getFullUrl(result.relativePath);

    return {
      success: true,
      message: 'Signed URL generated successfully (10 min expiry)',
      uploadUrl: result.uploadUrl,
      publicUrl: publicUrl,
      relativePath: result.relativePath,
      expiresAt: result.expiresAt,
      instructions: {
        step1: `PUT ${result.uploadUrl}`,
        step2: `Add header: Content-Type: ${contentType}`,
        step3: `Call POST /upload/verify-and-publish with relativePath: ${result.relativePath}`,
        step4: `Use publicUrl in your application: ${publicUrl}`,
        important: 'File will be PRIVATE until you call /verify-and-publish'
      }
    };
  }

  @Public() // Bypass global JwtAuthGuard
  @UseGuards(ApiKeyOrJwtGuard) // Apply specific guard that accepts API key OR JWT
  @Get('profile-images/get-signed-url')
  @ApiOperation({
    summary: '🔗 Get signed URL for profile images (API Key or JWT)',
    description: `
      Dedicated endpoint for profile image uploads that accepts both API key and JWT authentication.
      This allows external systems to upload profile images using an API key.
      
      **🔐 Authentication:**
      - API Key: Bearer <YOUR_API_KEY>
      - JWT Token: Standard user authentication
      
      **🔐 Upload Flow:**
      1. Call this endpoint with file details as query parameters
      2. Receive uploadUrl and publicUrl in response
      3. Upload file to uploadUrl using PUT request with Content-Type header
      4. Call /upload/verify-and-publish with relativePath to make file public
      5. Use returned publicUrl in your application
      
      **Example Request:**
      GET /upload/profile-images/get-signed-url?fileName=avatar.jpg&contentType=image/jpeg&fileSize=2048576
      Authorization: Bearer <YOUR_API_KEY>
    `
  })
  @ApiQuery({ 
    name: 'fileName', 
    type: String,
    description: 'Original filename (will be made unique)',
    example: 'user-avatar.jpg'
  })
  @ApiQuery({ 
    name: 'contentType', 
    type: String,
    description: 'MIME type of the file',
    example: 'image/jpeg'
  })
  @ApiQuery({ 
    name: 'fileSize', 
    type: Number,
    description: 'File size in bytes (required for validation)',
    example: 2048576
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Signed URL generated successfully (expires in 10 minutes)',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string' },
        uploadUrl: { 
          type: 'string',
          description: 'Use this URL for PUT upload',
          example: 'https://storage.googleapis.com/suraksha-lms/profile-images/...'
        },
        publicUrl: {
          type: 'string',
          description: 'Public URL after verification',
          example: 'https://storage.googleapis.com/suraksha-lms/profile-images/avatar-uuid.jpg'
        },
        relativePath: {
          type: 'string',
          description: 'Send this to /verify-and-publish',
          example: 'profile-images/avatar-uuid.jpg'
        },
        expiresAt: {
          type: 'string',
          example: '2025-11-08T12:10:00.000Z'
        }
      }
    }
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid parameters or file size exceeds limit'
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Invalid or missing API key / JWT token'
  })
  async getProfileImageSignedUrl(
    @Query('fileName') fileName: string,
    @Query('contentType') contentType: string,
    @Query('fileSize') fileSize: string
  ) {
    // Validate required parameters
    if (!fileName || !contentType || !fileSize) {
      throw new BadRequestException('Missing required parameters: fileName, contentType, fileSize');
    }

    const fileSizeNum = parseInt(fileSize, 10);
    if (isNaN(fileSizeNum)) {
      throw new BadRequestException('fileSize must be a valid number');
    }

    // Fixed folder for profile images
    const folder = 'profile-images';

    // SECURITY: Fixed expiry from environment - not user-configurable
    const FIXED_EXPIRY_SECONDS = this.configService.get<number>('UPLOAD_URL_EXPIRY_SECONDS', 600);

    // Sanitize filename
    const sanitizedFileName = (() => {
      const parts = fileName.split('.');
      if (parts.length <= 2) return fileName;
      const ext = parts.pop();
      const base = parts.join('_');
      return `${base}.${ext}`;
    })();

    // Validate file extension and size for profile images
    this.validateFileExtension(sanitizedFileName, folder);
    this.validateFileSize(fileSizeNum, folder);

    // Get max file size for profile images
    const maxFileSize = this.getMaxFileSizeForFolder(folder);

    const result = await this.cloudStorageService.generateSignedUploadUrl(
      folder,
      sanitizedFileName,
      contentType,
      FIXED_EXPIRY_SECONDS,
      maxFileSize
    );

    // Construct public URL using provider-aware helper (handles GCS, S3, local correctly)
    const publicUrl = this.cloudStorageService.getFullUrl(result.relativePath);

    return {
      success: true,
      message: 'Profile image signed URL generated successfully (10 min expiry)',
      uploadUrl: result.uploadUrl,
      publicUrl: publicUrl,
      relativePath: result.relativePath,
      expiresAt: result.expiresAt,
      instructions: {
        step1: `PUT ${result.uploadUrl}`,
        step2: `Add header: Content-Type: ${contentType}`,
        step3: `Call POST /upload/verify-and-publish with relativePath: ${result.relativePath}`,
        step4: `Use publicUrl in your application: ${publicUrl}`,
        important: 'File will be PRIVATE until you call /verify-and-publish'
      }
    };
  }

  @Public()
  @UseGuards(ApiKeyOrJwtGuard)
  @Post('generate-signed-url')
  @ApiOperation({ 
    summary: 'Generate SHORT-LIVED private signed upload URL (10 min)',
    description: `
      Generates a SHORT-LIVED PRIVATE signed URL (10 minutes) for direct client uploads.
      
      **🔐 SECURE Upload Flow:**
      1. Call this endpoint to get a short-lived private upload URL (expires in 10 min)
      2. Upload the file directly to uploadUrl using PUT request
      3. Send relativePath back to backend for verification
      4. Backend verifies file exists and makes it public
      5. Backend returns long-term public URL
      
      **Supported Folders:**
      - profile-images: User profile pictures
      - student-images: Student photos
      - institute-images: Institute logos/images
      - institute-user-images: Institute-specific user images
      - subject-images: Subject thumbnails
      - homework-files: Homework submissions
      - correction-files: Teacher corrections
      - institute-payment-receipts: Institute-level payment receipts
      - subject-payment-receipts: Subject-level payment receipts
      - enrollment-payment-receipts: Enrollment fee payment receipts
      - id-documents: ID card images
      - bookhire-vehicle-images: Private transportation vehicle images
      - bookhire-owner-images: Private transportation owner profile images
    `
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['folder', 'fileName', 'contentType', 'fileSize'],
      properties: {
        folder: {
          type: 'string',
          enum: ['profile-images', 'student-images', 'institute-images', 'institute-user-images', 'subject-images', 'homework-files', 'correction-files', 'institute-payment-receipts', 'subject-payment-receipts', 'enrollment-payment-receipts', 'id-documents', 'bookhire-vehicle-images', 'bookhire-owner-images'],
          example: 'profile-images'
        },
        fileName: {
          type: 'string',
          example: 'user-profile.jpg',
          description: 'Original filename - will be made unique automatically'
        },
        contentType: {
          type: 'string',
          example: 'image/jpeg',
          description: 'MIME type of the file'
        },
        fileSize: {
          type: 'number',
          example: 2048576,
          description: 'File size in bytes (REQUIRED for server-side validation)'
        },
        expiresIn: {
          type: 'number',
          example: 600,
          description: 'URL expiration time in seconds (default: 600 = 10 minutes)'
        }
      }
    }
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Signed upload URL generated successfully with file size protection',
    schema: {
      type: 'object',
      properties: {
        success: {
          type: 'boolean',
          example: true
        },
        message: {
          type: 'string',
          example: 'SHORT-LIVED private upload URL generated (expires in 10 minutes)'
        },
        data: {
          type: 'object',
          properties: {
            uploadUrl: {
              type: 'string',
              example: 'https://storage.googleapis.com/...',
              description: 'Use this URL to upload the file (PUT request)'
            },
            relativePath: {
              type: 'string',
              example: 'profile-images/user-profile-uuid.jpg',
              description: 'Relative path for database storage - send this to /upload/verify-and-publish'
            },
            expiresAt: {
              type: 'string',
              format: 'date-time',
              example: '2025-11-08T12:00:00.000Z',
              description: 'When the upload URL expires'
            },
            maxFileSize: {
              type: 'number',
              example: 5242880,
              description: 'Maximum file size in bytes enforced by signed URL'
            },
            contentType: {
              type: 'string',
              example: 'image/jpeg',
              description: 'Content type that must be used in upload'
            }
          }
        },
        instructions: {
          type: 'object',
          properties: {
            uploadMethod: {
              type: 'string',
              example: 'PUT'
            },
            headers: {
              type: 'object',
              properties: {
                'Content-Type': {
                  type: 'string',
                  example: 'image/jpeg',
                  description: 'REQUIRED: Must match the contentType from request'
                },
                'x-goog-content-length-range': {
                  type: 'string',
                  example: '0,5242880',
                  description: 'REQUIRED: File size range enforced by GCS (0 to maxFileSize bytes)'
                }
              },
              description: 'REQUIRED headers that MUST be included in PUT request'
            },
            maxFileSize: {
              type: 'number',
              example: 5242880,
              description: 'Maximum allowed file size in bytes'
            }
          }
        }
      }
    }
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid request parameters'
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Unauthorized - JWT token required'
  })
  async generateSignedUploadUrl(@Body() dto: GenerateUploadUrlDto) {
    const { folder } = dto;
    // preserve original for audit if needed
    const originalFileName = dto.fileName;
    const sanitizedFileName = (() => {
      const parts = (dto.fileName || '').split('.');
      if (parts.length <= 2) return dto.fileName;
      const ext = parts.pop();
      const base = parts.join('_');
      return `${base}.${ext}`;
    })();
    const contentType = dto.contentType;
    const fileSize = dto.fileSize;

    // SECURITY: Fixed expiry from environment - not user-configurable
    const FIXED_EXPIRY_SECONDS = this.configService.get<number>('UPLOAD_URL_EXPIRY_SECONDS', 600);

    // ✅ SECURITY: Validate sanitized file extension - only allow proper extensions
    this.validateFileExtension(sanitizedFileName, folder);

    // ✅ SECURITY: Validate file size based on folder type and environment config
    this.validateFileSize(fileSize, folder);

    // Get max file size for this folder to enforce in signed URL
    const maxFileSize = this.getMaxFileSizeForFolder(folder);

    const result = await this.cloudStorageService.generateSignedUploadUrl(
      folder,
      sanitizedFileName,
      contentType,
      FIXED_EXPIRY_SECONDS,
      maxFileSize // 🔒 SECURITY: Enforce file size limit in GCS signature
    );

    // ✅ Build required headers for upload including file size protection
    const uploadHeaders: any = {
      'Content-Type': contentType
    };
    
    // ✅ Add content-length-range header if max file size is enforced
    if (maxFileSize) {
      uploadHeaders['x-goog-content-length-range'] = `0,${maxFileSize}`;
    }

    return {
      success: true,
      message: 'SHORT-LIVED private upload URL generated (expires in 10 minutes)',
      data: result,
      instructions: {
        step1: 'Upload file to uploadUrl using PUT request',
        step2: 'Send relativePath to /upload/verify-and-publish endpoint',
        step3: 'Backend verifies and returns long-term public URL',
        uploadMethod: 'PUT',
        uploadUrl: result.uploadUrl,
        headers: uploadHeaders, // ✅ Include Content-Type and x-goog-content-length-range
        maxFileSize: maxFileSize, // ✅ Frontend can use this value for validation
        expiresIn: '10 minutes',
        important: 'File will be PRIVATE until verified by backend. MUST include all headers in PUT request.'
      }
    };
  }

  @Post('verify-and-publish')
  @ApiOperation({
    summary: '✅ Verify upload and make file public (long-term)',
    description: `
      **CRITICAL STEP:** Verifies uploaded file and makes it publicly accessible.
      
      Call this after uploading via signed URL. This endpoint will:
      1. Verify the file exists in cloud storage
      2. Make the file publicly accessible (remove private restriction)
      3. Return a long-term public URL
      
      **Why this step is required:**
      - Upload URL is short-lived (10 min) and private
      - File needs backend verification before being made public
      - Prevents unauthorized or incomplete uploads
      - Only verified files get long-term public access
    `
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['relativePath'],
      properties: {
        relativePath: {
          type: 'string',
          example: 'profile-images/user-profile-uuid.jpg',
          description: 'Relative path returned from /upload/generate-signed-url'
        }
      }
    }
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'File verified and made public successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'File verified and made public successfully' },
        publicUrl: { 
          type: 'string', 
          example: 'https://storage.googleapis.com/suraksha-lms/profile-images/user-profile-uuid.jpg',
          description: 'Long-term public URL - use this in your database/APIs'
        },
        relativePath: {
          type: 'string',
          example: 'profile-images/user-profile-uuid.jpg'
        }
      }
    }
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'File not found - upload may have failed or expired'
  })
  async verifyAndPublish(@Body() dto: VerifyUploadDto) {
    try {
      this.logger.log(`Verify and publish request for: ${dto.relativePath}`);

      // M4: validate path shape + restrict to known upload folders. Previously ANY
      // relativePath could be made public; now only the recognised folders are allowed,
      // and traversal / absolute paths are rejected.
      const rp = (dto.relativePath || '').trim();
      if (!rp || rp.includes('..') || rp.includes('\0') || rp.startsWith('/') || !/^[^/]+\/.+/.test(rp)) {
        throw new BadRequestException('Invalid relativePath format. Expected: folder/filename.ext');
      }
      const folder = rp.split('/')[0];
      if (!UploadController.PUBLISHABLE_FOLDERS.has(folder)) {
        this.logger.warn(`verifyAndPublish blocked — folder not allowed: ${folder}`);
        throw new BadRequestException(`Folder '${folder}' is not allowed for publishing`);
      }

      // Verify file exists and make it public
      const publicUrl = await this.cloudStorageService.verifyAndMakePublic(dto.relativePath);

      this.logger.log(`Successfully verified and published: ${dto.relativePath}`);

      return {
        success: true,
        message: 'File verified and made public successfully',
        publicUrl,
        relativePath: dto.relativePath,
        instructions: {
          nextStep: 'Use publicUrl in your API calls (user creation, profile update, etc.)',
          note: 'This URL is now publicly accessible and has no expiration'
        }
      };
    } catch (error) {
      this.logger.error(`Error in verifyAndPublish for ${dto.relativePath}: ${error.message}`);
      throw error;
    }
  }

  /**
   * 🔒 SECURITY: Validate file extension
   * Only allow proper file extensions, reject double extensions like .mysql.jpg
   */
  private validateFileExtension(fileName: string, folder: string): void {
    const normalizedFileName = fileName.toLowerCase();
    
    // Define allowed extensions per folder
    const allowedExtensions: Record<string, string[]> = {
      'profile-images': ['.jpg', '.jpeg', '.png', '.webp'],
      'student-images': ['.jpg', '.jpeg', '.png', '.webp'],
      'institute-images': ['.jpg', '.jpeg', '.png', '.webp', '.svg'],
      'institute-user-images': ['.jpg', '.jpeg', '.png', '.webp'],
      'subject-images': ['.jpg', '.jpeg', '.png', '.webp'],
      'homework-files': ['.pdf', '.jpg', '.jpeg', '.png', '.doc', '.docx'],
      'correction-files': ['.pdf', '.jpg', '.jpeg', '.png'],
      'institute-payment-receipts': ['.jpg', '.jpeg', '.png', '.pdf'],
      'subject-payment-receipts': ['.jpg', '.jpeg', '.png', '.pdf'],
      'enrollment-payment-receipts': ['.jpg', '.jpeg', '.png', '.pdf'],
      'id-documents': ['.jpg', '.jpeg', '.png', '.pdf'],
      'bookhire-vehicle-images': ['.jpg', '.jpeg', '.png', '.webp'],
      'bookhire-owner-images': ['.jpg', '.jpeg', '.png', '.webp'],
      'lecture-thumbnails': ['.jpg', '.jpeg', '.png', '.webp', '.gif'],
      'institute-branding': ['.jpg', '.jpeg', '.png', '.webp', '.svg', '.gif'],
    };

    const allowed = allowedExtensions[folder] || ['.jpg', '.jpeg', '.png', '.pdf'];
    
    // Check if filename ends with any allowed extension
    const hasValidExtension = allowed.some(ext => normalizedFileName.endsWith(ext));
    
    if (!hasValidExtension) {
      throw new BadRequestException(
        `Invalid file extension. Allowed extensions for ${folder}: ${allowed.join(', ')}`
      );
    }

    // 🚨 CRITICAL SECURITY: Reject ALL double extensions
    // Only allow single extensions - prevents malicious file uploads
    // Examples blocked: file.pdf.jpg, image.png.exe, doc.docx.pdf
    const lastDotIndex = normalizedFileName.lastIndexOf('.');
    const secondLastDotIndex = normalizedFileName.lastIndexOf('.', lastDotIndex - 1);
    
    if (secondLastDotIndex !== -1) {
      // Multiple dots detected - reject any double extension
      throw new BadRequestException(
        `Double file extensions are not allowed. Please use a single extension (e.g., .jpg, .png, .pdf)`
      );
    }
  }

  /**
   * 🔒 SECURITY: Validate file size based on folder type
   * Reads max file size from environment variables
   */
  private validateFileSize(fileSize: number, folder: string): void {
    // Get max file sizes from environment variables (in MB), with defaults
    // S3 uploads: 5MB max for all user uploads, 10MB for system admin (advertisements)
    const maxSizes: Record<string, number> = {
      'profile-images': this.configService.get<number>('MAX_PROFILE_IMAGE_SIZE_MB', 5) * 1024 * 1024,
      'student-images': this.configService.get<number>('MAX_STUDENT_IMAGE_SIZE_MB', 5) * 1024 * 1024,
      'institute-images': this.configService.get<number>('MAX_INSTITUTE_IMAGE_SIZE_MB', 5) * 1024 * 1024,
      'institute-user-images': this.configService.get<number>('MAX_INSTITUTE_USER_IMAGE_SIZE_MB', 5) * 1024 * 1024,
      'subject-images': this.configService.get<number>('MAX_SUBJECT_IMAGE_SIZE_MB', 5) * 1024 * 1024,
      'homework-files': this.configService.get<number>('MAX_HOMEWORK_FILE_SIZE_MB', 5) * 1024 * 1024,
      'correction-files': this.configService.get<number>('MAX_CORRECTION_FILE_SIZE_MB', 5) * 1024 * 1024,
      'institute-payment-receipts': this.configService.get<number>('MAX_PAYMENT_RECEIPT_SIZE_MB', 5) * 1024 * 1024,
      'subject-payment-receipts': this.configService.get<number>('MAX_PAYMENT_RECEIPT_SIZE_MB', 5) * 1024 * 1024,
      'enrollment-payment-receipts': this.configService.get<number>('MAX_PAYMENT_RECEIPT_SIZE_MB', 5) * 1024 * 1024,
      'id-documents': this.configService.get<number>('MAX_ID_DOCUMENT_SIZE_MB', 5) * 1024 * 1024,
      'bookhire-vehicle-images': this.configService.get<number>('MAX_BOOKHIRE_VEHICLE_IMAGE_SIZE_MB', 5) * 1024 * 1024,
      'bookhire-owner-images': this.configService.get<number>('MAX_BOOKHIRE_OWNER_IMAGE_SIZE_MB', 5) * 1024 * 1024,
      'lecture-thumbnails': this.configService.get<number>('MAX_LECTURE_THUMBNAIL_SIZE_MB', 5) * 1024 * 1024,
      'institute-branding': this.configService.get<number>('MAX_INSTITUTE_BRANDING_SIZE_MB', 5) * 1024 * 1024,
    };

    const maxSize = maxSizes[folder] || (5 * 1024 * 1024); // Default 5MB
    
    if (fileSize > maxSize) {
      const maxSizeMB = (maxSize / 1024 / 1024).toFixed(2);
      const currentSizeMB = (fileSize / 1024 / 1024).toFixed(2);
      
      throw new BadRequestException(
        `File size too large. Maximum allowed size for ${folder}: ${maxSizeMB} MB. Your file: ${currentSizeMB} MB`
      );
    }

    // Also check absolute maximum to prevent abuse (default 100MB)
    const absoluteMax = this.configService.get<number>('MAX_FILE_SIZE_MB', 100) * 1024 * 1024;
    if (fileSize > absoluteMax) {
      const absoluteMaxMB = (absoluteMax / 1024 / 1024).toFixed(2);
      const currentSizeMB = (fileSize / 1024 / 1024).toFixed(2);
      
      throw new BadRequestException(
        `File size exceeds absolute maximum limit of ${absoluteMaxMB} MB. Your file: ${currentSizeMB} MB`
      );
    }
  }

  @Delete('file')
  @ApiOperation({
    summary: '🗑️ Delete an uploaded file from storage',
    description: 'Deletes a previously uploaded file by its relative path. Only allows deletion of files in known managed folders.'
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['relativePath'],
      properties: {
        relativePath: {
          type: 'string',
          example: 'profile-images/avatar-uuid.jpg',
          description: 'Relative storage path returned from signed URL upload flow'
        }
      }
    }
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'File deleted successfully' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid or disallowed path' })
  async deleteUploadedFile(@Body('relativePath') relativePath: string) {
    if (!relativePath || typeof relativePath !== 'string') {
      throw new BadRequestException('relativePath is required');
    }

    // Reject full URLs or absolute paths — only allow relative storage paths
    if (relativePath.startsWith('http://') || relativePath.startsWith('https://') || relativePath.startsWith('/')) {
      throw new BadRequestException('Only relative storage paths can be deleted');
    }

    // Reject path traversal
    if (relativePath.includes('..') || relativePath.includes('\0')) {
      throw new BadRequestException('Invalid path');
    }

    // Only allow deletion within known managed folders
    const allowedFolders = [
      'profile-images', 'student-images', 'institute-images', 'institute-user-images',
      'subject-images', 'homework-files', 'correction-files', 'institute-payment-receipts',
      'subject-payment-receipts', 'enrollment-payment-receipts', 'class-payment-receipts',
      'id-documents', 'bookhire-vehicle-images', 'bookhire-owner-images',
      'service-payment-receipts', 'structured-lecture-covers', 'structured-lecture-documents',
      'lecture-thumbnails', 'institute-branding', 'sms-payment-receipts',
      'advertisement-images', 'lecture-covers',
    ];

    const folder = relativePath.split('/')[0];
    if (!allowedFolders.includes(folder)) {
      throw new BadRequestException(`Deletion not allowed for folder: ${folder}`);
    }

    const deleted = await this.cloudStorageService.deleteFile(relativePath);
    return { success: deleted, relativePath };
  }

  /**
   * 🔒 SECURITY: Get maximum file size for folder
   * Returns the maximum allowed file size in bytes for a given folder
   * This is used to enforce Content-Length restrictions in signed URLs
   */
  private getMaxFileSizeForFolder(folder: string): number {
    // S3 uploads: 5MB max for all user uploads, 10MB for system admin (advertisements)
    const maxSizes: Record<string, number> = {
      'profile-images': this.configService.get<number>('MAX_PROFILE_IMAGE_SIZE_MB', 5) * 1024 * 1024,
      'student-images': this.configService.get<number>('MAX_STUDENT_IMAGE_SIZE_MB', 5) * 1024 * 1024,
      'institute-images': this.configService.get<number>('MAX_INSTITUTE_IMAGE_SIZE_MB', 5) * 1024 * 1024,
      'institute-user-images': this.configService.get<number>('MAX_INSTITUTE_USER_IMAGE_SIZE_MB', 5) * 1024 * 1024,
      'subject-images': this.configService.get<number>('MAX_SUBJECT_IMAGE_SIZE_MB', 5) * 1024 * 1024,
      'homework-files': this.configService.get<number>('MAX_HOMEWORK_FILE_SIZE_MB', 5) * 1024 * 1024,
      'correction-files': this.configService.get<number>('MAX_CORRECTION_FILE_SIZE_MB', 5) * 1024 * 1024,
      'institute-payment-receipts': this.configService.get<number>('MAX_PAYMENT_RECEIPT_SIZE_MB', 5) * 1024 * 1024,
      'subject-payment-receipts': this.configService.get<number>('MAX_PAYMENT_RECEIPT_SIZE_MB', 5) * 1024 * 1024,
      'enrollment-payment-receipts': this.configService.get<number>('MAX_PAYMENT_RECEIPT_SIZE_MB', 5) * 1024 * 1024,
      'id-documents': this.configService.get<number>('MAX_ID_DOCUMENT_SIZE_MB', 5) * 1024 * 1024,
      'bookhire-vehicle-images': this.configService.get<number>('MAX_BOOKHIRE_VEHICLE_IMAGE_SIZE_MB', 5) * 1024 * 1024,
      'bookhire-owner-images': this.configService.get<number>('MAX_BOOKHIRE_OWNER_IMAGE_SIZE_MB', 5) * 1024 * 1024,
      'lecture-thumbnails': this.configService.get<number>('MAX_LECTURE_THUMBNAIL_SIZE_MB', 5) * 1024 * 1024,
      'institute-branding': this.configService.get<number>('MAX_INSTITUTE_BRANDING_SIZE_MB', 5) * 1024 * 1024,
    };

    return maxSizes[folder] || (5 * 1024 * 1024); // Default 5MB
  }
}
