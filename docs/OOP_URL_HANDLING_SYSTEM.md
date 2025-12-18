# OOP-Based URL Handling System

## 📋 Overview

This system provides a **centralized, OOP-based approach** for handling file URLs throughout the application. It follows the **Single Responsibility Principle** and **Dependency Injection** patterns.

---

## 🎯 Design Pattern

### **Pattern**: Service Layer with Dependency Injection
### **Principle**: Single Source of Truth for URL Transformation

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────┐
│           Database (PostgreSQL)                  │
│  Stores: "homework-files/abc-123.pdf"          │
│          (Relative Paths Only)                   │
└──────────────────┬──────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────┐
│          CloudStorageService                     │
│  ┌───────────────────────────────────────────┐ │
│  │ getFullUrl(relativePath: string)          │ │
│  │ ─────────────────────────────────────────  │ │
│  │ • Check if already full URL               │ │
│  │ • If relative, prepend GCS_BASE_URL       │ │
│  │ • Return full URL                         │ │
│  └───────────────────────────────────────────┘ │
└──────────────────┬──────────────────────────────┘
                   │
         ┌─────────┴─────────┐
         ▼                   ▼
┌────────────────┐  ┌────────────────────┐
│  Controllers   │  │  Response DTOs     │
│  Use method    │  │  Transform URLs    │
│  in responses  │  │  before sending    │
└────────────────┘  └────────────────────┘
         │                   │
         └─────────┬─────────┘
                   ▼
         ┌─────────────────┐
         │  API Response   │
         │  Full URLs only │
         └─────────────────┘
```

---

## 🔧 Implementation

### 1. **CloudStorageService.getFullUrl()**

**Location**: `src/common/services/cloud-storage.service.ts`

```typescript
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
 * - Input: "homework-files/abc-123.pdf" 
 *   Output: "https://storage.googleapis.com/bucket/homework-files/abc-123.pdf"
 * - Input: "https://example.com/file.pdf" 
 *   Output: "https://example.com/file.pdf" (unchanged)
 * - Input: "" 
 *   Output: ""
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

  // ✅ If relative path, prepend base URL from environment
  const cleanPath = trimmedPath.startsWith('/') ? trimmedPath.substring(1) : trimmedPath;
  return `${this.baseUrl}/${cleanPath}`;
}
```

---

### 2. **UrlTransformerHelper** (Optional Advanced Usage)

**Location**: `src/common/helpers/url-transformer.helper.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { CloudStorageService } from '../services/cloud-storage.service';

@Injectable()
export class UrlTransformerHelper {
  constructor(private readonly cloudStorageService: CloudStorageService) {}

  /**
   * Transform a single URL
   */
  transformToFullUrl(relativePath?: string | null): string {
    if (!relativePath) {
      return '';
    }
    return this.cloudStorageService.getFullUrl(relativePath);
  }

