# 🏫 Public Institute Creation API

## Overview
Publicly accessible API endpoints for creating new institutes with file uploads and API key authentication.

---

## 📋 Complete Workflow

### Step 1: Upload Institute Images (Optional)
If you have logos/images, upload them first:
1. **GET /public/upload/get-signed-url** - Get upload URL
2. **PUT to signed URL** - Upload your file
3. **POST /public/upload/verify-and-publish** - Make file public

### Step 2: Create Institute
**POST /public/institutes** - Create institute with uploaded image URLs

---

## 🔐 Authentication

**Method:** API Key Authentication  
**Header:** `x-api-key: YOUR_API_KEY`

To obtain an API key, contact system administrator.

---

## 📍 Endpoint

```
POST /public/institutes
GET  /public/upload/get-signed-url
POST /public/upload/generate-signed-url
POST /public/upload/verify-and-publish
```

**Base URL:** `https://your-api-domain.com`

---

## 🎯 Complete Integration Example

### Full Workflow: Upload Images + Create Institute

```javascript
// STEP 1: Upload Institute Logo
const uploadLogo = async () => {
  // 1.1: Get signed URL
  const signedUrlResponse = await axios.get(
    'https://your-api-domain.com/public/upload/get-signed-url',
    {
      params: {
        folder: 'institute-images',
        fileName: 'logo.png',
        contentType: 'image/png',
        fileSize: 1024000,
      },
      headers: { 'x-api-key': 'YOUR_API_KEY' },
    }
  );
  
  const { uploadUrl, relativePath } = signedUrlResponse.data;
  
  // 1.2: Upload file to signed URL
  const logoFile = document.getElementById('logoInput').files[0];
  await axios.put(uploadUrl, logoFile, {
    headers: { 'Content-Type': 'image/png' },
  });
  
  // 1.3: Verify and make public
  const verifyResponse = await axios.post(
    'https://your-api-domain.com/public/upload/verify-and-publish',
    { relativePath },
    { headers: { 'x-api-key': 'YOUR_API_KEY' } }
  );
  
  return verifyResponse.data.publicUrl; // Use this in institute creation
};

// STEP 2: Create Institute
const createInstitute = async () => {
  const logoUrl = await uploadLogo();
  
  const response = await axios.post(
    'https://your-api-domain.com/public/institutes',
    {
      name: 'Cambridge International School',
      code: 'CIS001',
      email: 'admin@cambridge-school.edu',
      logoUrl: logoUrl, // From step 1
      phone: '+94712345678',
      city: 'Colombo',
      country: 'Sri Lanka',
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': 'YOUR_API_KEY',
      },
    }
  );
  
  console.log('Institute created:', response.data);
};
```

---

## 📍 Endpoints Detail

### 1. Get Signed Upload URL

```
GET /public/upload/get-signed-url
```

**Parameters:**
- `folder` (required): Must be "institute-images"
- `fileName` (required): Original filename (e.g., "logo.png")
- `contentType` (required): MIME type (e.g., "image/png")
- `fileSize` (required): File size in bytes (max 5MB)

**Response:**
```json
{
  "success": true,
  "uploadUrl": "https://storage.googleapis.com/...",
  "relativePath": "institute-images/logo-uuid.png",
  "expiresAt": "2026-01-18T10:10:00.000Z"
}
```

---

### 2. Verify and Publish File

```
POST /public/upload/verify-and-publish
```

**Body:**
```json
{
  "relativePath": "institute-images/logo-uuid.png"
}
```

**Response:**
```json
{
  "success": true,
  "publicUrl": "https://storage.googleapis.com/suraksha-lms/institute-images/logo-uuid.png",
  "relativePath": "institute-images/logo-uuid.png"
}
```

---

### 3. Create Institute

```
POST /public/institutes
```

## 🔑 Security Features

✅ **API Key Authentication** - Required in header  
✅ **Input Validation** - All fields validated  
✅ **Duplicate Detection** - Prevents duplicate code/email  
✅ **Rate Limiting** - Protection against abuse  
✅ **Origin Validation** - Blocks unauthorized origins  
✅ **Comprehensive Logging** - Full audit trail  
✅ **IP Tracking** - Request source logging  

---

## 📥 Request

### Headers
```http
Content-Type: application/json
x-api-key: YOUR_API_KEY_HERE
```

### Request Body

#### Required Fields
```json
{
  "name": "Cambridge International School",
  "code": "CIS001",
  "email": "admin@cambridge-school.edu"
}
```

