# Payment System - Enhanced Security & Input Validation Documentation

## Overview

This document outlines the comprehensive security measures, input validation, and sanitization implemented across the payment system to ensure maximum data integrity and protection against common security vulnerabilities.

## 🔒 Security Enhancements

### File Upload Security (2MB Limit)

#### Enhanced Restrictions
- **File Size Limit**: Reduced from 5MB to **2MB** for improved security and performance
- **Allowed File Types**: Only PDF, JPG, JPEG, PNG files accepted
- **MIME Type Validation**: Server-side validation of actual file content vs. declared MIME type
- **File Extension Security**: Blocked double extensions and executable patterns
- **Filename Security**: Protection against path traversal and malicious filename patterns

#### File Upload Validation Chain
```typescript
// 1. MIME Type Check
allowedMimeTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png']

// 2. Extension Validation  
allowedExtensions = ['.pdf', '.jpg', '.jpeg', '.png']

// 3. Malicious Pattern Detection
blockedPatterns = [
  /\.php\./i,    // .php.pdf, .php.jpg
  /\.exe\./i,    // .exe.jpg, .exe.pdf
  /\.js\./i,     // .js.pdf
  /\.bat\./i,    // .bat.jpg
  /\.sh\./i,     // .sh.pdf
  /\.py\./i      // .py.jpg
]

// 4. Filename Character Validation
dangerousChars = [/[<>:"|?*\x00-\x1f]/]

// 5. Length Validation (Max 255 characters)
```

#### Security Headers & Validation
```typescript
// Enhanced file filter configuration
{
  storage: memoryStorage(),
  limits: { 
    fileSize: 2 * 1024 * 1024, // 2MB limit
    files: 1,                   // Single file only
    fieldNameSize: 100,         // Limit field names
    fieldSize: 100 * 1024,      // 100KB field size limit
  },
  fileFilter: enhancedSecurityValidation
}
```

### Input Validation & Sanitization

#### InputValidationService Features
- **SQL Injection Protection**: Pattern-based detection of SQL injection attempts
- **XSS Prevention**: Script tag and dangerous HTML content filtering
- **NoSQL Injection Protection**: MongoDB operator pattern detection
- **Unicode Normalization**: NFKC normalization to prevent unicode attacks
- **Length Validation**: Configurable maximum lengths for different field types
- **Data Type Validation**: Strong typing with transformation and sanitization

#### Validation Patterns

##### SQL Injection Patterns
```typescript
sqlInjectionPatterns = [
  /('|(\\')|(;)|(--)|(\|)|(\*)|(%)|(\+)|(-)|(\?))/gi,
  /(union|select|insert|update|delete|drop|create|alter|exec|execute|script|javascript|vbscript)/gi,
  /(onload|onerror|onclick|onmouseover|onfocus|onblur)/gi,
]
```

##### XSS Prevention Patterns
```typescript
xssPatterns = [
  /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
  /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
  /<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi,
  /javascript:/gi,
  /vbscript:/gi,
  /data:text\/html/gi,
]
```

##### NoSQL Injection Patterns
```typescript
noSqlInjectionPatterns = [
  /\$where/gi, /\$ne/gi, /\$gt/gi, /\$gte/gi, /\$lt/gi, /\$lte/gi,
  /\$regex/gi, /\$or/gi, /\$and/gi, /\$not/gi, /\$nor/gi,
  /\$exists/gi, /\$type/gi, /\$mod/gi, /\$all/gi, /\$size/gi,
]
```

## 📝 Enhanced DTO Validation

### Data Transformation & Sanitization

#### String Fields
```typescript
@IsString()
@Length(3, 100)
@Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
paymentType: string;
```

#### Numeric Fields (Currency)
```typescript
@IsNumber({ maxDecimalPlaces: 2 })
@Min(0.01)
@Max(999999.99)
@Transform(({ value }) => {
  const num = parseFloat(value);
  return isNaN(num) ? value : Math.round(num * 100) / 100;
})
amount: number;
```

#### Date Fields
```typescript
@IsDateString()
@Transform(({ value }) => {
  if (typeof value === 'string') {
    const date = new Date(value);
    if (isNaN(date.getTime())) return value;
    // Prevent future payment dates
    if (date > new Date()) {
      throw new Error('Payment date cannot be in the future');
    }
    return date.toISOString();
  }
  return value;
})
paymentDate: string;
```

#### Bank Details Security
```typescript
@IsString()
@Length(8, 20)
@Matches(/^[0-9]+$/, { message: 'Account number must contain only digits' })
@Transform(({ value }) => typeof value === 'string' ? value.replace(/\D/g, '') : value)
accountNumber?: string;

@IsString()
@Length(11, 11)
@Matches(/^[A-Z]{4}[0-9]{7}$/, { message: 'IFSC code must be in format ABCD0123456' })
@Transform(({ value }) => typeof value === 'string' ? value.toUpperCase().replace(/[^A-Z0-9]/g, '') : value)
ifscCode?: string;
```

