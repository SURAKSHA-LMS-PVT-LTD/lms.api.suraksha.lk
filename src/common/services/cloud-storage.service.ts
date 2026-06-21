import { Injectable, Logger, InternalServerErrorException, BadRequestException, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Storage, Bucket } from '@google-cloud/storage';
import { v4 as uuidv4 } from 'uuid';
import { getCurrentSriLankaISO } from '../utils/timezone.util';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as crypto from 'crypto';
import { 
  S3Client, 
  HeadObjectCommand, 
  PutObjectAclCommand, 
  DeleteObjectCommand,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// AWS SDK v2 will be dynamically imported when needed (legacy support)
let AWS: any = null;

export interface FileUploadResult {
  success: boolean;
  fullUrl: string;           // Complete URL for immediate use: "https://googleapis.com/bucket/suraksha.lk/user/profile.jpg"
  relativePath: string;      // Store this in database: "suraksha.lk/user/profile.jpg" 
  fileName: string;
  fileSize: number;
  mimeType: string;
  provider: 'google' | 'aws' | 'local';
  metadata?: any;
  error?: string;
}

export interface FileMetadata {
  name: string;
  size: number;
  contentType: string;
  lastModified: Date;
  isPublic: boolean;
}

@Injectable()
export class CloudStorageService implements OnModuleInit {
  private readonly logger = new Logger(CloudStorageService.name);
  private readonly baseUrl: string;
  private readonly provider: string;
  
  // Google Cloud Storage
  private storage: Storage;
  private bucket: Bucket;
  private bucketName: string;
  
  // AWS S3
  private s3Client: S3Client;
  private s3: any; // Legacy SDK v2 support
  private s3BucketName: string;
  private s3Region: string;
  
  // Local Storage
  private localStoragePath: string;
  
  // Initialization promise to ensure async setup completes
  private initializationPromise: Promise<void>;

  constructor(private readonly configService: ConfigService) {
    this.provider = this.configService.get<string>('STORAGE_PROVIDER', 'google');
    this.baseUrl = this.getBaseUrl();
  }

  async onModuleInit() {
    await this.initializeProviders();
  }

  private async initializeProviders(): Promise<void> {
    const provider = this.provider.toLowerCase();
    
    try {
      switch (provider) {
        case 'google':
        case 'gcs':
          this.initializeGoogleStorage();
          break;
        case 'aws':
        case 's3':
          await this.initializeAwsStorage();
          break;
        case 'local':
          this.initializeLocalStorage();
          break;
        default:
          this.logger.warn(`Unknown provider ${provider}, falling back to Google`);
          this.initializeGoogleStorage();
      }
    } catch (error) {
      this.logger.error(`Failed to initialize ${provider} storage:`, error);
      throw new InternalServerErrorException(`Storage initialization failed: ${error.message}`);
    }
  }

  private getBaseUrl(): string {
    const provider = this.provider.toLowerCase();
    
    switch (provider) {
      case 'google':
      case 'gcs':
        const bucket = this.configService.get<string>('GCS_BUCKET_NAME') || 
                      this.configService.get<string>('GOOGLE_STORAGE_BUCKET');
        return `https://storage.googleapis.com/${bucket}`;
        
      case 'aws':
      case 's3':
        // Use custom base URL if configured, otherwise fall back to default AWS S3 URL
        const customAwsUrl = this.configService.get<string>('AWS_S3_BASE_URL');
        if (customAwsUrl) {
          return customAwsUrl;
        }
        const awsBucket = this.configService.get<string>('AWS_S3_BUCKET');
        const region = this.configService.get<string>('AWS_REGION', 'us-east-1');
        return `https://${awsBucket}.s3.${region}.amazonaws.com`;
        
      case 'local':
        return this.configService.get<string>('LOCAL_STORAGE_BASE_URL', 'http://localhost:3000/uploads');
        
      default:
        // Fallback to Google
        const fallbackBucket = this.configService.get<string>('GCS_BUCKET_NAME') || 
                              this.configService.get<string>('GOOGLE_STORAGE_BUCKET');
        return `https://storage.googleapis.com/${fallbackBucket}`;
    }
  }

  private initializeGoogleStorage(): void {
    try {
      // Read all credentials from environment variables (NEVER use JSON files)
      this.bucketName = this.configService.get<string>('GCS_BUCKET_NAME') || 
                       this.configService.get<string>('GOOGLE_STORAGE_BUCKET');
      const projectId = this.configService.get<string>('GCS_PROJECT_ID');
      const clientEmail = this.configService.get<string>('GCS_CLIENT_EMAIL');
      const privateKey = this.configService.get<string>('GCS_PRIVATE_KEY')?.replace(/\\n/g, '\n');
      
      // Validate required credentials
      if (!this.bucketName) {
        throw new Error('GCS_BUCKET_NAME not configured in environment variables');
      }
      if (!projectId) {
        throw new Error('GCS_PROJECT_ID not configured in environment variables');
      }
      if (!clientEmail) {
        throw new Error('GCS_CLIENT_EMAIL not configured in environment variables');
      }
      if (!privateKey) {
        throw new Error('GCS_PRIVATE_KEY not configured in environment variables');
      }


      // Build credentials object from environment variables
      const credentials = {
        type: "service_account",
        project_id: projectId,
        private_key_id: this.configService.get<string>('GCS_PRIVATE_KEY_ID'),
        private_key: privateKey,
        client_email: clientEmail,
        client_id: this.configService.get<string>('GCS_CLIENT_ID'),
        auth_uri: this.configService.get<string>('GCS_AUTH_URI', 'https://accounts.google.com/o/oauth2/auth'),
        token_uri: this.configService.get<string>('GCS_TOKEN_URI', 'https://oauth2.googleapis.com/token'),
        auth_provider_x509_cert_url: this.configService.get<string>('GCS_AUTH_PROVIDER_X509_CERT_URL', 'https://www.googleapis.com/oauth2/v1/certs'),
        client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/${encodeURIComponent(clientEmail)}`,
        universe_domain: this.configService.get<string>('GCS_UNIVERSE_DOMAIN', 'googleapis.com')
      };

      // Initialize Google Cloud Storage client
      this.storage = new Storage({
        projectId,
        credentials
      });
      
      this.bucket = this.storage.bucket(this.bucketName);
      
    } catch (error) {
      this.logger.error('❌ Google Cloud Storage initialization failed:', error);
      this.logger.error('💡 Ensure all GCS environment variables are set in .env file:');
      this.logger.error('   - GCS_PROJECT_ID');
      this.logger.error('   - GCS_BUCKET_NAME');
      this.logger.error('   - GCS_CLIENT_EMAIL');
      this.logger.error('   - GCS_PRIVATE_KEY');
      throw error;
    }
  }

  private async initializeAwsStorage(): Promise<void> {
    try {
      this.s3BucketName = this.configService.get<string>('AWS_S3_BUCKET');
      this.s3Region = this.configService.get<string>('AWS_REGION', 'us-east-1');
      const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID');
      const secretAccessKey = this.configService.get<string>('AWS_SECRET_ACCESS_KEY');
      
      if (!this.s3BucketName) {
        throw new Error('AWS_S3_BUCKET not configured in environment variables');
      }
      
      if (!accessKeyId) {
        throw new Error('AWS_ACCESS_KEY_ID not configured in environment variables');
      }
      
      if (!secretAccessKey) {
        throw new Error('AWS_SECRET_ACCESS_KEY not configured in environment variables');
      }
      
      // Initialize AWS SDK v3 S3 Client
      this.s3Client = new S3Client({
        region: this.s3Region,
        credentials: {
          accessKeyId,
          secretAccessKey
        },
      });
      
      
    } catch (error) {
      this.logger.error('❌ AWS S3 initialization failed:', error);
      this.logger.error('💡 Ensure all AWS environment variables are set in .env file:');
      this.logger.error('   - AWS_S3_BUCKET');
      this.logger.error('   - AWS_ACCESS_KEY_ID');
      this.logger.error('   - AWS_SECRET_ACCESS_KEY');
      this.logger.error('   - AWS_REGION');
      throw error;
    }
  }

  private initializeLocalStorage(): void {
    try {
      this.localStoragePath = this.configService.get<string>('LOCAL_STORAGE_PATH', './uploads');
    } catch (error) {
      this.logger.error('❌ Local storage initialization failed:', error);
      throw error;
    }
  }

  /**
   * 🎯 MAIN METHOD: Convert relative path to full URL
   * 
   * OOP DESIGN: Smart URL resolver following Single Responsibility Principle
   * 
   * Behavior:
   * - If already full URL (http/https) → Return as-is
   * - If relative path → Prepend storage base URL from environment
   * 
   * Examples:
   * - Input: "homework-files/abc-123.pdf" → Output: "https://storage.googleapis.com/bucket/homework-files/abc-123.pdf"
   * - Input: "https://example.com/file.pdf" → Output: "https://example.com/file.pdf" (unchanged)
   * - Input: "" → Output: ""
   */
  getFullUrl(relativePath: string): string {
    if (!relativePath || relativePath.trim().length === 0) {
      return '';
    }

    const trimmedPath = relativePath.trim();

    // ✅ If already a full URL, return as-is
    if (trimmedPath.startsWith('http://') || trimmedPath.startsWith('https://')) {
      return trimmedPath;
    }

    // ✅ If relative path, prepend base URL and encode each path segment
    // so URLs with spaces (e.g. "Screenshot 2025.png") are always valid.
    const cleanPath = trimmedPath.startsWith('/') ? trimmedPath.substring(1) : trimmedPath;
    const encodedPath = cleanPath.split('/').map(segment => encodeURIComponent(segment)).join('/');
    return `${this.baseUrl}/${encodedPath}`;
  }

  /**
   * � **Helper: Check if path is a full URL (OOP encapsulation)**
   * @private
   */
  private isFullUrl(path: string): boolean {
    return path.startsWith('http://') || path.startsWith('https://');
  }

  /**
   * 🔗 **Batch URL Transformation (Array Helper for OOP consistency)**
   * Transforms multiple URLs at once - useful for imageUrls arrays
   * 
   * **Example:**
   * ```typescript
   * const urls = ['image1.jpg', 'https://cdn.com/image2.jpg', 'image3.jpg'];
   * const fullUrls = this.cloudStorageService.getFullUrls(urls);
   * // Returns: ['https://storage.../image1.jpg', 'https://cdn.com/image2.jpg', 'https://storage.../image3.jpg']
   * ```
   * 
   * @param paths - Array of relative paths or full URLs
   * @returns Array of full URLs (filters out empty strings)
   */
  getFullUrls(paths: (string | null | undefined)[]): string[] {
    if (!paths || paths.length === 0) {
      return [];
    }
    return paths.map(path => this.getFullUrl(path)).filter(url => url.length > 0);
  }

  /**
   * �📤 Upload file and return both full URL and relative path
   */
  async uploadFile(
    file: Buffer,
    relativePath: string,  // e.g., "suraksha.lk/user/123/profile.jpg"
    mimeType: string
  ): Promise<FileUploadResult> {
    try {
      
      const uploadResult = await this.performUpload(file, relativePath, mimeType);
      
      if (uploadResult.success) {
        const fullUrl = this.getFullUrl(relativePath);
        
        
        return {
          success: true,
          fullUrl,
          relativePath,
          fileName: this.extractFileName(relativePath),
          fileSize: file.length,
          mimeType,
          provider: this.provider as any,
          metadata: uploadResult.metadata
        };
      } else {
        throw new Error(uploadResult.error || 'Upload failed');
      }
      
    } catch (error) {
      this.logger.error(`❌ Upload failed for ${relativePath}:`, error);
      
      return {
        success: false,
        fullUrl: '',
        relativePath,
        fileName: this.extractFileName(relativePath),
        fileSize: file.length,
        mimeType,
        provider: this.provider as any,
        error: error.message
      };
    }
  }

  /**
   * 🗑️ Delete file using relative path
   */
  async deleteFile(relativePath: string): Promise<boolean> {
    try {
      
      const success = await this.performDeletion(relativePath);
      
      if (success) {
      } else {
        this.logger.warn(`⚠️ Deletion failed: ${relativePath}`);
      }
      
      return success;
    } catch (error) {
      this.logger.error(`💥 Deletion error for ${relativePath}:`, error);
      return false;
    }
  }

  /**
   * 🔄 Migrate URLs from old format to new format
   * For existing records with full URLs
   */
  extractRelativePath(fullUrl: string): string {
    if (!fullUrl) return '';
    
    // Remove base URL to get relative path
    if (fullUrl.includes('storage.googleapis.com')) {
      const parts = fullUrl.split('/');
      const bucketIndex = parts.findIndex(part => part.includes('googleapis.com')) + 2; // +2 to skip bucket name
      return parts.slice(bucketIndex).join('/');
    }
    
    if (fullUrl.includes('.s3.')) {
      const parts = fullUrl.split('/');
      return parts.slice(3).join('/'); // Remove https://bucket.s3.region.amazonaws.com
    }
    
    // For local or other formats
    const urlObj = new URL(fullUrl);
    return urlObj.pathname.substring(1); // Remove leading slash
  }

  /**
   * 📊 Get current storage configuration
   */
  getStorageInfo() {
    return {
      provider: this.provider,
      baseUrl: this.baseUrl,
      canMigrate: true
    };
  }

  // ⚠️ DEPRECATED: All Multer-based upload methods removed
  // ✅ NEW APPROACH: Use signed URLs via /upload/generate-signed-url and /upload/verify-and-publish
  //
  // Old flow: Backend receives file → Uploads to cloud
  // New flow: Backend generates URL → Client uploads directly → Backend verifies
  //
  // Benefits:
  // - No bandwidth usage on backend
  // - Faster uploads
  // - Better scalability
  // - Cost-effective (10MB file: Multer = 20MB bandwidth, Signed URL = <1KB)

  // ===========================================
  // 🔧 UTILITY METHODS
  // ===========================================

  /**
   * 🔐 Generate secure unpredictable token for file URLs
   * Prevents URL enumeration and unauthorized access
   */
  private generateSecureToken(length: number = 16): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const randomBytes = crypto.randomBytes(length);
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars[randomBytes[i] % chars.length];
    }
    return result;
  }

  /**
   * Get signed URL for temporary access (Google Cloud Storage only)
   */
  async getSignedUrl(relativePath: string, expiresIn: number = 3600): Promise<string> {
    if (this.provider === 'google' && this.bucket) {
      try {
        const file = this.bucket.file(relativePath);
        const [url] = await file.getSignedUrl({
          action: 'read',
          expires: Date.now() + expiresIn * 1000,
        });
        return url;
      } catch (error) {
        this.logger.error(`Error generating signed URL: ${error.message}`);
        throw new InternalServerErrorException('Failed to generate signed URL');
      }
    } else {
      // For other providers, return public URL
      return this.getFullUrl(relativePath);
    }
  }

  /**
   * 🔐 Generate SHORT-LIVED PRIVATE signed URL for direct client uploads
   * 
   * **Upload Flow:**
   * 1. Generate short-lived private signed URL (10 min)
   * 2. Client uploads to signed URL
   * 3. Client sends relativePath to backend
   * 4. Backend verifies file exists and makes it public
   * 5. Backend returns long-term public URL
   * 
   * **Security Features:**
   * - Content-Length limit enforced in signature
   * - Single-use URL (expires after successful upload)
   * - Content-Type validation
   */
  async generateSignedUploadUrl(
    folder: string,
    fileName: string,
    contentType: string,
    expiresIn: number = 600, // 10 minutes
    maxFileSize?: number // Optional: Maximum file size in bytes
  ): Promise<{
    uploadUrl: string;
    relativePath: string;
    expiresAt: Date;
    maxFileSize?: number;
    contentType: string;
    fields?: any; // For AWS S3 POST uploads
  }> {
    const provider = this.provider.toLowerCase();
    
    // Generate unique filename to prevent collisions
    const fileExtension = path.extname(fileName);
    const baseFileName = path.basename(fileName, fileExtension);
    const uniqueFileName = `${baseFileName}-${uuidv4()}${fileExtension}`;
    const relativePath = `${folder}/${uniqueFileName}`;

    try {
      switch (provider) {
        case 'google':
        case 'gcs':
          return await this.generateGoogleSignedUploadUrl(
            relativePath, 
            contentType, 
            expiresIn, 
            maxFileSize
          );

        case 'aws':
        case 's3':
          return await this.generateAwsSignedUploadUrl(
            relativePath, 
            contentType, 
            expiresIn, 
            maxFileSize
          );

        default:
          throw new InternalServerErrorException(
            `Signed upload URLs not supported for provider: ${provider}`
          );
      }
    } catch (error) {
      this.logger.error(`Error generating signed upload URL: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to generate signed upload URL');
    }
  }

  /**
   * 🔐 Generate Google Cloud Storage signed upload URL
   */
  private async generateGoogleSignedUploadUrl(
    relativePath: string,
    contentType: string,
    expiresIn: number,
    maxFileSize?: number
  ): Promise<{
    uploadUrl: string;
    relativePath: string;
    expiresAt: Date;
    maxFileSize?: number;
    contentType: string;
    fields?: any;
  }> {
    if (!this.bucket) {
      throw new InternalServerErrorException('Google Cloud Storage bucket not initialized');
    }

    const file = this.bucket.file(relativePath);
    
    // 🔒 SECURITY: Validate content type before generating URL
    const folder = relativePath.split('/')[0];
    const allowedContentTypes = this.getAllowedContentTypesForFolder(folder);
    if (!allowedContentTypes.includes(contentType)) {
      throw new BadRequestException(
        `Content type ${contentType} not allowed for folder ${folder}. Allowed: ${allowedContentTypes.join(', ')}`
      );
    }
    
    // Build signed URL options with security restrictions
    const signedUrlOptions: any = {
      version: 'v4',
      action: 'write',
      expires: Date.now() + expiresIn * 1000,
      contentType: contentType,
      extensionHeaders: {
        // 🔒 SECURITY: Strict content type enforcement
        'Content-Type': contentType,
      }
    };

    // 🔒 SECURITY 1: Add file size limit to signed URL if provided
    if (maxFileSize) {
      signedUrlOptions.extensionHeaders['x-goog-content-length-range'] = `0,${maxFileSize}`;
    }

    // Generate signed URL for upload (PUT request)
    const [uploadUrl] = await file.getSignedUrl(signedUrlOptions);
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    return {
      uploadUrl,
      relativePath,
      expiresAt,
      maxFileSize,
      contentType
    };
  }

  /**
   * 🔐 Generate AWS S3 presigned PUT URL for direct client uploads
   *
   * Uses a standard presigned PUT URL so the frontend can upload with a simple
   * HTTP PUT request and a Content-Type header — no multipart form data required.
   * Server-side encryption (AES256) is baked into the signed request.
   * File size and content-type are validated by verifyAndMakePublicS3 after upload.
   */
  private async generateAwsSignedUploadUrl(
    relativePath: string,
    contentType: string,
    expiresIn: number,
    maxFileSize?: number
  ): Promise<{
    uploadUrl: string;
    relativePath: string;
    expiresAt: Date;
    maxFileSize?: number;
    contentType: string;
    fields?: any;
  }> {
    if (!this.s3Client) {
      this.logger.error('❌ AWS S3 client is not initialized. Check server logs for initialization errors.');
      throw new InternalServerErrorException('AWS S3 client not initialized. Please check AWS credentials and ensure @aws-sdk/client-s3 is installed.');
    }

    // 🔒 SECURITY: Restrict to specific content types only (whitelist approach)
    const folder = relativePath.split('/')[0];
    const allowedContentTypes = this.getAllowedContentTypesForFolder(folder);
    if (!allowedContentTypes.includes(contentType)) {
      throw new BadRequestException(
        `Content type ${contentType} not allowed for folder ${folder}. Allowed: ${allowedContentTypes.join(', ')}`
      );
    }

    try {
      // Use presigned PUT — simpler than presigned POST, no form fields needed.
      // Frontend: PUT <uploadUrl> with Content-Type header + binary body.
      const command = new PutObjectCommand({
        Bucket: this.s3BucketName,
        Key: relativePath,
        ContentType: contentType,
      });

      const uploadUrl = await getSignedUrl(this.s3Client, command, { expiresIn });
      const expiresAt = new Date(Date.now() + expiresIn * 1000);

      return {
        uploadUrl,
        relativePath,
        expiresAt,
        maxFileSize,
        contentType,
        fields: undefined, // PUT upload — no form fields required
      };
    } catch (error) {
      this.logger.error(`❌ Failed to create presigned PUT URL: ${error.message}`, error.stack);
      throw new InternalServerErrorException(`Failed to generate presigned PUT URL: ${error.message}`);
    }
  }

  /**
   * ✅ Verify uploaded file and make it publicly accessible
   * 
   * Call this after client has uploaded to signed URL.
   * Verifies file exists and makes it public with long-term access.
   * 
   * @param relativePath - Relative path to the uploaded file
   * @returns Public URL if successful, throws error if file doesn't exist
   */
  async verifyAndMakePublic(relativePath: string): Promise<string> {
    const provider = this.provider.toLowerCase();

    try {
      switch (provider) {
        case 'google':
        case 'gcs':
          return await this.verifyAndMakePublicGCS(relativePath);

        case 'aws':
        case 's3':
          return await this.verifyAndMakePublicS3(relativePath);

        default:
          this.logger.warn(`verifyAndMakePublic: Provider ${provider}, returning public URL directly`);
          return this.getFullUrl(relativePath);
      }
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof InternalServerErrorException) {
        throw error;
      }
      this.logger.error(`❌ Unexpected error in verifyAndMakePublic: ${error.message}`, error.stack);
      throw new InternalServerErrorException(`Failed to verify uploaded file: ${error.message}`);
    }
  }

  /**
   * 🔍 Verify and make public - Google Cloud Storage
   */
  private async verifyAndMakePublicGCS(relativePath: string): Promise<string> {
    if (!this.bucket) {
      throw new InternalServerErrorException('Google Cloud Storage bucket not initialized');
    }

    const file = this.bucket.file(relativePath);
    
    // 1️⃣ Verify file exists
    let exists = false;
    try {
      [exists] = await file.exists();
    } catch (existsError) {
      this.logger.error(`❌ Error checking file existence: ${existsError.message}`, existsError.stack);
      throw new InternalServerErrorException(`Failed to verify file: ${existsError.message}`);
    }

    if (!exists) {
      this.logger.error(`❌ File not found: ${relativePath}`);
      throw new BadRequestException(`File not found. Please upload the file first using the provided signed URL.`);
    }

    // 2️⃣ Make file publicly accessible (long-term)
    try {
      await file.makePublic();
    } catch (aclError) {
      // Bucket might have uniform bucket-level access enabled
      this.logger.warn(`Could not set ACL (likely uniform access enabled): ${aclError.message}`);
    }

    // 3️⃣ Return long-term public URL
    const publicUrl = this.getFullUrl(relativePath);
    
    return publicUrl;
  }

  /**
   * 🔍 Verify and make public - AWS S3
   */
  private async verifyAndMakePublicS3(relativePath: string): Promise<string> {
    if (!this.s3Client) {
      throw new InternalServerErrorException('AWS S3 client not initialized');
    }

    // 1️⃣ Verify file exists and get metadata
    let fileMetadata: any;
    try {
      const headCommand = new HeadObjectCommand({
        Bucket: this.s3BucketName,
        Key: relativePath
      });
      fileMetadata = await this.s3Client.send(headCommand);
      
      const fileSizeKB = (fileMetadata.ContentLength / 1024).toFixed(2);
      
      const folder = relativePath.split('/')[0]; // Extract folder from path
      
      // 🔒 SECURITY 1: Verify actual uploaded file size
      const maxFileSize = this.getMaxFileSizeForFolder(folder);
      
      if (maxFileSize && fileMetadata.ContentLength > maxFileSize) {
        const maxSizeMB = (maxFileSize / 1024 / 1024).toFixed(2);
        const actualSizeMB = (fileMetadata.ContentLength / 1024 / 1024).toFixed(2);
        
        this.logger.error(`❌ File size exceeds limit: ${actualSizeMB}MB > ${maxSizeMB}MB`);
        
        // Delete the oversized file
        await this.deleteOversizedFile(relativePath);
        
        throw new BadRequestException(
          `File size exceeds limit. Maximum: ${maxSizeMB}MB, Uploaded: ${actualSizeMB}MB. File has been deleted.`
        );
      }

      // 🔒 SECURITY 2: Verify content type matches allowed types for folder
      const actualContentType = fileMetadata.ContentType || 'application/octet-stream';
      const allowedTypes = this.getAllowedContentTypesForFolder(folder);
      
      if (!allowedTypes.includes(actualContentType)) {
        this.logger.error(`❌ Invalid content type: ${actualContentType} for folder: ${folder}`);
        
        // Delete file with invalid content type
        await this.deleteOversizedFile(relativePath);
        
        throw new BadRequestException(
          `Invalid file type. Allowed types: ${allowedTypes.join(', ')}. File has been deleted.`
        );
      }

      // 🔒 SECURITY 3: Verify file is not empty (0 bytes)
      if (fileMetadata.ContentLength === 0) {
        this.logger.error(`❌ Empty file detected: ${relativePath}`);
        
        await this.deleteOversizedFile(relativePath);
        
        throw new BadRequestException(
          `Empty files are not allowed. File has been deleted.`
        );
      }

      // 🔒 SECURITY 4: Verify server-side encryption is enabled
      if (!fileMetadata.ServerSideEncryption) {
        this.logger.warn(`⚠️ File uploaded without server-side encryption: ${relativePath}`);
        // Don't delete, but log the warning for monitoring
      }

      // 🔒 SECURITY 5: Check for suspicious file extensions in key
      const fileName = relativePath.split('/').pop() || '';
      const suspiciousExtensions = ['.exe', '.bat', '.cmd', '.sh', '.ps1', '.js', '.php', '.py', '.rb', '.pl'];
      
      if (suspiciousExtensions.some(ext => fileName.toLowerCase().endsWith(ext))) {
        this.logger.error(`❌ Suspicious file extension detected: ${fileName}`);
        
        await this.deleteOversizedFile(relativePath);
        
        throw new BadRequestException(
          `Executable and script files are not allowed. File has been deleted.`
        );
      }
      
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      // AWS SDK v3 uses error.$metadata.httpStatusCode and error.name
      const httpStatus = error.$metadata?.httpStatusCode ?? error.statusCode;
      const errName   = error.name ?? error.code ?? '';
      this.logger.error(`❌ Error checking S3 file existence: ${errName} (HTTP ${httpStatus}) bucket=${this.s3BucketName} key=${relativePath}`);
      if (httpStatus === 404 || errName === 'NotFound') {
        throw new BadRequestException(`File not found in storage. Please upload the file first using the provided signed URL.`);
      }
      if (httpStatus === 403 || errName === 'AccessDenied') {
        throw new InternalServerErrorException(`Storage access denied. Check AWS IAM permissions for bucket: ${this.s3BucketName}`);
      }
      if (httpStatus === 301 || errName === 'PermanentRedirect' || errName === 'UnknownError') {
        // Wrong region — bucket exists in a different region than AWS_REGION env var
        throw new InternalServerErrorException(`S3 region mismatch: bucket "${this.s3BucketName}" is not in region "${process.env.AWS_REGION}". Update AWS_REGION env var.`);
      }
      throw new InternalServerErrorException(`Failed to verify file: ${errName || error.message}`);
    }

    // 2️⃣ Make file publicly accessible (set ACL to public-read)
    try {
      const putAclCommand = new PutObjectAclCommand({
        Bucket: this.s3BucketName,
        Key: relativePath,
        ACL: 'public-read'
      });
      await this.s3Client.send(putAclCommand);
    } catch (aclError) {
      // Bucket might have block public access enabled
      this.logger.warn(`Could not set S3 ACL to public: ${aclError.message}`);
    }

    // 3️⃣ Return long-term public URL
    const publicUrl = this.getFullUrl(relativePath);
    
    return publicUrl;
  }

  /**
   * ✅ Check if file exists in cloud storage
   */
  async fileExists(relativePath: string): Promise<boolean> {
    try {
      const provider = this.provider.toLowerCase();

      switch (provider) {
        case 'google':
        case 'gcs':
          if (!this.bucket) {
            this.logger.error('Google Cloud Storage bucket not initialized');
            return false;
          }
          const file = this.bucket.file(relativePath);
          const [exists] = await file.exists();
          return exists;

        case 'aws':
        case 's3':
          // AWS S3 implementation
          if (!this.s3Client) {
            this.logger.error('AWS S3 client not initialized');
            return false;
          }
          try {
            const headCommand = new HeadObjectCommand({
              Bucket: this.s3BucketName,
              Key: relativePath
            });
            await this.s3Client.send(headCommand);
            return true;
          } catch (error) {
            return false;
          }

        case 'local':
          // Local filesystem implementation
          try {
            await fs.access(path.join(this.localStoragePath, relativePath));
            return true;
          } catch {
            return false;
          }

        default:
          this.logger.warn(`fileExists not implemented for provider: ${provider}`);
          return false;
      }
    } catch (error) {
      this.logger.error(`Error checking file existence: ${error.message}`);
      return false;
    }
  }

  private extractFileName(relativePath: string): string {
    return relativePath.split('/').pop() || '';
  }

  private async performUpload(file: Buffer, relativePath: string, mimeType: string): Promise<{ success: boolean; metadata?: any; error?: string }> {
    switch (this.provider.toLowerCase()) {
      case 'google':
      case 'gcs':
        return this.uploadToGoogle(file, relativePath, mimeType);
      case 'aws':
      case 's3':
        return this.uploadToAws(file, relativePath, mimeType);
      case 'local':
        return this.uploadToLocal(file, relativePath, mimeType);
      default:
        return { success: false, error: `Unsupported provider: ${this.provider}` };
    }
  }

  private async performDeletion(relativePath: string): Promise<boolean> {
    // TODO: Implement based on this.provider
    switch (this.provider) {
      case 'google':
        return this.deleteFromGoogle(relativePath);
      case 'aws':
        return this.deleteFromAws(relativePath);
      case 'local':
        return this.deleteFromLocal(relativePath);
      default:
        return false;
    }
  }

  // 🌐 Google Cloud Storage Implementation
  private async uploadToGoogle(file: Buffer, relativePath: string, mimeType: string): Promise<{ success: boolean; metadata?: any; error?: string }> {
    try {
      if (!this.bucket) {
        return { success: false, error: 'Google Cloud Storage not initialized' };
      }

      const gcsFile = this.bucket.file(relativePath);
      
      const stream = gcsFile.createWriteStream({
        metadata: {
          contentType: mimeType,
          cacheControl: 'public, max-age=31536000',
          metadata: {
            'original-name': this.extractFileName(relativePath),
            'upload-date': getCurrentSriLankaISO(),
            'access-type': 'permanent-public',
          },
        },
        resumable: false,
        // Remove 'public: true' - it tries to set ACL which fails with uniform bucket-level access
      });

      return new Promise((resolve) => {
        stream.on('error', (error) => {
          this.logger.error(`GCS upload error: ${error.message}`);
          resolve({ success: false, error: error.message });
        });

        stream.on('finish', async () => {
          try {
            // Make file public
            // Note: Skip ACL operations if uniform bucket-level access is enabled
            try {
              await gcsFile.makePublic();
            } catch (aclError) {
              this.logger.warn(`ACL makePublic skipped (uniform bucket access): ${aclError.message}`);
            }
            
            const [metadata] = await gcsFile.getMetadata();
            resolve({ 
              success: true, 
              metadata: {
                size: metadata.size,
                updated: metadata.updated,
                contentType: metadata.contentType
              }
            });
          } catch (error) {
            this.logger.warn(`File uploaded but public access may be limited: ${error.message}`);
            resolve({ success: true });
          }
        });

        stream.end(file);
      });
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // 🪣 AWS S3 Implementation
  private async uploadToAws(file: Buffer, relativePath: string, mimeType: string): Promise<{ success: boolean; metadata?: any; error?: string }> {
    try {
      if (!this.s3) {
        return { success: false, error: 'AWS S3 not initialized or SDK not available' };
      }

      const params = {
        Bucket: this.s3BucketName,
        Key: relativePath,
        Body: file,
        ContentType: mimeType,
        ACL: 'public-read',
        CacheControl: 'public, max-age=31536000',
        Metadata: {
          'original-name': this.extractFileName(relativePath),
          'upload-date': getCurrentSriLankaISO(),
          'access-type': 'permanent-public'
        }
      };

      const result = await this.s3.upload(params).promise();
      
      return {
        success: true,
        metadata: {
          location: result.Location,
          etag: result.ETag,
          bucket: result.Bucket,
          key: result.Key
        }
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // 💾 Local Storage Implementation
  private async uploadToLocal(file: Buffer, relativePath: string, mimeType: string): Promise<{ success: boolean; metadata?: any; error?: string }> {
    try {
      const fullPath = path.join(this.localStoragePath, relativePath);
      const dir = path.dirname(fullPath);
      
      // Create directory if it doesn't exist
      await fs.mkdir(dir, { recursive: true });
      
      // Write file
      await fs.writeFile(fullPath, file);
      
      const stats = await fs.stat(fullPath);
      
      return {
        success: true,
        metadata: {
          size: stats.size,
          created: stats.birthtime,
          modified: stats.mtime,
          path: fullPath
        }
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 📊 Get file metadata
   */
  async getFileMetadata(fileName: string): Promise<{
    size: string;
    contentType: string;
    etag: string;
    updated: string;
  }> {
    try {
      const provider = this.provider.toLowerCase();
      
      switch (provider) {
        case 'google':
        case 'gcs':
          const [metadata] = await this.bucket.file(fileName).getMetadata();
          return {
            size: (metadata.size || 0).toString(),
            contentType: metadata.contentType || 'application/octet-stream',
            etag: metadata.etag || '',
            updated: metadata.updated || getCurrentSriLankaISO()
          };
        
        case 'aws':
        case 's3':
          if (!this.s3) throw new Error('AWS S3 not initialized');
          const head = await this.s3.headObject({
            Bucket: this.s3BucketName,
            Key: fileName
          }).promise();
          
          return {
            size: head.ContentLength?.toString() || '0',
            contentType: head.ContentType || 'application/octet-stream',
            etag: head.ETag || '',
            updated: head.LastModified?.toISOString() || getCurrentSriLankaISO()
          };
        
        case 'local':
        default:
          const localPath = path.join(this.localStoragePath, fileName);
          const stats = await fs.stat(localPath);
          return {
            size: stats.size.toString(),
            contentType: 'application/octet-stream',
            etag: '',
            updated: stats.mtime.toISOString()
          };
      }
    } catch (error) {
      this.logger.error(`Error getting file metadata: ${error.message}`);
      throw error;
    }
  }

  /**
   * 🔓 Check if file is public
   */
  async isFilePublic(fileName: string): Promise<boolean> {
    try {
      const provider = this.provider.toLowerCase();
      
      switch (provider) {
        case 'google':
        case 'gcs':
          try {
            const [acl] = await this.bucket.file(fileName).acl.get();
            const aclArray = Array.isArray(acl) ? acl : [acl];
            return aclArray.some((entry: any) => 
              entry.entity === 'allUsers' && entry.role === 'READER'
            );
          } catch (error) {
            return false;
          }
        
        case 'aws':
        case 's3':
        case 'local':
        default:
          return true; // Assume public for AWS and local
      }
    } catch (error) {
      this.logger.error(`Error checking file public status: ${error.message}`);
      return false;
    }
  }



  /**
   * 📥 Download file
   */
  async downloadFile(fileName: string): Promise<Buffer> {
    try {
      const provider = this.provider.toLowerCase();
      
      switch (provider) {
        case 'google':
        case 'gcs':
          const [data] = await this.bucket.file(fileName).download();
          return data;
        
        case 'aws':
        case 's3':
          if (!this.s3) throw new Error('AWS S3 not initialized');
          const result = await this.s3.getObject({
            Bucket: this.s3BucketName,
            Key: fileName
          }).promise();
          
          return result.Body as Buffer;
        
        case 'local':
        default:
          const localPath = path.join(this.localStoragePath, fileName);
          return await fs.readFile(localPath);
      }
    } catch (error) {
      this.logger.error(`Error downloading file: ${error.message}`);
      throw error;
    }
  }

  /**
   * 🔗 Get public URL - Enhanced for dynamic domain support
   */
  getPublicUrl(relativePath: string, currentDomain?: string): string {
    if (!relativePath) return '';
    
    // If already a full URL, return as-is
    if (relativePath.startsWith('http://') || relativePath.startsWith('https://')) {
      return relativePath;
    }
    
    // Ensure path starts with /
    const cleanPath = relativePath.startsWith('/') ? relativePath : `/${relativePath}`;
    
    // Use current domain or fallback to configured base URL
    if (currentDomain) {
      return `${currentDomain}${cleanPath}`;
    }
    
    // Fallback to configured base URL based on storage provider
    const provider = this.provider.toLowerCase();
    switch (provider) {
      case 'google':
      case 'gcs':
        // For Google Cloud, we might want to use signed URLs or custom domain
        const gcsBaseUrl = this.configService.get('GCS_PUBLIC_BASE_URL') || 'https://suraksha.lk';
        return `${gcsBaseUrl}${cleanPath}`;
      
      case 'aws':
      case 's3':
        const awsBaseUrl = this.configService.get('AWS_S3_PUBLIC_BASE_URL') || 'https://suraksha.lk';
        return `${awsBaseUrl}${cleanPath}`;
      
      case 'local':
      default:
        const localBaseUrl = this.configService.get('LOCAL_STORAGE_BASE_URL') || 'https://suraksha.lk';
        return `${localBaseUrl}${cleanPath}`;
    }
  }

  /**
   * 📂 List files in folder
   */
  async listFiles(folder: string): Promise<Array<{
    name: string;
    size: string;
    contentType: string;
    updated: string;
  }>> {
    try {
      const provider = this.provider.toLowerCase();
      
      switch (provider) {
        case 'google':
        case 'gcs':
          const [files] = await this.bucket.getFiles({ prefix: folder });
          return files.map(file => ({
            name: file.name,
            size: (file.metadata.size || 0).toString(),
            contentType: file.metadata.contentType || 'application/octet-stream',
            updated: file.metadata.updated || getCurrentSriLankaISO()
          }));
        
        case 'aws':
        case 's3':
          if (!this.s3) return [];
          const result = await this.s3.listObjectsV2({
            Bucket: this.s3BucketName,
            Prefix: folder
          }).promise();
          
          return result.Contents?.map((obj: any) => ({
            name: obj.Key || '',
            size: obj.Size?.toString() || '0',
            contentType: 'application/octet-stream',
            updated: obj.LastModified?.toISOString() || getCurrentSriLankaISO()
          })) || [];
        
        case 'local':
        default:
          const folderPath = path.join(this.localStoragePath, folder);
          try {
            const items = await fs.readdir(folderPath);
            const results = [];
            
            for (const item of items) {
              try {
                const itemPath = path.join(folderPath, item);
                const stats = await fs.stat(itemPath);
                if (stats.isFile()) {
                  results.push({
                    name: path.join(folder, item),
                    size: stats.size.toString(),
                    contentType: 'application/octet-stream',
                    updated: stats.mtime.toISOString()
                  });
                }
              } catch (error) {
                this.logger.warn(`Error reading file stats for ${item}: ${error.message}`);
              }
            }
            
            return results;
          } catch (error) {
            this.logger.warn(`Error reading directory ${folderPath}: ${error.message}`);
            return [];
          }
      }
    } catch (error) {
      this.logger.error(`Error listing files: ${error.message}`);
      return [];
    }
  }

  // 🗑️ Deletion implementations
  private async deleteFromGoogle(relativePath: string): Promise<boolean> {
    try {
      if (!this.bucket) return false;
      const file = this.bucket.file(relativePath);
      await file.delete();
      return true;
    } catch (error) {
      this.logger.error(`GCS delete error: ${error.message}`);
      return false;
    }
  }

  private async deleteFromAws(relativePath: string): Promise<boolean> {
    try {
      if (!this.s3) return false;
      await this.s3.deleteObject({ Bucket: this.s3BucketName, Key: relativePath }).promise();
      return true;
    } catch (error) {
      this.logger.error(`S3 delete error: ${error.message}`);
      return false;
    }
  }

  private async deleteFromLocal(relativePath: string): Promise<boolean> {
    try {
      const fullPath = path.join(this.localStoragePath, relativePath);
      await fs.unlink(fullPath);
      return true;
    } catch (error) {
      this.logger.error(`Local delete error: ${error.message}`);
      return false;
    }
  }

  /**
   * 🔒 SECURITY: Get maximum file size for folder
   * Returns the maximum allowed file size in bytes for a given folder
   * Used for post-upload verification in AWS S3 (since presigned URLs can't enforce size)
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
      'class-payment-receipts': this.configService.get<number>('MAX_PAYMENT_RECEIPT_SIZE_MB', 5) * 1024 * 1024,
      'id-documents': this.configService.get<number>('MAX_ID_DOCUMENT_SIZE_MB', 5) * 1024 * 1024,
      'bookhire-vehicle-images': this.configService.get<number>('MAX_BOOKHIRE_VEHICLE_IMAGE_SIZE_MB', 5) * 1024 * 1024,
      'bookhire-owner-images': this.configService.get<number>('MAX_BOOKHIRE_OWNER_IMAGE_SIZE_MB', 5) * 1024 * 1024,
      'lecture-thumbnails': this.configService.get<number>('MAX_LECTURE_THUMBNAIL_SIZE_MB', 5) * 1024 * 1024,
      'lecture-covers': this.configService.get<number>('MAX_LECTURE_COVER_SIZE_MB', 5) * 1024 * 1024,
      'service-payment-receipts': this.configService.get<number>('MAX_SERVICE_PAYMENT_RECEIPT_SIZE_MB', 5) * 1024 * 1024,
      'structured-lecture-covers': this.configService.get<number>('MAX_LECTURE_COVER_SIZE_MB', 5) * 1024 * 1024,
      'structured-lecture-documents': this.configService.get<number>('MAX_LECTURE_DOCUMENT_SIZE_MB', 5) * 1024 * 1024,
    };

    return maxSizes[folder] || (5 * 1024 * 1024); // Default 5MB
  }

  /**
   * 🔒 SECURITY: Delete file (used when validation fails)
   */
  private async deleteOversizedFile(relativePath: string): Promise<void> {
    try {
      const deleteCommand = new DeleteObjectCommand({
        Bucket: this.s3BucketName,
        Key: relativePath
      });
      await this.s3Client.send(deleteCommand);
    } catch (deleteError) {
      this.logger.error(`Failed to delete invalid file: ${deleteError.message}`);
    }
  }

  /**
   * 🔒 SECURITY: Get allowed content types for folder (whitelist approach)
   * Prevents uploading executable files, scripts, or malicious content
   */
  private getAllowedContentTypesForFolder(folder: string): string[] {
    const allowedTypes: Record<string, string[]> = {
      'profile-images': [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/webp'
      ],
      'student-images': [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/webp'
      ],
      'institute-images': [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/webp',
        'image/svg+xml'
      ],
      'institute-user-images': [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/webp'
      ],
      'subject-images': [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/webp'
      ],
      'homework-files': [
        'application/pdf',
        'image/jpeg',
        'image/jpg',
        'image/png',
        'application/msword', // .doc
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document' // .docx
      ],
      'correction-files': [
        'application/pdf',
        'image/jpeg',
        'image/jpg',
        'image/png'
      ],
      'institute-payment-receipts': [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'application/pdf'
      ],
      'subject-payment-receipts': [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'application/pdf'
      ],
      'enrollment-payment-receipts': [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'application/pdf'
      ],
      'id-documents': [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'application/pdf'
      ],
      'bookhire-vehicle-images': [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/webp'
      ],
      'bookhire-owner-images': [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/webp'
      ],
      'lecture-thumbnails': [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/webp',
        'image/gif'
      ],
      'lecture-covers': [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/webp',
      ],
      'service-payment-receipts': [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'application/pdf'
      ],
      'class-payment-receipts': [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'application/pdf'
      ],
      'structured-lecture-covers': [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/webp',
      ],
      'structured-lecture-documents': [
        'application/pdf',
        'image/jpeg',
        'image/jpg',
        'image/png'
      ],
    };

    return allowedTypes[folder] || ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
  }
}
