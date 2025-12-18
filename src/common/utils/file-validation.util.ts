import { BadRequestException } from '@nestjs/common';

export interface FileValidationOptions {
  maxSize?: number; // in bytes
  allowedMimeTypes?: string[];
  allowedExtensions?: string[];
}

export class FileValidationUtil {
  /**
   * Validate image file for subject images
   * Max size: 2MB
   * Allowed types: JPEG, PNG, WebP, GIF
   */
  static validateSubjectImage(file: any): void {
    const options: FileValidationOptions = {
      maxSize: 2 * 1024 * 1024, // 2MB
      allowedMimeTypes: [
        'image/jpeg',
        'image/jpg', 
        'image/png',
        'image/webp',
        'image/gif'
      ],
      allowedExtensions: ['.jpg', '.jpeg', '.png', '.webp', '.gif']
    };

    this.validateFile(file, options);
  }

  /**
   * Generic file validation
   */
  static validateFile(file: any, options: FileValidationOptions): void {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    // Check file size
    if (options.maxSize && file.size > options.maxSize) {
      const maxSizeMB = (options.maxSize / (1024 * 1024)).toFixed(1);
      throw new BadRequestException(`File size exceeds ${maxSizeMB}MB limit`);
    }

    // Check MIME type
    if (options.allowedMimeTypes && !options.allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        `Invalid file type. Allowed types: ${options.allowedMimeTypes.join(', ')}`
      );
    }

    // Check file extension
    if (options.allowedExtensions) {
      const fileExtension = this.getFileExtension(file.originalname);
      if (!options.allowedExtensions.includes(fileExtension.toLowerCase())) {
        throw new BadRequestException(
          `Invalid file extension. Allowed extensions: ${options.allowedExtensions.join(', ')}`
        );
      }
    }
  }

  /**
   * Get file extension from filename
   */
  private static getFileExtension(filename: string): string {
    return filename.substring(filename.lastIndexOf('.'));
  }

  /**
   * Format file size for human reading
   */
  static formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}