### Pagination Security
```typescript
@IsInt()
@Min(1)
@Max(1000)  // Prevent excessive pagination
@Transform(({ value }) => parseInt(value) || 1)
page?: number = 1;

@IsInt()
@Min(1)
@Max(100)   // Limit maximum items per page
@Transform(({ value }) => parseInt(value) || 10)
limit?: number = 10;
```

## 🛡️ Controller Security Enhancements

### Enhanced Validation Pipeline
```typescript
@UsePipes(new ValidationPipe({ 
  transform: true,                           // Enable transformation
  whitelist: true,                           // Remove non-whitelisted properties
  forbidNonWhitelisted: true,               // Throw error for extra properties
  transformOptions: { enableImplicitConversion: true } // Safe type conversion
}))
```

### Parameter Sanitization
```typescript
async createPayment(
  @Param('instituteId', ParseBigIntPipe) instituteId: string,
  @Body() createDto: CreateInstitutePaymentDto,
  @Request() req: any,
) {
  // Validate and sanitize instituteId
  const sanitizedInstituteId = this.inputValidationService.sanitizeId(instituteId);
  
  // Additional DTO validation
  const validatedDto = await this.inputValidationService.validateAndSanitizeDto(
    createDto, 
    CreateInstitutePaymentDto
  );
  
  return this.service.createPayment(sanitizedInstituteId, validatedDto, req.user);
}
```

### File Upload Error Handling
```typescript
try {
  return await this.service.submitPayment(paymentId, dto, file, req.user);
} catch (error) {
  // Handle multer file size errors
  if (error.code === 'LIMIT_FILE_SIZE') {
    throw new BadRequestException({
      success: false,
      message: 'File too large. Maximum size allowed is 2MB',
      error: 'FILE_TOO_LARGE'
    });
  }
  throw error;
}
```

## 🔍 Security Validation Methods

### ID Sanitization
```typescript
sanitizeId(input: string): string {
  if (!input || typeof input !== 'string') {
    throw new BadRequestException('ID parameter is required');
  }

  // Remove non-alphanumeric characters except hyphens and underscores
  const sanitized = input.replace(/[^a-zA-Z0-9\-_]/g, '');
  
  if (sanitized.length === 0 || sanitized.length > 50) {
    throw new BadRequestException('Invalid ID format');
  }

  return sanitized;
}
```

### Phone Number Validation
```typescript
sanitizePhoneNumber(input: string): string {
  if (!input) return '';

  // Remove all non-numeric characters except +
  let sanitized = input.replace(/[^\d+]/g, '');

  if (sanitized.startsWith('+')) {
    // International format validation
    if (sanitized.length < 8 || sanitized.length > 15) {
      throw new BadRequestException('Invalid phone number length');
    }
  } else {
    // Domestic format validation (10 digits)
    if (sanitized.length !== 10) {
      throw new BadRequestException('Phone number must be 10 digits');
    }
  }

  return sanitized;
}
```

### Email Sanitization
```typescript
sanitizeEmail(input: string): string {
  if (!input || typeof input !== 'string') {
    throw new BadRequestException('Email is required');
  }

  const sanitized = input.trim().toLowerCase();
  
  if (!validator.isEmail(sanitized)) {
    throw new BadRequestException('Invalid email format');
  }

  return sanitized;
}
```

## 📊 Validation Limits & Constraints

### Field Length Limits
| Field Type | Minimum | Maximum | Purpose |
|------------|---------|---------|---------|
| Payment Type | 3 chars | 100 chars | Clear identification |
| Description | 10 chars | 1000 chars | Detailed information |
| Notes | 0 chars | 1000 chars | Optional comments |
| Payment Instructions | 0 chars | 2000 chars | Detailed instructions |
| Transaction Reference | 0 chars | 100 chars | Reference tracking |
| Bank Name | 1 char | 100 chars | Institution name |
| Account Holder Name | 1 char | 100 chars | Person identification |

### Numeric Constraints
| Field | Minimum | Maximum | Precision |
|-------|---------|---------|-----------|
| Payment Amount | 0.01 | 999999.99 | 2 decimals |
| Late Fee Amount | 0.00 | 99999.99 | 2 decimals |
| Late Fee Days | 1 day | 365 days | Integer |
| Reminder Days | 1 day | 30 days | Integer |

### Pagination Limits
| Parameter | Minimum | Maximum | Default |
|-----------|---------|---------|---------|
| Page Number | 1 | 1000 | 1 |
| Items per Page | 1 | 100 | 10 |

