import { Injectable, Logger, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { CloudStorageService } from './cloud-storage.service';
/**
 * 🌐 FILE PROXY SERVICE
 * Serves files through your custom domain instead of exposing GCS URLs
 * URLs: https://suraksha.lk/files/profile-images/user-123.jpg
 */
@Injectable()
export class FileProxyService {
  private readonly logger = new Logger(FileProxyService.name);
  private readonly baseUrl: string;
  private readonly allowedFolders = [
    'profile-images',
    'subject-images', 
    'institute-images',
    'student-images',
    'id-documents',
    'homework-submissions',
    'teacher-corrections',
    'payments'
  ];

  constructor(
    private configService: ConfigService,
    private readonly cloudStorageService: CloudStorageService
  ) {
    this.baseUrl = this.configService.get<string>('BASE_URL') || 'https://suraksha.lk';
  }

  /**
   * 🔄 Convert GCS URL to custom domain URL
   */
  convertGcsUrlToCustomUrl(gcsUrl: string): string {
    try {
      // Extract the file path from GCS URL
      // From: https://storage.googleapis.com/bucket-name/folder/file.jpg
      // To: https://suraksha.lk/files/folder/file.jpg
      
      const urlParts = gcsUrl.split('/');
      if (urlParts.length < 5) {
        throw new Error('Invalid GCS URL format');
      }

      // Get everything after the bucket name
      const pathIndex = urlParts.findIndex(part => part.includes('storage.googleapis.com'));
      if (pathIndex === -1) {
        throw new Error('Bucket name not found in URL');
      }

      const filePath = urlParts.slice(pathIndex + 1).join('/');
      const customUrl = `${this.baseUrl}/${filePath}`;
      return customUrl;
    } catch (error) {
      this.logger.error(`Failed to convert GCS URL: ${error.message}`);
      return gcsUrl; // Return original URL as fallback
    }
  }

  /**
   * 🎯 Serve file through proxy with security checks
   */
  async serveFile(filePath: string, res: Response): Promise<void> {
    try {

      // Security validation
      if (!this.validateFilePath(filePath)) {
        throw new NotFoundException('File not found or access denied');
      }

      // Check if file exists
      const fileExists = await this.cloudStorageService.fileExists(filePath);
      if (!fileExists) {
        throw new NotFoundException('File not found');
      }

      // Get file metadata for headers
      const metadata = await this.cloudStorageService.getFileMetadata(filePath);
      
      // Set appropriate headers
      res.setHeader('Content-Type', metadata.contentType || 'application/octet-stream');
      res.setHeader('Content-Length', metadata.size);
      res.setHeader('Cache-Control', 'public, max-age=31536000'); // 1 year cache
      res.setHeader('ETag', metadata.etag);
      
      // Add security headers
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      
      // File should already be public (uploaded via signed URL system)
      // If not public, use verifyAndMakePublic method
      const isPublic = await this.cloudStorageService.isFilePublic(filePath);
      if (!isPublic) {
        // This will verify file exists and make it public
        await this.cloudStorageService.verifyAndMakePublic(filePath);
      }

      try {
        // Download and stream the file directly (works for both public and authenticated)
        const fileBuffer = await this.cloudStorageService.downloadFile(filePath);
        res.send(fileBuffer);
      } catch (downloadError) {
        this.logger.error(`Error serving file ${filePath}: ${downloadError.message}`);
        
        // If direct download fails, redirect to public GCS URL (permanent access)
        const publicUrl = this.cloudStorageService.getPublicUrl(filePath);
        res.redirect(302, publicUrl);
      }
    } catch (error) {
      this.logger.error(`Error serving file ${filePath}: ${error.message}`);
      
      if (error instanceof NotFoundException) {
        throw error;
      }
      
      throw new InternalServerErrorException('Failed to serve file');
    }
  }

  /**
   * 🔒 Validate file path for security
   */
  private validateFilePath(filePath: string): boolean {
    try {
      // Prevent path traversal attacks
      if (filePath.includes('..') || filePath.includes('./') || filePath.includes('\\')) {
        this.logger.warn(`Path traversal attempt blocked: ${filePath}`);
        return false;
      }

      // Check if file is in allowed folder
      const folder = filePath.split('/')[0];
      if (!this.allowedFolders.includes(folder)) {
        this.logger.warn(`Access to unauthorized folder blocked: ${folder}`);
        return false;
      }

      // Additional validations
      if (filePath.length > 500) {
        this.logger.warn(`Overly long file path blocked: ${filePath.length} characters`);
        return false;
      }

      // Check for suspicious file extensions
      const suspiciousExtensions = ['.exe', '.bat', '.cmd', '.scr', '.vbs', '.js', '.jar'];
      const extension = filePath.toLowerCase().split('.').pop();
      if (extension && suspiciousExtensions.includes(`.${extension}`)) {
        this.logger.warn(`Suspicious file extension blocked: ${extension}`);
        return false;
      }

      return true;
    } catch (error) {
      this.logger.error(`Error validating file path: ${error.message}`);
      return false;
    }
  }

  /**
   * 📊 Get file information (for API responses)
   */
  async getFileInfo(filePath: string): Promise<{
    url: string;
    size: number;
    contentType: string;
    lastModified: string;
  }> {
    try {
      if (!this.validateFilePath(filePath)) {
        throw new NotFoundException('File not found or access denied');
      }

      const metadata = await this.cloudStorageService.getFileMetadata(filePath);
      
      return {
        url: `${this.baseUrl}/files/${filePath}`,
        size: parseInt(metadata.size),
        contentType: metadata.contentType,
        lastModified: metadata.updated
      };
    } catch (error) {
      this.logger.error(`Error getting file info: ${error.message}`);
      throw new InternalServerErrorException('Failed to get file information');
    }
  }

  /**
   * 🗂️ List files in a folder (admin only)
   */
  async listFiles(folder: string): Promise<any[]> {
    try {
      if (!this.allowedFolders.includes(folder)) {
        throw new NotFoundException('Folder not found or access denied');
      }

      const files = await this.cloudStorageService.listFiles(folder);
      
      return files.map(file => ({
        name: file.name.replace(`${folder}/`, ''),
        url: `${this.baseUrl}/files/${file.name}`,
        size: file.size,
        contentType: file.contentType,
        lastModified: file.updated
      }));
    } catch (error) {
      this.logger.error(`Error listing files: ${error.message}`);
      throw new InternalServerErrorException('Failed to list files');
    }
  }

  /**
   * 🎨 Generate optimized URLs for different file types
   */
  generateOptimizedUrl(gcsUrl: string, options?: {
    width?: number;
    height?: number;
    quality?: number;
    format?: string;
  }): string {
    const customUrl = this.convertGcsUrlToCustomUrl(gcsUrl);
    
    if (!options) {
      return customUrl;
    }

    // Add optimization parameters (would need image processing service)
    const params = new URLSearchParams();
    if (options.width) params.append('w', options.width.toString());
    if (options.height) params.append('h', options.height.toString());
    if (options.quality) params.append('q', options.quality.toString());
    if (options.format) params.append('f', options.format);
    
    const paramString = params.toString();
    return paramString ? `${customUrl}?${paramString}` : customUrl;
  }

  /**
   * 📱 Generate responsive image URLs
   */
  generateResponsiveUrls(gcsUrl: string): {
    small: string;
    medium: string;
    large: string;
    original: string;
  } {
    const baseUrl = this.convertGcsUrlToCustomUrl(gcsUrl);
    
    return {
      small: this.generateOptimizedUrl(gcsUrl, { width: 300, quality: 80 }),
      medium: this.generateOptimizedUrl(gcsUrl, { width: 600, quality: 85 }),
      large: this.generateOptimizedUrl(gcsUrl, { width: 1200, quality: 90 }),
      original: baseUrl
    };
  }
}
