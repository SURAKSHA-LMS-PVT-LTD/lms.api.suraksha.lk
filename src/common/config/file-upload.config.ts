/**
 * Global file upload security configuration.
 * 
 * OWASP A04:2021 - Insecure Design
 * All file uploads must be validated for type, size, and filename safety.
 */
import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { BadRequestException } from '@nestjs/common';
import * as path from 'path';

/** Maximum file size: 5MB (can be overridden per-route) */
export const DEFAULT_MAX_FILE_SIZE = 5 * 1024 * 1024;

/** Allowed MIME types for image uploads */
export const IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
] as const;

/** Allowed MIME types for document uploads */
export const DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
] as const;

/** All allowed MIME types */
export const ALL_ALLOWED_MIME_TYPES = [
  ...IMAGE_MIME_TYPES,
  ...DOCUMENT_MIME_TYPES,
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
] as const;

/**
 * Sanitize a filename to prevent path traversal and injection.
 * - Removes directory separators
 * - Removes null bytes
 * - Limits to alphanumeric, hyphens, underscores, and dots
 * - Truncates to 255 characters
 */
export function sanitizeFilename(filename: string): string {
  if (!filename) return `file_${Date.now()}`;
  
  return filename
    .replace(/\0/g, '')                    // Remove null bytes
    .replace(/[/\\]/g, '')                 // Remove path separators
    .replace(/\.\./g, '')                  // Remove directory traversal
    .replace(/[^a-zA-Z0-9._-]/g, '_')     // Replace unsafe chars
    .slice(0, 255);                        // Truncate
}

/**
 * Create multer options for image uploads.
 */
export function imageUploadOptions(maxSize = DEFAULT_MAX_FILE_SIZE): MulterOptions {
  return {
    storage: undefined, // Memory storage (default)
    limits: {
      fileSize: maxSize,
      files: 5,
    },
    fileFilter: (_req: any, file: { mimetype: string; originalname: string }, callback: (error: Error | null, acceptFile: boolean) => void) => {
      if (!IMAGE_MIME_TYPES.includes(file.mimetype as any)) {
        return callback(
          new BadRequestException(`Invalid file type: ${file.mimetype}. Allowed: ${IMAGE_MIME_TYPES.join(', ')}`),
          false,
        );
      }
      file.originalname = sanitizeFilename(file.originalname);
      callback(null, true);
    },
  };
}

/**
 * Create multer options for document uploads (PDF, images).
 */
export function documentUploadOptions(maxSize = DEFAULT_MAX_FILE_SIZE): MulterOptions {
  return {
    storage: undefined,
    limits: {
      fileSize: maxSize,
      files: 10,
    },
    fileFilter: (_req: any, file: { mimetype: string; originalname: string }, callback: (error: Error | null, acceptFile: boolean) => void) => {
      if (!ALL_ALLOWED_MIME_TYPES.includes(file.mimetype as any)) {
        return callback(
          new BadRequestException(`Invalid file type: ${file.mimetype}. Allowed: ${ALL_ALLOWED_MIME_TYPES.join(', ')}`),
          false,
        );
      }
      file.originalname = sanitizeFilename(file.originalname);
      callback(null, true);
    },
  };
}