#### Full Example
```json
{
  "name": "Cambridge International School",
  "shortName": "CIS",
  "code": "CIS001",
  "email": "admin@cambridge-school.edu",
  "phone": "+94712345678",
  "address": "123 Education Street, Academic District",
  "city": "Colombo",
  "state": "Western Province",
  "country": "Sri Lanka",
  "district": "Colombo",
  "province": "Western",
  "pinCode": "00100",
  "logoUrl": "institute-images/logo-uuid.png",
  "loadingGifUrl": "institute-images/loading-uuid.gif",
  "imageUrl": "institute-images/banner-uuid.jpg",
  "imageUrls": [
    "institute-images/gallery1-uuid.jpg",
    "institute-images/gallery2-uuid.jpg"
  ],
  "website": "https://cambridge-school.edu",
  "description": "Premier international school offering Cambridge curriculum",
  "establishedYear": 1995,
  "studentCapacity": 1000,
  "timezone": "Asia/Colombo"
}
```

---

## 📤 Response

### Success Response (201 Created)

```json
{
  "success": true,
  "message": "Institute created successfully",
  "requestId": "CREATE-INST-A1B2C3D4",
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Cambridge International School",
    "shortName": "CIS",
    "code": "CIS001",
    "email": "admin@cambridge-school.edu",
    "phone": "+94712345678",
    "address": "123 Education Street, Academic District",
    "city": "Colombo",
    "country": "Sri Lanka",
    "createdAt": "2026-01-18T00:00:00.000Z",
    "updatedAt": "2026-01-18T00:00:00.000Z"
  }
}
```

### Error Responses

#### 400 Bad Request - Invalid Input
```json
{
  "success": false,
  "statusCode": 400,
  "message": "Validation failed",
  "errors": [
    "email must be a valid email",
    "code must contain only uppercase letters, numbers, hyphens, and underscores"
  ]
}
```

#### 401 Unauthorized - Invalid API Key
```json
{
  "success": false,
  "statusCode": 401,
  "message": "Invalid API key"
}
```

#### 409 Conflict - Duplicate Institute
```json
{
  "success": false,
  "statusCode": 409,
  "message": "Institute with this code already exists"
}
```

---

## 🧪 Testing with cURL

### Basic Request
```bash
curl -X POST https://your-api-domain.com/public/institutes \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{
    "name": "Test School",
    "code": "TEST001",
    "email": "admin@testschool.edu"
  }'
```

### Full Request
```bash
curl -X POST https://your-api-domain.com/public/institutes \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{
    "name": "Cambridge International School",
    "shortName": "CIS",
    "code": "CIS001",
    "email": "admin@cambridge-school.edu",
    "phone": "+94712345678",
    "address": "123 Education Street",
    "city": "Colombo",
    "country": "Sri Lanka"
  }'
```

---

## 📝 Field Specifications

| Field | Type | Required | Max Length | Validation |
|-------|------|----------|------------|------------|
| `name` | string | ✅ Yes | 255 | Non-empty |
| `code` | string | ✅ Yes | 50 | Uppercase letters, numbers, hyphens, underscores only. Min 3 chars |
| `email` | string | ✅ Yes | 255 | Valid email format |
| `shortName` | string | ❌ No | 50 | - |
| `phone` | string | ❌ No | 20 | - |
| `address` | string | ❌ No | - | - |
| `city` | string | ❌ No | 100 | - |
| `state` | string | ❌ No | 100 | - |
| `country` | enum | ❌ No | - | Valid country code |
| `district` | enum | ❌ No | - | Valid district |
| `province` | enum | ❌ No | - | Valid province |
| `pinCode` | string | ❌ No | 20 | - |
| `logoUrl` | string | ❌ No | 255 | URL from upload service |
| `loadingGifUrl` | string | ❌ No | 255 | URL from upload service |
| `imageUrl` | string | ❌ No | 255 | URL from upload service |
| `imageUrls` | array | ❌ No | - | Array of URLs |
| `website` | string | ❌ No | 255 | Valid URL |
| `description` | string | ❌ No | - | - |
| `establishedYear` | number | ❌ No | - | Year (e.g., 1995) |
| `studentCapacity` | number | ❌ No | - | Positive integer |
| `timezone` | string | ❌ No | 50 | Valid timezone (e.g., Asia/Colombo) |

---

## 🚨 Code Validation Rules

The institute code must:
- Be **3-50 characters** long
- Contain **only**:
  - Uppercase letters (A-Z)
  - Numbers (0-9)
  - Hyphens (-)
  - Underscores (_)

### Valid Codes
✅ `CIS001`  
✅ `SCHOOL-123`  
✅ `INST_2024`  
✅ `ABC-XYZ-001`  