## 🚨 Error Codes & Messages

### Validation Error Codes
| Error Code | Description | HTTP Status |
|------------|-------------|-------------|
| `INVALID_FILE_TYPE` | Unsupported file format | 400 |
| `INVALID_FILE_EXTENSION` | Blocked file extension | 400 |
| `MALICIOUS_FILE_DETECTED` | Suspicious filename pattern | 400 |
| `FILE_TOO_LARGE` | Exceeds 2MB limit | 413 |
| `FILENAME_TOO_LONG` | Filename over 255 chars | 400 |
| `INVALID_FILENAME_CHARS` | Invalid characters in filename | 400 |
| `MALICIOUS_INPUT_DETECTED` | SQL injection attempt | 400 |
| `XSS_CONTENT_DETECTED` | Cross-site scripting attempt | 400 |
| `NOSQL_INJECTION_DETECTED` | NoSQL injection attempt | 400 |
| `INVALID_NUMBER_FORMAT` | Non-numeric value | 400 |
| `NUMBER_OUT_OF_RANGE` | Value outside allowed range | 400 |
| `INVALID_DATE_FORMAT` | Invalid ISO 8601 date | 400 |
| `INVALID_EMAIL_FORMAT` | Invalid email address | 400 |
| `RATE_LIMIT_EXCEEDED` | Too many requests | 429 |

### Security Response Format
```typescript
{
  success: false,
  message: "User-friendly error message",
  error: "ERROR_CODE",
  details?: ["Additional validation errors"]
}
```

## 🔧 Configuration

### Environment Variables
```env
# File Upload Limits
MAX_FILE_SIZE=2097152  # 2MB in bytes
ALLOWED_FILE_TYPES=pdf,jpg,jpeg,png

# Validation Limits
MAX_STRING_LENGTH=1000
MAX_DESCRIPTION_LENGTH=5000
MAX_NOTES_LENGTH=2000
MAX_AMOUNT_VALUE=999999.99

# Rate Limiting
MAX_REQUESTS_PER_WINDOW=100
RATE_LIMIT_WINDOW_MS=900000  # 15 minutes
```

### Security Headers
```typescript
// Recommended security headers
{
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'"
}
```

## 📋 Testing & Validation

### Security Test Cases
1. **File Upload Security**
   - Test with oversized files (>2MB)
   - Test with malicious file extensions (.php.jpg)
   - Test with executable files disguised as images
   - Test with path traversal filenames (../../evil.txt)

2. **Input Validation**
   - SQL injection attempts in text fields
   - XSS script injection in descriptions
   - NoSQL injection in query parameters
   - Unicode normalization attacks

3. **Data Integrity**
   - Numeric overflow/underflow tests
   - Date validation (future dates, invalid formats)
   - Email format validation
   - Phone number format validation

### Validation Examples

#### Valid Payment Creation
```json
{
  "paymentType": "Monthly Tuition Fee",
  "description": "Mathematics course fee for January 2024",
  "amount": 2500.50,
  "dueDate": "2024-01-31T23:59:59.000Z",
  "targetType": "STUDENTS",
  "priority": "HIGH",
  "bankDetails": {
    "bankName": "State Bank of India",
    "accountNumber": "1234567890123456",
    "ifscCode": "SBIN0001234",
    "accountHolderName": "Institute Account",
    "upiId": "institute@sbi"
  }
}
```

#### Invalid Input Examples (Will be rejected)
```json
{
  "paymentType": "<script>alert('xss')</script>", // XSS attempt
  "description": "'; DROP TABLE payments; --",    // SQL injection
  "amount": "999999999.999",                      // Exceeds max amount
  "dueDate": "invalid-date-format",               // Invalid date
  "bankDetails": {
    "accountNumber": "abc123",                    // Invalid format
    "ifscCode": "INVALID",                        // Wrong IFSC format
  }
}
```

## 🏆 Best Practices

### 1. Defense in Depth
- Multiple layers of validation (client, server, database)
- Comprehensive input sanitization at every entry point
- File content validation beyond extension checking

### 2. Fail Securely
- Default deny policies for file uploads
- Comprehensive error handling without information leakage
- Graceful degradation when validation fails

### 3. Regular Updates
- Keep validation patterns updated with new threat intelligence
- Regular security testing and penetration testing
- Monitor for new attack vectors and update accordingly

### 4. Logging & Monitoring
- Log all validation failures for security monitoring
- Monitor for patterns that might indicate coordinated attacks
- Alert on repeated validation failures from same source

This comprehensive security implementation ensures robust protection against common web application vulnerabilities while maintaining usability and performance.
