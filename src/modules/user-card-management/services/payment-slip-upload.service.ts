import { Injectable, BadRequestException } from '@nestjs/common';
import { CloudStorageService } from '../../../common/services/cloud-storage.service';
import { v4 as uuidv4 } from 'uuid';
import { now, nowTimestamp } from '../../../common/utils/timezone.util';

@Injectable()
export class PaymentSlipUploadService {
  constructor(private readonly cloudStorageService: CloudStorageService) {}

  /**
   * Generate signed URL for payment slip upload
   * - Secure: URLs expire after 15 minutes
   * - Private: Files are NOT publicly accessible
   * - Limited: Max file size 10MB
   * - Restricted: Only image files allowed
   */
  async generateUploadUrl(
    userId: string,
    orderId: string,
    fileName: string,
    contentType: string,
  ): Promise<{
    uploadUrl: string;
    relativePath: string;
    expiresAt: Date;
    maxFileSize: number;
    contentType: string;
    fields: Record<string, string>;
    instructions: string;
  }> {
    // Validate content type (only images)
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowedTypes.includes(contentType.toLowerCase())) {
      throw new BadRequestException(
        `Invalid file type. Only images (JPEG, PNG, WEBP) and PDF are allowed. Received: ${contentType}`,
      );
    }

    // Validate file extension matches content type
    const extension = fileName.split('.').pop()?.toLowerCase();
    const validExtensions = {
      'image/jpeg': ['jpg', 'jpeg'],
      'image/jpg': ['jpg', 'jpeg'],
      'image/png': ['png'],
      'image/webp': ['webp'],
      'application/pdf': ['pdf'],
    };

    if (!validExtensions[contentType]?.includes(extension)) {
      throw new BadRequestException(
        `File extension .${extension} does not match content type ${contentType}`,
      );
    }

    // Max file size: 10MB
    const maxFileSize = 10 * 1024 * 1024;

    // Generate signed URL for upload (expires in 15 minutes)
    const expiresIn = 15 * 60; // 15 minutes in seconds
    
    const uploadData = await this.cloudStorageService.generateSignedUploadUrl(
      `payment-slips/private/${userId}/${orderId}`,
      fileName,
      contentType,
      expiresIn,
      maxFileSize,
    );

    return {
      uploadUrl: uploadData.uploadUrl,
      relativePath: uploadData.relativePath,
      expiresAt: uploadData.expiresAt,
      maxFileSize: maxFileSize,
      contentType: uploadData.contentType,
      fields: uploadData.fields ?? {},
      instructions: 'POST multipart/form-data to uploadUrl: append all fields first, then append the file as the last field named "file"',
    };
  }

  /**
   * Generate signed URL to view/download payment slip
   * - Secure: URLs expire after 1 hour
   * - Private: Only accessible with signed URL
   */
  async generateViewUrl(relativePath: string): Promise<{
    viewUrl: string;
    expiresAt: Date;
  }> {
    if (!relativePath || !relativePath.startsWith('payment-slips/private/')) {
      throw new BadRequestException('Invalid payment slip path');
    }

    // Generate signed URL for viewing (expires in 1 hour)
    const expiresInSeconds = 60 * 60; // 1 hour in seconds
    const viewUrl = await this.cloudStorageService.getSignedUrl(relativePath, expiresInSeconds);
    const expiresAtMs = nowTimestamp() + (expiresInSeconds * 1000); // Convert seconds to milliseconds
    const expiresAt = new Date(expiresAtMs);

    return {
      viewUrl,
      expiresAt,
    };
  }

  /**
   * Verify file was uploaded successfully
   */
  async verifyUpload(relativePath: string): Promise<boolean> {
    try {
      const exists = await this.cloudStorageService.fileExists(relativePath);
      return exists;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get file metadata
   */
  async getFileMetadata(relativePath: string): Promise<{
    size: number;
    contentType: string;
    uploaded: Date;
  }> {
    const metadata = await this.cloudStorageService.getFileMetadata(relativePath);
    return {
      size: parseInt(metadata.size, 10),
      contentType: metadata.contentType,
      uploaded: new Date(metadata.updated),
    };
  }
}
