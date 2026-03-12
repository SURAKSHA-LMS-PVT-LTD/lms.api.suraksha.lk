import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ConfigService } from '@nestjs/config';

/**
 * Global interceptor to transform relative image URLs to full URLs in all API responses
 * This is more performant than using @AfterLoad() in each entity
 */
@Injectable()
export class UrlTransformInterceptor implements NestInterceptor {
  private readonly baseUrl: string;

  constructor(private readonly configService: ConfigService) {
    // Build provider-aware base URL (mirrors CloudStorageService.getBaseUrl)
    const provider = (this.configService.get<string>('STORAGE_PROVIDER') || 'google').toLowerCase();
    if (provider === 'aws' || provider === 's3') {
      const bucket = this.configService.get<string>('AWS_S3_BUCKET');
      const region = this.configService.get<string>('AWS_REGION', 'us-east-1');
      this.baseUrl = `https://${bucket}.s3.${region}.amazonaws.com`;
    } else if (provider === 'local') {
      this.baseUrl = this.configService.get<string>('LOCAL_STORAGE_BASE_URL', 'http://localhost:3000/uploads');
    } else {
      // GCS
      const bucket = this.configService.get<string>('GCS_BUCKET_NAME') ||
                     this.configService.get<string>('GOOGLE_STORAGE_BUCKET');
      this.baseUrl = `https://storage.googleapis.com/${bucket}`;
    }
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map(data => this.transformUrls(data))
    );
  }

  /**
   * Recursively transform all relative image URLs to full URLs
   */
  private transformUrls(data: any): any {
    if (!data) return data;

    // Skip Date instances to prevent them from being spread into empty objects
    if (data instanceof Date) {
      return data;
    }

    // Handle arrays
    if (Array.isArray(data)) {
      return data.map(item => this.transformUrls(item));
    }

    // Handle objects
    if (typeof data === 'object') {
      const transformed = {};
      
      for (const [key, value] of Object.entries(data)) {
        // Transform image URL fields
        if (this.isImageUrlField(key) && typeof value === 'string') {
          transformed[key] = this.transformUrl(value);
        } else {
          // Recursively transform nested objects/arrays
          transformed[key] = this.transformUrls(value);
        }
      }
      
      return transformed;
    }

    return data;
  }

  /**
   * Check if a field name is an image URL field
   */
  private isImageUrlField(fieldName: string): boolean {
    const imageUrlFields = [
      'imageUrl',
      'image_url',
      'studentImageUrl',
      'student_image_url',
      'logoUrl',
      'logo_url',
      'loadingGifUrl',
      'loading_gif_url',
      'imageUrls', // Array of image URLs
      'image_urls',
      'profileImage',
      'profile_image',
      'avatarUrl',
      'avatar_url',
      'thumbnailUrl',
      'thumbnail_url',
      'photoUrl',
      'photo_url',
      'pictureUrl',
      'picture_url',
      'paymentSlipUrl',
      'payment_slip_url',
      'receiptUrl',
      'receipt_url',
      'receiptFileUrl',
      'receipt_file_url',
      'fileUrl',
      'file_url',
      'attachmentUrl',
      'attachment_url',
      'correctionFileUrl',
      'correction_file_url',
      'teacherCorrectionFileUrl',
      'teacher_correction_file_url',
      'submissionFileUrl',
      'submission_file_url',
      'documentUrl',
      'document_url',
      'imgUrl',
      'img_url',
      'introVideoUrl',
      'intro_video_url',
      'instituteUserImageUrl',
      'institute_user_image_url'
    ];
    
    return imageUrlFields.includes(fieldName);
  }

  /**
   * Transform a single URL from relative to full
   */
  private transformUrl(url: string): string {
    if (!url) return url;
    
    // Already a full URL
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    
    // Transform relative URL to full URL
    if (url.startsWith('/')) {
      return `${this.baseUrl}${url}`;
    }
    
    return `${this.baseUrl}/${url}`;
  }
}