  /**
   * Transform an array of URLs
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
   * Transform multiple URL fields in an object
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
}
```

---

## 📝 Usage Examples

### **Example 1: Controller Response**

```typescript
import { CloudStorageService } from '@common/services/cloud-storage.service';

@Controller('homework-submissions')
export class HomeworkSubmissionController {
  constructor(
    private readonly homeworkService: HomeworkService,
    private readonly cloudStorageService: CloudStorageService
  ) {}

  @Post(':homeworkId/submit')
  async submitHomework(
    @Param('homeworkId') homeworkId: string,
    @Body() body: { fileUrl: string }
  ) {
    // Store relative path in database
    const submission = await this.homeworkService.createSubmission({
      homeworkId,
      fileUrl: body.fileUrl  // e.g., "homework-files/abc-123.pdf"
    });

    // ✅ Transform to full URL for API response
    const publicUrl = this.cloudStorageService.getFullUrl(body.fileUrl);

    return {
      success: true,
      data: {
        submissionId: submission.id,
        publicUrl: publicUrl  // "https://storage.googleapis.com/bucket/homework-files/abc-123.pdf"
      }
    };
  }
}
```

---

### **Example 2: Response DTO**

```typescript
import { CloudStorageService } from '@common/services/cloud-storage.service';

export class HomeworkSubmissionResponseDto {
  id: string;
  fileUrl: string;
  teacherCorrectionFileUrl: string;

  static fromEntity(
    entity: HomeworkSubmission, 
    cloudStorageService: CloudStorageService
  ): HomeworkSubmissionResponseDto {
    const dto = new HomeworkSubmissionResponseDto();
    dto.id = entity.id;
    
    // ✅ Transform relative paths to full URLs
    dto.fileUrl = cloudStorageService.getFullUrl(entity.fileUrl);
    dto.teacherCorrectionFileUrl = cloudStorageService.getFullUrl(entity.teacherCorrectionFileUrl);
    
    return dto;
  }
}
```

---

### **Example 3: Service Layer**

```typescript
import { CloudStorageService } from '@common/services/cloud-storage.service';

@Injectable()
export class HomeworkSubmissionService {
  constructor(
    private readonly submissionRepository: Repository<HomeworkSubmission>,
    private readonly cloudStorageService: CloudStorageService
  ) {}

  async findAll(): Promise<HomeworkSubmissionResponseDto[]> {
    const submissions = await this.submissionRepository.find();
    
    // ✅ Transform URLs in service layer
    return submissions.map(submission => 
      HomeworkSubmissionResponseDto.fromEntity(submission, this.cloudStorageService)
    );
  }
}
```

---

### **Example 4: Using UrlTransformerHelper**

```typescript
import { UrlTransformerHelper } from '@common/helpers/url-transformer.helper';

@Injectable()
export class PaymentService {
  constructor(private readonly urlTransformer: UrlTransformerHelper) {}

  async getPaymentDetails(paymentId: string) {
    const payment = await this.paymentRepository.findOne({ where: { id: paymentId } });

    // ✅ Transform single field
    return {
      ...payment,
      receiptUrl: this.urlTransformer.transformToFullUrl(payment.receiptUrl)
    };
  }

  async getPayments() {
    const payments = await this.paymentRepository.find();

    // ✅ Transform multiple objects at once
    return this.urlTransformer.transformBatch(payments, ['receiptUrl', 'documentUrl']);
  }
}
```

---

## 🔄 Data Flow

### **Upload Flow**
1. **Frontend** → POST `/upload/generate-signed-url`
2. **Backend** → Return signed URL
3. **Frontend** → PUT to Google Cloud Storage
4. **Frontend** → POST `/upload/verify-and-publish`
5. **Backend** → Return **relative path**: `"homework-files/abc-123.pdf"`
6. **Frontend** → POST to API with relative path
7. **Backend** → Store **relative path** in database

### **Retrieval Flow**
1. **Frontend** → GET `/homework-submissions/:id`
2. **Backend** → Read from database: `"homework-files/abc-123.pdf"`
3. **Service** → Call `cloudStorageService.getFullUrl()`
4. **CloudStorageService** → Return `"https://storage.googleapis.com/bucket/homework-files/abc-123.pdf"`
5. **Backend** → Send full URL in response
6. **Frontend** → Display/download using full URL

---

## ✅ Benefits

### **1. Single Source of Truth**
- All URL transformations happen in one place (`CloudStorageService.getFullUrl()`)
- Easy to update logic (e.g., switch from GCS to S3)

### **2. Database Flexibility**
- Database stores relative paths
- Can change storage provider without database migration
- Can support multiple storage providers

### **3. Backwards Compatibility**
- Method checks if URL is already full before transforming
- Supports gradual migration from full URLs to relative paths

### **4. OOP Principles**
- **Single Responsibility**: CloudStorageService handles URL logic
- **Dependency Injection**: Services inject CloudStorageService
- **Open/Closed**: Easy to extend without modifying existing code

### **5. Testability**
- Easy to mock CloudStorageService in tests
- Can test URL transformation logic in isolation

---

## 🌍 Environment Configuration

```env
# Google Cloud Storage
GCS_BUCKET_NAME=suraksha-lms
GCS_PROJECT_ID=your-project-id
GCS_BASE_URL=https://storage.googleapis.com/suraksha-lms

# Or use public URL
GCS_PUBLIC_BASE_URL=https://storage.googleapis.com/suraksha-lms
```

---

## 🎯 Where to Use

### **✅ Always Transform URLs:**
- API responses (controllers)
- Response DTOs
- Email/SMS templates
- Notification messages
- Frontend display

### **❌ Never Transform:**
- Database inserts/updates (store relative paths)
- Internal service-to-service calls
- File existence checks
- File deletion operations

---

## 📊 Complete Example: Homework Submission Flow

### **1. Database Schema**
```sql
CREATE TABLE homework_submissions (
  id VARCHAR PRIMARY KEY,
  homework_id VARCHAR NOT NULL,
  student_id VARCHAR NOT NULL,
  file_url VARCHAR(500),  -- Stores: "homework-files/abc-123.pdf"
  teacher_correction_file_url VARCHAR(500),  -- Stores: "corrections/xyz-456.pdf"
  created_at TIMESTAMP DEFAULT NOW()
);
```

### **2. Controller**
```typescript
@Post(':homeworkId/submit')
async submitHomework(@Body() body: { fileUrl: string }) {
  // Store relative path
  const submission = await this.service.create({
    fileUrl: body.fileUrl  // "homework-files/abc-123.pdf"
  });

  // ✅ Transform for response
  return {
    publicUrl: this.cloudStorageService.getFullUrl(body.fileUrl)
    // Returns: "https://storage.googleapis.com/bucket/homework-files/abc-123.pdf"
  };
}
```

### **3. Service**
```typescript
async findAll() {
  const submissions = await this.repository.find();
  
  // ✅ Transform in service layer
  return submissions.map(s => ({
    ...s,
    fileUrl: this.cloudStorageService.getFullUrl(s.fileUrl),
    teacherCorrectionFileUrl: this.cloudStorageService.getFullUrl(s.teacherCorrectionFileUrl)
  }));
}
```

### **4. Response DTO**
```typescript
static fromEntity(entity, cloudStorageService) {
  return {
    id: entity.id,
    fileUrl: cloudStorageService.getFullUrl(entity.fileUrl),
    teacherCorrectionFileUrl: cloudStorageService.getFullUrl(entity.teacherCorrectionFileUrl)
  };
}
```

---

## 🔍 Testing

### **Unit Test Example**
```typescript
describe('CloudStorageService.getFullUrl', () => {
  it('should return empty string for empty input', () => {
    expect(service.getFullUrl('')).toBe('');
  });

  it('should return full URL unchanged', () => {
    const fullUrl = 'https://example.com/file.pdf';
    expect(service.getFullUrl(fullUrl)).toBe(fullUrl);
  });

  it('should prepend base URL for relative path', () => {
    const relativePath = 'homework-files/abc-123.pdf';
    const expected = 'https://storage.googleapis.com/bucket/homework-files/abc-123.pdf';
    expect(service.getFullUrl(relativePath)).toBe(expected);
  });
});
```

---

## 📚 Related Modules

- `CloudStorageService` - Core URL transformation logic
- `UrlTransformerHelper` - Advanced batch transformations
- `CommonModule` - Provides global access to helpers
- All Response DTOs - Use transformation methods

---

## 🚀 Migration Guide

### **Migrating Existing Code**

**Before:**
```typescript
return {
  fileUrl: entity.fileUrl  // Returns relative path
};
```

**After:**
```typescript
return {
  fileUrl: this.cloudStorageService.getFullUrl(entity.fileUrl)  // Returns full URL
};
```

---

## 🎓 Summary

**Key Principle**: 
> **Store relative paths, return full URLs**

**Implementation**: 
> Use `cloudStorageService.getFullUrl()` in all response layers

**Benefits**: 
> Centralized, testable, maintainable, flexible
