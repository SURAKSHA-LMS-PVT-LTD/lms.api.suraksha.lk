import { Injectable } from '@nestjs/common';
import { CloudStorageService } from '../services/cloud-storage.service';

/**
 * 🎯 URL Transformer Helper
 * 
 * OOP Design Pattern: Decorator/Transformer Pattern
 * Single Responsibility: Transform file URLs between relative and full formats
 * 
 * Purpose:
 * - Centralized URL transformation logic across all modules
 * - Consistent handling of relative paths vs full URLs
 * - Easy to test and maintain
 * 
 * Usage in Response DTOs:
 * ```typescript
 * import { UrlTransformerHelper } from '@common/helpers/url-transformer.helper';
 * 
 * constructor(private readonly urlTransformer: UrlTransformerHelper) {}
 * 
 * static fromEntity(entity: Entity, urlTransformer: UrlTransformerHelper) {
 *   return {
 *     ...entity,
 *     fileUrl: urlTransformer.transformToFullUrl(entity.fileUrl),
 *     imageUrl: urlTransformer.transformToFullUrl(entity.imageUrl)
 *   };
 * }
 * ```
 */
@Injectable()
export class UrlTransformerHelper {
  constructor(private readonly cloudStorageService: CloudStorageService) {}

  /**
   * 🔄 Transform a single URL
   * 
   * Behavior:
   * - If already full URL (http/https) → Return as-is
   * - If relative path → Convert to full URL using storage base URL
   * - If empty/null/undefined → Return empty string
   * 
   * @param relativePath - Relative path or full URL
   * @returns Full URL or empty string
   */
  transformToFullUrl(relativePath?: string | null): string {
    if (!relativePath) {
      return '';
    }

    return this.cloudStorageService.getFullUrl(relativePath);
  }

  /**
   * 🔄 Transform an array of URLs
   * 
   * @param relativePaths - Array of relative paths or full URLs
   * @returns Array of full URLs (empty strings filtered out)
   */
  transformArrayToFullUrls(relativePaths?: string[] | null): string[] {
    if (!relativePaths || !Array.isArray(relativePaths)) {
      return [];
    }

    return relativePaths
      .map(path => this.transformToFullUrl(path))
      .filter(url => url.length > 0);
  }

  /**
   * 🔄 Transform multiple URL fields in an object
   * 
   * Useful for transforming DTOs with multiple URL fields
   * 
   * @param data - Object containing URL fields
   * @param urlFields - Array of field names that contain URLs
   * @returns New object with transformed URLs
   */
  transformObject<T extends Record<string, any>>(
    data: T,
    urlFields: (keyof T)[]
  ): T {
    if (!data) {
      return data;
    }

    const transformed = { ...data };

    for (const field of urlFields) {
      const value = data[field];
      
      if (typeof value === 'string') {
        transformed[field] = this.transformToFullUrl(value) as any;
      } else if (Array.isArray(value)) {
        transformed[field] = this.transformArrayToFullUrls(value) as any;
      }
    }

    return transformed;
  }

  /**
   * 🔄 Batch transform multiple objects
   * 
   * @param dataArray - Array of objects
   * @param urlFields - Array of field names that contain URLs
   * @returns Array of transformed objects
   */
  transformBatch<T extends Record<string, any>>(
    dataArray: T[],
    urlFields: (keyof T)[]
  ): T[] {
    if (!dataArray || !Array.isArray(dataArray)) {
      return [];
    }

    return dataArray.map(data => this.transformObject(data, urlFields));
  }
}