### Invalid Codes
❌ `cis001` (lowercase)  
❌ `School 123` (spaces)  
❌ `inst@123` (special chars)  
❌ `AB` (too short)  

---

## 📊 Logging

Every request is logged with:
- 🔑 Request ID (unique identifier)
- 📧 Institute name, code, email
- 🌐 IP address
- ⏱️ Timestamp
- ✅/❌ Success/failure status
- 📝 Error details (if failed)

### Log Examples

#### Success Log
```
[CREATE-INST-A1B2C3D4] 🏫 Public institute creation request received - 
Name: "Cambridge International School", Code: "CIS001", 
Email: "admin@cambridge-school.edu", IP: 192.168.1.100
[CREATE-INST-A1B2C3D4] 🔍 Checking for duplicate code/email...
[CREATE-INST-A1B2C3D4] 🚀 Creating institute: Cambridge International School
[CREATE-INST-A1B2C3D4] ✅ Institute created successfully - 
ID: 550e8400-e29b-41d4-a716-446655440000, Name: "Cambridge International School", Code: "CIS001"
```

#### Error Log
```
[CREATE-INST-A1B2C3D4] 🏫 Public institute creation request received - 
Name: "Test School", Code: "TEST001", Email: "admin@test.edu", IP: 192.168.1.100
[CREATE-INST-A1B2C3D4] 🔍 Checking for duplicate code/email...
[CREATE-INST-A1B2C3D4] ❌ Institute creation failed - 
Error: Institute with this code already exists, 
Name: "Test School", Code: "TEST001", Email: "admin@test.edu", IP: 192.168.1.100
```

---

## 🔄 Integration Examples

### JavaScript/TypeScript (Axios)
```typescript
import axios from 'axios';

const createInstitute = async () => {
  try {
    const response = await axios.post(
      'https://your-api-domain.com/public/institutes',
      {
        name: 'Cambridge International School',
        code: 'CIS001',
        email: 'admin@cambridge-school.edu',
        phone: '+94712345678',
        city: 'Colombo',
        country: 'Sri Lanka',
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': 'YOUR_API_KEY',
        },
      }
    );
    
    console.log('Success:', response.data);
    console.log('Institute ID:', response.data.data.id);
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
};
```

### Python
```python
import requests

def create_institute():
    url = "https://your-api-domain.com/public/institutes"
    headers = {
        "Content-Type": "application/json",
        "x-api-key": "YOUR_API_KEY"
    }
    data = {
        "name": "Cambridge International School",
        "code": "CIS001",
        "email": "admin@cambridge-school.edu",
        "phone": "+94712345678",
        "city": "Colombo",
        "country": "Sri Lanka"
    }
    
    response = requests.post(url, json=data, headers=headers)
    
    if response.status_code == 201:
        print("Success:", response.json())
    else:
        print("Error:", response.json())

create_institute()
```

### PHP
```php
<?php
$url = 'https://your-api-domain.com/public/institutes';
$data = array(
    'name' => 'Cambridge International School',
    'code' => 'CIS001',
    'email' => 'admin@cambridge-school.edu',
    'phone' => '+94712345678',
    'city' => 'Colombo',
    'country' => 'Sri Lanka'
);

$options = array(
    'http' => array(
        'header'  => "Content-type: application/json\r\n" .
                     "x-api-key: YOUR_API_KEY\r\n",
        'method'  => 'POST',
        'content' => json_encode($data)
    )
);

$context  = stream_context_create($options);
$result = file_get_contents($url, false, $context);

if ($result === FALSE) {
    die('Error');
}

$response = json_decode($result);
echo "Success: Institute ID = " . $response->data->id;
?>
```

---

## ⚠️ Best Practices

1. **Store API Key Securely**
   - Never commit API keys to version control
   - Use environment variables
   - Rotate keys periodically

2. **Handle Errors Gracefully**
   - Check response status codes
   - Log failed requests
   - Implement retry logic for network errors

3. **Validate Before Sending**
   - Check email format
   - Validate code format
   - Ensure required fields are present

4. **Monitor Usage**
   - Track API call frequency
   - Monitor for rate limit issues
   - Review error logs regularly

5. **Test in Development First**
   - Use test API keys
   - Validate all fields
   - Test error scenarios

---

## 📞 Support

For API key requests or technical support, contact:
- **Email:** api-support@suraksha.lk
- **Documentation:** https://docs.suraksha.lk/api

---

## 📜 Changelog

### Version 1.0.0 (2026-01-18)
- ✅ Initial release
- ✅ API key authentication
- ✅ Comprehensive logging
- ✅ Input validation
- ✅ Duplicate detection
- ✅ Rate limiting support
