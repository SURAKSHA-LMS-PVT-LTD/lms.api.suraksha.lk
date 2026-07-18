    # 🏫 Institute Admin Update Capabilities - Complete Guide

    ## 📋 Overview

    **YES**, Institute Admins **CAN** update institute data according to the current implementation. This document covers all update capabilities, file upload workflows with signed URLs, and implementation details.

    ---

    ## 🔐 Access Control Summary

    ### Who Can Update Institute Data?

    | User Type | Update Institute | Notes |
    |-----------|-----------------|-------|
    | **SUPERADMIN** | ✅ ALL institutes | Full global access |
    | **INSTITUTE_ADMIN** | ✅ OWN institute only | Scoped to their assigned institute(s) |
    | **TEACHER** | ❌ No | Cannot update institute data |
    | **STUDENT** | ❌ No | Cannot update institute data |

    **Implementation:**
    ```typescript
    @Patch(':id')
    @UseGuards(FlexibleAccessGuard)
    @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
    async update(@Param('id') id: string, @Body() updateDto: UpdateInstituteDto)
    ```

    📍 Location: [institute.controller.ts](src/modules/institute/institute.controller.ts#L152-L192)

    ---

    ## 📝 What Can Be Updated?

    ### 1. Basic Information

    ```typescript
    {
    "name": "Cambridge International School",
    "shortName": "CIS",
    "code": "CIS0012",
    "email": "admin@cambridge-school.edu",
    "phone": "+94-71-234-5678",
    "address": "123 Education Street"
    }
    ```

    **Validation Rules:**
    - **name**: Max 255 characters
    - **shortName**: Max 50 characters
    - **code**: 3-50 chars, uppercase letters/numbers/hyphens/underscores only
    - **email**: Valid email format (checked for conflicts)
    - **phone**: Max 20 characters

    ### 2. Location Details

    ```typescript
    {
    "city": "Colombo",
    "state": "Western Province",
    "country": "SRI_LANKA",        // Enum: Country
    "district": "COLOMBO",         // Enum: District
    "province": "WESTERN",         // Enum: Province
    "pinCode": "10001"
    }
    ```

    ### 3. Branding & Visual Identity

    ```typescript
    {
    "logoUrl": "institute-images/logo-uuid.png",
    "loadingGifUrl": "institute-images/loading-uuid.gif",
    "imageUrl": "institute-images/main-uuid.jpg",
    "imageUrls": [
        "institute-images/gallery1-uuid.jpg",
        "institute-images/gallery2-uuid.png"
    ],
    "primaryColorCode": "#1976D2",
    "secondaryColorCode": "#FFC107"
    }
    ```

    **Image URL Requirements:**
    - ✅ Must be **relative paths** from cloud storage
    - ✅ Obtained from `/upload/verify-and-publish` endpoint
    - ✅ Format: `institute-images/filename-uuid.ext`
    - ❌ NOT full public URLs
    - ❌ NOT external URLs

    **Color Code Requirements:**
    - ✅ Valid hex format: `#RRGGBB`
    - ✅ Example: `#1976D2`
    - ❌ No shorthand: `#abc`

    ### 4. Institute Information

    ```typescript
    {
    "vision": "To be a leading educational institution...",
    "mission": "To provide quality education...",
    "description": "Optional description"
    }
    ```

    ### 5. Online Presence

    ```typescript
    {
    "websiteUrl": "https://cambridge-school.edu",
    "facebookPageUrl": "https://facebook.com/cambridge-school",
    "youtubeChannelUrl": "https://youtube.com/c/cambridge-school"
    }
    ```

    **External URL Requirements:**
    - ✅ Full URLs with `https://` or `http://`
    - ✅ Valid URL format
    - ✅ Max 255 characters

    ### 6. Status Management

    ```typescript
    {
    "isActive": true,
    "isDefault": false
    }
    ```

    📍 DTO Definition: [update-institute.dto.ts](src/modules/institute/dto/update-institute.dto.ts)

    ---

    ## 🔄 Update Endpoint

    ### Endpoint Details

    ```http
    PATCH /institutes/:id
    Authorization: Bearer <access_token>
    Content-Type: application/json
    ```

    **Required Headers:**
    - `Authorization`: Bearer token (Institute Admin or SUPERADMIN)

    **Path Parameters:**
    - `id`: Institute ID (string/bigint)

    **Access Control:**
    - Institute Admins can ONLY update their OWN institute
    - SUPERADMIN can update ANY institute

    ### Example Request

    ```typescript
    const updateInstitute = async (instituteId: string, updates: UpdateInstituteDto) => {
    const response = await fetch(`https://api.example.com/institutes/${instituteId}`, {
        method: 'PATCH',
        headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
        },
        body: JSON.stringify(updates)
    });
    
    return response.json();
    };

    // Usage
    await updateInstitute('123', {
    name: 'Updated School Name',
    primaryColorCode: '#FF5722',
    logoUrl: 'institute-images/new-logo-abc123.png'
    });
    ```

    ### Success Response (200 OK)

    ```json
    {
    "id": "123",
    "name": "Updated School Name",
    "code": "CIS0012",
    "email": "admin@cambridge-school.edu",
    "logoUrl": "https://storage.cloud.com/bucket/institute-images/new-logo-abc123.png",
    "imageUrl": "https://storage.cloud.com/bucket/institute-images/main-uuid.jpg",
    "primaryColorCode": "#FF5722",
    "secondaryColorCode": "#FFC107",
    "isActive": true,
    "createdAt": "2025-01-15T10:00:00.000Z",
    "updatedAt": "2026-02-13T14:30:00.000Z"
    }
    ```

    **Note:** Response URLs are automatically transformed to **full public URLs** by the service layer.

    ### Error Responses

    **403 Forbidden - Institute Admin accessing wrong institute:**
    ```json
    {
    "statusCode": 403,
    "message": "Access denied: Institute admin can only update their own institute",
    "error": "Forbidden"
    }
    ```

    **404 Not Found:**
    ```json
    {
    "statusCode": 404,
    "message": "Institute with ID 123 not found",
    "error": "Not Found"
    }
    ```

    **409 Conflict - Email already exists:**
    ```json
    {
    "statusCode": 409,
    "message": "Institute with this email already exists",
    "error": "Conflict"
    }
    ```

    📍 Controller: [institute.controller.ts](src/modules/institute/institute.controller.ts#L152-L192)
    📍 Service: [institute.service.ts](src/modules/institute/institute.service.ts#L199-L247)

    ---

    ## 📤 File Upload Workflow with Signed URLs

    ### Overview

    The system uses a **secure 3-step workflow** for file uploads:

    ```
    Step 1: Generate signed URL (backend)
    ↓
    Step 2: Upload file directly to cloud storage (client → cloud)
    ↓
    Step 3: Verify and publish (backend)
    ```

    **Benefits:**
    - ✅ No bandwidth usage on backend server
    - ✅ Faster uploads (direct to cloud)
    - ✅ Better scalability
    - ✅ Cost-effective (10MB file: ~20KB API calls vs 20MB through backend)
    - ✅ Built-in security (signed URLs, content-type validation, size limits)

    ---

    ## 🔐 STEP 1: Generate Signed Upload URL

    ### Endpoint

    ```http
    POST /upload/generate-signed-url
    Authorization: Bearer <access_token>
    Content-Type: application/json
    ```

    ### Request Body

    ```json
    {
    "folder": "institute-images",
    "fileName": "logo.png",
    "contentType": "image/png",
    "fileSize": 2048576
    }
    ```

    **Parameters:**

    | Field | Type | Required | Description | Example |
    |-------|------|----------|-------------|---------|
    | `folder` | string | ✅ | Target folder | `"institute-images"` |
    | `fileName` | string | ✅ | Original filename | `"logo.png"` |
    | `contentType` | string | ✅ | MIME type | `"image/png"` |
    | `fileSize` | number | ✅ | Size in bytes | `2048576` |

    **Supported Folders:**
    - `institute-images` - Institute logos, banners, gallery images
    - `profile-images` - User profile pictures
    - `student-images` - Student photos
    - `institute-user-images` - Institute-specific user images
    - `payment-slips` - Payment receipts
    - `homework-references` - Homework attachments

    **Supported Image Types:**
    - `image/jpeg`, `image/jpg`
    - `image/png`
    - `image/gif`
    - `image/webp`
    - `image/svg+xml`

    **File Size Limits:**

    | Folder Type | Max Size | Notes |
    |-------------|----------|-------|
    | `institute-images` | 5 MB | Logos, banners |
    | `profile-images` | 5 MB | Profile photos |
    | `student-images` | 5 MB | Student photos |
    | Other folders | 10 MB | General uploads |

    ### Success Response (200 OK)

    ```json
    {
    "success": true,
    "message": "SHORT-LIVED private upload URL generated (expires in 10 minutes)",
    "data": {
        "uploadUrl": "https://storage.googleapis.com/bucket/institute-images/logo-abc123.png?X-Goog-Signature=...",
        "relativePath": "institute-images/logo-abc123.png",
        "expiresAt": "2026-02-13T15:00:00.000Z",
        "maxFileSize": 5242880,
        "contentType": "image/png"
    },
    "instructions": {
        "step1": "Upload file to uploadUrl using PUT request",
        "step2": "Send relativePath to /upload/verify-and-publish endpoint",
        "step3": "Backend verifies and returns long-term public URL",
        "uploadMethod": "PUT",
        "uploadUrl": "https://storage.googleapis.com/...",
        "headers": {
        "Content-Type": "image/png",
        "x-goog-content-length-range": "0,5242880"
        },
        "maxFileSize": 5242880,
        "expiresIn": "10 minutes",
        "important": "File will be PRIVATE until verified by backend. MUST include all headers in PUT request."
    }
    }
    ```

    ### Error Responses

    **400 Bad Request - Invalid file type:**
    ```json
    {
    "statusCode": 400,
    "message": "File type image/bmp not allowed for folder institute-images. Allowed: image/jpeg, image/png, image/gif, image/webp, image/svg+xml",
    "error": "Bad Request"
    }
    ```

    **400 Bad Request - File too large:**
    ```json
    {
    "statusCode": 400,
    "message": "File size 10485760 exceeds maximum 5242880 for folder institute-images",
    "error": "Bad Request"
    }
    ```

    📍 Implementation: [upload.controller.ts](src/common/controllers/upload.controller.ts#L297-L573)

    ---

    ## ☁️ STEP 2: Upload File to Cloud Storage

    ### Upload Details

    **Method:** `PUT`  
    **URL:** Use `uploadUrl` from Step 1 response  
    **Headers:** Include ALL headers from `instructions.headers`

    ### Required Headers

    ```typescript
    {
    'Content-Type': 'image/png',                    // MUST match original contentType
    'x-goog-content-length-range': '0,5242880'     // Enforces size limit
    }
    ```

    ### JavaScript Example

    ```javascript
    const uploadFile = async (file, signedUrlData) => {
    const { uploadUrl, relativePath } = signedUrlData.data;
    const { headers } = signedUrlData.instructions;
    
    const response = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
        'Content-Type': headers['Content-Type'],
        'x-goog-content-length-range': headers['x-goog-content-length-range']
        },
        body: file
    });
    
    if (!response.ok) {
        throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
    }
    
    return relativePath; // Use this in Step 3
    };
    ```

    ### TypeScript Example with Progress

    ```typescript
    const uploadFileWithProgress = async (
    file: File,
    signedUrlData: SignedUrlResponse,
    onProgress?: (progress: number) => void
    ): Promise<string> => {
    const { uploadUrl, relativePath } = signedUrlData.data;
    const { headers } = signedUrlData.instructions;
    
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        
        // Track upload progress
        xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
            const progress = (e.loaded / e.total) * 100;
            onProgress?.(progress);
        }
        });
        
        xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
            resolve(relativePath);
        } else {
            reject(new Error(`Upload failed: ${xhr.status}`));
        }
        });
        
        xhr.addEventListener('error', () => {
        reject(new Error('Upload failed'));
        });
        
        xhr.open('PUT', uploadUrl);
        xhr.setRequestHeader('Content-Type', headers['Content-Type']);
        if (headers['x-goog-content-length-range']) {
        xhr.setRequestHeader('x-goog-content-length-range', headers['x-goog-content-length-range']);
        }
        
        xhr.send(file);
    });
    };
    ```

    ### React Example

    ```tsx
    import React, { useState } from 'react';
    import axios from 'axios';

    const InstituteLogoUpload: React.FC = () => {
    const [uploading, setUploading] = useState(false);
    const [progress, setProgress] = useState(0);
    
    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        
        try {
        setUploading(true);
        
        // Step 1: Generate signed URL
        const { data: signedUrlData } = await axios.post('/upload/generate-signed-url', {
            folder: 'institute-images',
            fileName: file.name,
            contentType: file.type,
            fileSize: file.size
        }, {
            headers: {
            Authorization: `Bearer ${localStorage.getItem('accessToken')}`
            }
        });
        
        // Step 2: Upload to cloud
        const { uploadUrl, relativePath } = signedUrlData.data;
        const { headers } = signedUrlData.instructions;
        
        await axios.put(uploadUrl, file, {
            headers: {
            'Content-Type': headers['Content-Type'],
            'x-goog-content-length-range': headers['x-goog-content-length-range']
            },
            onUploadProgress: (progressEvent) => {
            const percentCompleted = Math.round(
                (progressEvent.loaded * 100) / (progressEvent.total || 1)
            );
            setProgress(percentCompleted);
            }
        });
        
        // Step 3: Verify and publish
        const { data: verifiedData } = await axios.post('/upload/verify-and-publish', {
            relativePath
        }, {
            headers: {
            Authorization: `Bearer ${localStorage.getItem('accessToken')}`
            }
        });
        
        console.log('Public URL:', verifiedData.publicUrl);
        console.log('Use this for institute update:', verifiedData.relativePath);
        
        // Now update institute with the relativePath
        // ...
        
        } catch (error) {
        console.error('Upload failed:', error);
        } finally {
        setUploading(false);
        setProgress(0);
        }
    };
    
    return (
        <div>
        <input 
            type="file" 
            accept="image/*" 
            onChange={handleFileUpload}
            disabled={uploading}
        />
        {uploading && <div>Uploading: {progress}%</div>}
        </div>
    );
    };
    ```

    ### Important Notes

    ⚠️ **Security:**
    - URL expires in **10 minutes**
    - Single-use URL (expires after successful upload)
    - Content-Type validation enforced
    - File size limit enforced in signature
    - File is **PRIVATE** until verified

    ⚠️ **Common Errors:**
    - **403 Forbidden**: URL expired or Content-Type mismatch
    - **400 Bad Request**: File exceeds size limit
    - **Network Error**: Check CORS settings

    📍 Implementation: Direct to cloud storage (Google Cloud Storage / AWS S3)

    ---

    ## ✅ STEP 3: Verify and Publish

    ### Endpoint

    ```http
    POST /upload/verify-and-publish
    Authorization: Bearer <access_token>
    Content-Type: application/json
    ```

    ### Request Body

    ```json
    {
    "relativePath": "institute-images/logo-abc123.png"
    }
    ```

    **Parameters:**

    | Field | Type | Required | Description |
    |-------|------|----------|-------------|
    | `relativePath` | string | ✅ | Path returned from Step 1 |

    ### Success Response (200 OK)

    ```json
    {
    "success": true,
    "message": "File verified and made publicly accessible",
    "publicUrl": "https://storage.googleapis.com/bucket/institute-images/logo-abc123.png",
    "relativePath": "institute-images/logo-abc123.png",
    "fileName": "logo-abc123.png",
    "fileSize": 2048576,
    "contentType": "image/png"
    }
    ```

    **What Happens:**
    1. ✅ Backend verifies file exists in cloud storage
    2. ✅ Makes file publicly accessible (removes private restriction)
    3. ✅ Returns both `publicUrl` (for display) and `relativePath` (for database)

    ### Error Responses

    **404 Not Found - File doesn't exist:**
    ```json
    {
    "statusCode": 404,
    "message": "File not found in cloud storage: institute-images/logo-abc123.png",
    "error": "Not Found"
    }
    ```

    **400 Bad Request - Invalid path:**
    ```json
    {
    "statusCode": 400,
    "message": "Invalid relative path format",
    "error": "Bad Request"
    }
    ```

    ### What to Store in Database

    **✅ Store:** `relativePath` from response
    ```json
    {
    "logoUrl": "institute-images/logo-abc123.png"
    }
    ```

    **❌ DON'T Store:** Full `publicUrl`
    ```json
    {
    // ❌ Wrong
    "logoUrl": "https://storage.googleapis.com/bucket/institute-images/logo-abc123.png"
    }
    ```

    **Why?**
    - Backend automatically converts relative paths to full URLs in responses
    - Allows changing storage provider without database migration
    - Keeps URLs consistent across environments

    📍 Implementation: [upload.controller.ts](src/common/controllers/upload.controller.ts#L575-L669)

    ---

    ## 🔄 Complete Update Workflow with Image Upload

    ### Full Example: Update Institute Logo

    ```typescript
    interface InstituteUpdateService {
    async updateInstituteLogo(
        instituteId: string,
        logoFile: File,
        accessToken: string
    ): Promise<{ success: boolean; institute: any }> {
        
        try {
        // STEP 1: Generate signed upload URL
        const signedUrlResponse = await fetch('/upload/generate-signed-url', {
            method: 'POST',
            headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
            },
            body: JSON.stringify({
            folder: 'institute-images',
            fileName: logoFile.name,
            contentType: logoFile.type,
            fileSize: logoFile.size
            })
        });
        
        if (!signedUrlResponse.ok) {
            throw new Error('Failed to generate upload URL');
        }
        
        const signedUrlData = await signedUrlResponse.json();
        const { uploadUrl, relativePath } = signedUrlData.data;
        const { headers } = signedUrlData.instructions;
        
        // STEP 2: Upload file directly to cloud storage
        const uploadResponse = await fetch(uploadUrl, {
            method: 'PUT',
            headers: {
            'Content-Type': headers['Content-Type'],
            'x-goog-content-length-range': headers['x-goog-content-length-range']
            },
            body: logoFile
        });
        
        if (!uploadResponse.ok) {
            throw new Error(`File upload failed: ${uploadResponse.status}`);
        }
        
        // STEP 3: Verify and publish
        const verifyResponse = await fetch('/upload/verify-and-publish', {
            method: 'POST',
            headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
            },
            body: JSON.stringify({ relativePath })
        });
        
        if (!verifyResponse.ok) {
            throw new Error('File verification failed');
        }
        
        const verifyData = await verifyResponse.json();
        
        // STEP 4: Update institute with new logo
        const updateResponse = await fetch(`/institutes/${instituteId}`, {
            method: 'PATCH',
            headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
            },
            body: JSON.stringify({
            logoUrl: verifyData.relativePath  // ✅ Use relativePath, not publicUrl
            })
        });
        
        if (!updateResponse.ok) {
            throw new Error('Institute update failed');
        }
        
        const institute = await updateResponse.json();
        
        return {
            success: true,
            institute
        };
        
        } catch (error) {
        console.error('Update failed:', error);
        throw error;
        }
    }
    }

    // Usage
    const service = new InstituteUpdateService();
    await service.updateInstituteLogo(
    '123',          // instituteId
    logoFile,       // File object
    accessToken     // Bearer token
    );
    ```

    ### Error Handling

    ```typescript
    const handleUploadError = (error: any): string => {
    if (error.response) {
        const { status, data } = error.response;
        
        switch (status) {
        case 400:
            return `Invalid request: ${data.message}`;
        case 401:
            return 'Authentication required. Please login again.';
        case 403:
            return 'Access denied. You can only update your own institute.';
        case 404:
            return 'File not found. Upload may have failed.';
        case 409:
            return 'Email already exists for another institute.';
        case 413:
            return 'File too large. Maximum size is 5MB.';
        default:
            return `Upload failed: ${data.message || 'Unknown error'}`;
        }
    }
    
    return 'Network error. Please check your connection.';
    };
    ```

    ---

    ## 🎯 Other Admin Capabilities

    ### 1. Activate Institute

    ```http
    PATCH /institutes/:id/activate
    Authorization: Bearer <access_token>
    ```

    **Access:** SUPERADMIN or Institute Admin (own institute)

    **Response:**
    ```json
    {
    "id": "123",
    "name": "Cambridge International School",
    "isActive": true,
    "updatedAt": "2026-02-13T14:30:00.000Z"
    }
    ```

    ### 2. Deactivate Institute

    ```http
    PATCH /institutes/:id/deactivate
    Authorization: Bearer <access_token>
    ```

    **Access:** SUPERADMIN or Institute Admin (own institute)

    **Response:**
    ```json
    {
    "id": "123",
    "name": "Cambridge International School",
    "isActive": false,
    "updatedAt": "2026-02-13T14:30:00.000Z"
    }
    ```

    ### 3. Assign Teacher to Class

    ```http
    PUT /institutes/:instituteId/classes/:classId/teacher/:teacherId
    Authorization: Bearer <access_token>
    ```

    **Access:** SUPERADMIN or Institute Admin (own institute)

    **Response:**
    ```json
    {
    "success": true,
    "message": "Teacher successfully assigned to class",
    "data": {
        "classId": "10",
        "className": "Grade 10 Science",
        "classCode": "G10SCI",
        "classTeacherId": "456",
        "teacherInfo": {
        "id": "456",
        "email": "teacher@school.edu",
        "firstName": "John",
        "lastName": "Doe"
        }
    }
    }
    ```

    📍 Implementation: [institute.controller.ts](src/modules/institute/institute.controller.ts#L261-L422)

    ---

    ## 🔒 Security Features

    ### Institute Access Validation

    ```typescript
    // Service layer validates institute admin can only update own institute
    async update(id: string, updateDto: UpdateInstituteDto): Promise<InstituteEntity> {
    const institute = await this.findOne(id);
    
    // Guard ensures institute admin has access to this institute
    // If user is Institute Admin but not assigned to this institute → 403 Forbidden
    
    // Check email conflicts if email is being updated
    if (updateDto.email && updateDto.email !== institute.email) {
        const existingInstitute = await this.instituteRepository.findOne({
        where: { email: updateDto.email }
        });
        
        if (existingInstitute && existingInstitute.id !== id) {
        throw new ConflictException('Institute with this email already exists');
        }
    }
    
    // Update institute data...
    }
    ```

    ### Signed URL Security

    1. **Short-lived URLs** (10 minutes expiry)
    2. **Content-Type validation** (must match original)
    3. **File size limits** (enforced in signature)
    4. **Single-use** (expires after successful upload)
    5. **Private by default** (public only after verification)

    ### File Upload Validation

    ```typescript
    // Validates file extension
    private validateFileExtension(fileName: string, folder: string): void {
    const ext = path.extname(fileName).toLowerCase();
    const allowedExtensions = this.getAllowedExtensionsForFolder(folder);
    
    if (!allowedExtensions.includes(ext)) {
        throw new BadRequestException(
        `File extension ${ext} not allowed for folder ${folder}`
        );
    }
    }

    // Validates file size
    private validateFileSize(fileSize: number, folder: string): void {
    const maxSize = this.getMaxFileSizeForFolder(folder);
    
    if (fileSize > maxSize) {
        throw new BadRequestException(
        `File size ${fileSize} exceeds maximum ${maxSize} for folder ${folder}`
        );
    }
    }
    ```

    📍 Implementation: [upload.controller.ts](src/common/controllers/upload.controller.ts)

    ---

    ## 📚 Related Endpoints

    ### Get Institute Details

    ```http
    GET /institutes/:id
    Authorization: Bearer <access_token>
    ```

    **Access:** SUPERADMIN only

    ### List All Institutes

    ```http
    GET /institutes?page=1&limit=20
    Authorization: Bearer <access_token>
    ```

    **Access:** SUPERADMIN only

    ### Delete Institute (Soft Delete)

    ```http
    DELETE /institutes/:id
    Authorization: Bearer <access_token>
    ```

    **Access:** SUPERADMIN only

    ---

    ## 🧪 Testing

    ### Test Institute Update

    ```bash
    # 1. Login as Institute Admin
    curl -X POST https://api.example.com/auth/login \
    -H "Content-Type: application/json" \
    -d '{
        "email": "admin@institute.edu",
        "password": "password123"
    }'

    # Save the access_token from response

    # 2. Update institute
    curl -X PATCH https://api.example.com/institutes/123 \
    -H "Authorization: Bearer ACCESS_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
        "name": "Updated Institute Name",
        "primaryColorCode": "#FF5722"
    }'
    ```

    ### Test File Upload Workflow

    ```bash
    # 1. Generate signed URL
    curl -X POST https://api.example.com/upload/generate-signed-url \
    -H "Authorization: Bearer ACCESS_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
        "folder": "institute-images",
        "fileName": "logo.png",
        "contentType": "image/png",
        "fileSize": 2048576
    }'

    # Save uploadUrl and relativePath

    # 2. Upload file to cloud
    curl -X PUT "UPLOAD_URL_FROM_STEP_1" \
    -H "Content-Type: image/png" \
    -H "x-goog-content-length-range: 0,5242880" \
    --data-binary @logo.png

    # 3. Verify and publish
    curl -X POST https://api.example.com/upload/verify-and-publish \
    -H "Authorization: Bearer ACCESS_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
        "relativePath": "RELATIVE_PATH_FROM_STEP_1"
    }'

    # Save relativePath for institute update

    # 4. Update institute with new logo
    curl -X PATCH https://api.example.com/institutes/123 \
    -H "Authorization: Bearer ACCESS_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
        "logoUrl": "RELATIVE_PATH_FROM_STEP_3"
    }'
    ```

    ---

    ## 🔍 Troubleshooting

    ### Common Issues

    **Issue 1: "403 Forbidden - Access denied"**

    **Cause:** Institute Admin trying to update another institute

    **Solution:** Institute Admins can only update their OWN assigned institute(s)

    ---

    **Issue 2: "Upload URL expired"**

    **Cause:** Signed URLs expire after 10 minutes

    **Solution:** Generate a new signed URL and retry upload

    ---

    **Issue 3: "Content-Type mismatch"**

    **Cause:** Upload header doesn't match original contentType

    **Solution:** Use exact Content-Type from signed URL instructions

    ---

    **Issue 4: "File too large"**

    **Cause:** File exceeds folder's size limit (5MB for institute-images)

    **Solution:** Compress image or use smaller file

    ---

    **Issue 5: "File not found" after upload**

    **Cause:** File upload failed or incomplete

    **Solution:** Verify upload step completed successfully (check HTTP 200 response)

    ---

    **Issue 6: Email already exists**

    **Cause:** Another institute has the same email

    **Solution:** Use a unique email address

    ---

    ## 📖 Additional Resources

    ### Documentation Files
    - [ADMIN_FEATURES_COMPLETE_GUIDE.md](ADMIN_FEATURES_COMPLETE_GUIDE.md) - All admin features
    - [PUBLIC_INSTITUTE_REGISTRATION_COMPLETE_GUIDE.md](PUBLIC_INSTITUTE_REGISTRATION_COMPLETE_GUIDE.md) - Public institute creation
    - [PROFILE_IMAGE_FRONTEND_GUIDE.md](PROFILE_IMAGE_FRONTEND_GUIDE.md) - Profile image uploads
    - [USER_PROFILE_FRONTEND_GUIDE.md](USER_PROFILE_FRONTEND_GUIDE.md) - User profile management

    ### Code References
    - [institute.controller.ts](src/modules/institute/institute.controller.ts) - Institute endpoints
    - [institute.service.ts](src/modules/institute/institute.service.ts) - Update logic
    - [update-institute.dto.ts](src/modules/institute/dto/update-institute.dto.ts) - DTO definition
    - [upload.controller.ts](src/common/controllers/upload.controller.ts) - File upload endpoints
    - [cloud-storage.service.ts](src/common/services/cloud-storage.service.ts) - Cloud storage service

    ---

    ## ✅ Summary

    **Institute Admin Capabilities:**

    ✅ **CAN UPDATE** Own institute data:
    - Basic information (name, email, phone, address)
    - Location details (city, district, province)
    - Branding (logo, colors, images)
    - Institute information (vision, mission)
    - Online presence (website, social media)
    - Status (activate/deactivate)

    ✅ **CAN UPLOAD** Files:
    - Institute logos
    - Banner images
    - Gallery images
    - Loading GIFs

    ✅ **CAN MANAGE:**
    - Class teacher assignments
    - Institute activation status

    ❌ **CANNOT:**
    - Update other institutes
    - Delete institutes permanently
    - Access SUPERADMIN-only features

    ---

    **Last Updated:** February 13, 2026  
    **Status:** ✅ Fully Implemented and Documented  
    **Version:** 1.0.0
