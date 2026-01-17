# 🏫 Public Institute Registration API - Complete Guide

**Version:** 2.0.0  
**Last Updated:** 2025  
**Security Level:** Production-Ready with Rate Limiting

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Security Features](#security-features)
3. [Authentication](#authentication)
4. [Complete Registration Workflow](#complete-registration-workflow)
5. [API Reference](#api-reference)
6. [Code Examples](#code-examples)
7. [Error Handling](#error-handling)
8. [Testing Guide](#testing-guide)
9. [Troubleshooting](#troubleshooting)

---

## 🎯 Overview

This public API allows external partners and applications to register educational institutes programmatically. The system is designed with security, abuse prevention, and ease of use in mind.

### Key Features

✅ **No Institute Code Required** - System auto-generates unique codes  
✅ **Optional Images** - Logo, loading GIF, and banner are all optional  
✅ **Required System Contacts** - Ensures institutes can be reached  
✅ **Rate Limited** - Prevents spam and abuse  
✅ **Comprehensive Logging** - Full audit trail for troubleshooting  
✅ **File Upload Support** - Direct upload with signed URLs  

### Rate Limits

| Endpoint | Limit | Window |
|----------|-------|--------|
| Create Institute | 3 requests | 1 minute |
| General Endpoints | 5 requests | 1 minute |
| File Upload | 10 requests | 1 minute |

---

## 🔒 Security Features

### 1. API Key Authentication
All requests require a valid API key in the Authorization header as a Bearer token:
```http
Authorization: Bearer your-api-key-here
```

### 2. Rate Limiting (Throttling)
- **Institute Creation:** 3 requests per minute per IP
- **General Operations:** 5 requests per minute per IP
- **File Uploads:** 10 requests per minute per IP

### 3. Input Validation
- Phone numbers must match Sri Lankan format: `+947XXXXXXXX`
- Email addresses validated with proper regex
- File types restricted to images only
- Maximum file size: 5MB per image

### 4. Auto-Generated Codes
Institute codes are automatically generated to prevent conflicts:
```
Format: INST-YYYYMMDD-XXX
Example: INST-20250120-001
```

### 5. Comprehensive Logging
Every request is logged with:
- Request ID (UUID)
- IP Address
- Timestamp
- API Key (partially masked)
- Request/Response data

---

## 🔑 Authentication

### Getting Your API Key

Contact your system administrator to obtain an API key. The key will be provided in this format:
```
YOUR_UNIQUE_API_KEY_HERE
```

### Using the API Key

Include the API key in every request header:

**cURL:**
```bash
curl -X POST https://your-api.com/public/institutes \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json"
```

**JavaScript:**
```javascript
fetch('https://your-api.com/public/institutes', {
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY',
    'Content-Type': 'application/json'
  }
})
```

**Python:**
```python
headers = {
    'Authorization': 'Bearer YOUR_API_KEY',
    'Content-Type': 'application/json'
}
requests.post('https://your-api.com/public/institutes', headers=headers)
```

---

## 🔄 Complete Registration Workflow

### Option 1: Without Images (Simplest)

```
1. Prepare institute data (name, email, contacts)
   ↓
2. POST /api/public/institutes
   ↓
3. Receive institute ID and auto-generated code
   ↓
4. ✅ Registration complete!
```

### Option 2: With Images (3-Step Upload)

```
1. Get signed upload URL
   POST /public/upload/generate-signed-url
   ↓
2. Upload file to AWS S3
   POST <uploadUrl> (multipart/form-data)
   ↓
3. Verify and publish the file
   POST /public/upload/verify-and-publish
   ↓
4. Create institute with image URLs
   POST /public/institutes
   ↓
5. ✅ Registration complete!
```

---

## 📚 API Reference

### 1. Create Institute

**Endpoint:** `POST /public/institutes`

**Headers:**
```http
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json
```

**Request Body:**

```json
{
  "name": "Royal College Colombo",
  "email": "admin@royalcollege.lk",
  "systemContactPhoneNumber": "+94712345678",
  "systemContactEmail": "system@royalcollege.lk",
  "address": "123 Galle Road",
  "city": "Colombo",
  "state": "Western Province",
  "district": "COLOMBO",
  "province": "WESTERN",
  "country": "Sri Lanka",
  "pinCode": "00700",
  "shortName": "RCC",
  "phone": "+94112345678",
  "logoUrl": "https://your-cdn.com/logo.png",
  "loadingGifUrl": "https://your-cdn.com/loading.gif",
  "imageUrl": "https://your-cdn.com/banner.jpg",
  "primaryColorCode": "#003366",
  "secondaryColorCode": "#FFD700",
  "vision": "To be the leading educational institution",
  "mission": "Providing quality education for all",
  "websiteUrl": "https://royalcollege.lk",
  "facebookPageUrl": "https://facebook.com/royalcollege",
  "youtubeChannelUrl": "https://youtube.com/@royalcollege"
}
```

**Required Fields:**
- `name` - Institute name (3-200 characters)
- `email` - Primary contact email (must be unique)
- `systemContactPhoneNumber` - System notification phone (+947XXXXXXXX)
- `systemContactEmail` - System notification email

**Optional Fields:**
- `shortName` - Short name (max 20 characters)
- `phone` - Primary phone number
- `address` - Physical address (max 200 characters)
- `city` - City name (max 50 characters)
- `state` - State/Province name (max 50 characters)
- `district` - District from enum (COLOMBO, GAMPAHA, KANDY, etc.)
- `province` - Province from enum (WESTERN, CENTRAL, SOUTHERN, etc.)
- `country` - Country from enum (use: "Sri Lanka" not "SRI_LANKA")
- `pinCode` - Postal/ZIP code (max 10 characters)
- `logoUrl` - Institute logo URL (max 255 characters)
- `loadingGifUrl` - Loading animation URL (max 255 characters)
- `imageUrl` - Banner/cover image URL (max 255 characters)
- `primaryColorCode` - Primary theme color (hex format: #RRGGBB)
- `secondaryColorCode` - Secondary theme color (hex format: #RRGGBB)
- `vision` - Institute vision statement (text)
- `mission` - Institute mission statement (text)
- `websiteUrl` - Official website URL (max 255 characters)
- `facebookPageUrl` - Facebook page URL (max 255 characters)
- `youtubeChannelUrl` - YouTube channel URL (max 255 characters)

**Success Response (201 Created):**
```json
{
  "success": true,
  "message": "Institute created successfully with auto-generated code",
  "requestId": "CREATE-INST-A3318EB0",
  "data": {
    "name": "Royal College Colombo",
    "code": "INST-20250120-001",
    "email": "admin@royalcollege.lk",
    "systemContactEmail": "s***m@royalcollege.lk",
    "systemContactPhoneNumber": "+947*****678",
    "country": "Sri Lanka",
    "district": "COLOMBO",
    "province": "WESTERN",
    "logoUrl": null,
    "loadingGifUrl": null,
    "imageUrls": null,
    "imageUrl": null,
    "shortName": null,
    "phone": null,
    "address": "123 Galle Road",
    "city": null,
    "state": null,
    "pinCode": null,
    "primaryColorCode": null,
    "secondaryColorCode": null,
    "vision": null,
    "mission": null,
    "websiteUrl": null,
    "facebookPageUrl": null,
    "youtubeChannelUrl": null,
    "id": "103",
    "type": "school",
    "isDefault": false,
    "isActive": true,
    "createdAt": null,
    "updatedAt": null
  }
}
```

**Note:** Sensitive fields (email, phone) are partially masked in responses for security.

**Error Response (400 Bad Request):**
```json
{
  "success": false,
  "message": "Validation failed",
  "requestId": "uuid-v4-here",
  "errors": [
    {
      "field": "email",
      "message": "Institute with this email already exists"
    }
  ]
}
```

**Error Response (429 Too Many Requests):**
```json
{
  "statusCode": 429,
  "message": "ThrottlerException: Too Many Requests"
}
```

---

### 2. Get Signed Upload URL

**Endpoint:** `POST /public/upload/generate-signed-url` or `GET /public/upload/get-signed-url`

**Headers:**
```http
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json
```

**Request Body (POST):**
```json
{
  "folder": "institute-images",
  "fileName": "logo.png",
  "contentType": "image/png",
  "fileSize": 2048576
}
```

**Query Parameters (GET):**
```
?folder=institute-images
&fileName=logo.png
&contentType=image/png
&fileSize=2048576
```

**Success Response (200 OK):**
```json
{
  "success": true,
  "uploadUrl": "https://bucket.s3.region.amazonaws.com/",
  "publicUrl": "https://your-cdn.com/institute-images/uuid.png",
  "relativePath": "institute-images/uuid.png",
  "fields": {
    "key": "institute-images/uuid.png",
    "Content-Type": "image/png",
    "Policy": "base64-encoded-policy",
    "X-Amz-Signature": "signature"
  },
  "instructions": {
    "step1": "POST uploadUrl with multipart/form-data",
    "step2": "Include all fields + file",
    "step3": "Call verify-and-publish with relativePath"
  }
}
```

**Supported File Types:**
- Images: `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`, `.svg`
- Maximum size: 5MB

---

### 3. Upload File to AWS S3

**Endpoint:** Use the `uploadUrl` from previous step

**Method:** `POST`

**Content-Type:** `multipart/form-data`

**Body:** Form data with all fields + file

**Example (JavaScript):**
```javascript
const file = document.getElementById('fileInput').files[0];
const formData = new FormData();

// Add all fields from response
Object.keys(response.fields).forEach(key => {
  formData.append(key, response.fields[key]);
});

// Add file last
formData.append('file', file);

const uploadResponse = await fetch(response.uploadUrl, {
  method: 'POST',
  body: formData
});

if (uploadResponse.ok) {
  console.log('✅ Upload successful!');
}
```

---

### 4. Verify and Publish Upload

**Endpoint:** `POST /public/upload/verify-and-publish`

**Headers:**
```http
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json
```

**Request Body:**
```json
{
  "relativePath": "institute-images/uuid.png"
}
```

**Success Response (200 OK):**
```json
{
  "success": true,
  "message": "File verified and published successfully",
  "publicUrl": "https://storage.googleapis.com/bucket/institute-images/uuid.png",
  "metadata": {
    "size": 2048576,
    "contentType": "image/png",
    "created": "2025-01-20T10:30:00.000Z"
  }
}
```

---

## 💻 Code Examples

### Example 1: Simple Registration (No Images)

**cURL:**
```bash
curl -X POST https://your-api.com/public/institutes \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Institute",
    "email": "test@institute.lk",
    "systemContactPhoneNumber": "+94712345678",
    "systemContactEmail": "system@institute.lk",
    "address": "Colombo",
    "district": "COLOMBO",
    "province": "WESTERN",
    "country": "Sri Lanka"
  }'
```

**JavaScript (Fetch):**
```javascript
const API_KEY = 'YOUR_API_KEY';
const API_URL = 'https://your-api.com/api/public/institutes';

async function createInstitute() {
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'Test Institute',
        email: 'test@institute.lk',
        systemContactPhoneNumber: '+94712345678',
        systemContactEmail: 'system@institute.lk',
        address: 'Colombo',
        district: 'COLOMBO',
        province: 'WESTERN',
        country: 'SRI_LANKA'
      })
    });

    const result = await response.json();
    
    if (result.success) {
      console.log('✅ Institute created:', result.data.institute.code);
      return result.data.institute;
    } else {
      console.error('❌ Error:', result.message);
    }
  } catch (error) {
    console.error('❌ Request failed:', error);
  }
}

createInstitute();
```

**Python:**
```python
import requests

API_KEY = 'YOUR_API_KEY'
API_URL = 'https://your-api.com/api/public/institutes'

def create_institute():
    headers = {
        'x-api-key': API_KEY,
        'Content-Type': 'application/json'
    }
    
    data = {
        'name': 'Test Institute',
        'email': 'test@institute.lk',
        'systemContactPhoneNumber': '+94712345678',
        'systemContactEmail': 'system@institute.lk',
        'address': 'Colombo',
        'district': 'COLOMBO',
        'province': 'WESTERN',
        'country': 'SRI_LANKA'
    }
    
    response = requests.post(API_URL, headers=headers, json=data)
    result = response.json()
    
    if result['success']:
        print(f"✅ Institute created: {result['data']['institute']['code']}")
        return result['data']['institute']
    else:
        print(f"❌ Error: {result['message']}")
        return None

institute = create_institute()
```

---

### Example 2: Complete Registration with Images

**React Component:**
```jsx
import React, { useState } from 'react';

const API_KEY = 'YOUR_API_KEY';
const BASE_URL = 'https://your-api.com/api/public';

function InstituteRegistration() {
  const [loading, setLoading] = useState(false);
  const [logoFile, setLogoFile] = useState(null);

  const uploadFile = async (file) => {
    try {
      // Step 1: Get signed URL
      const urlResponse = await fetch(`${BASE_URL}/upload/signed-url`, {
        method: 'POST',
        headers: {
          'x-api-key': API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          folder: 'institute-images',
          fileName: file.name,
          contentType: file.type,
          fileSize: file.size
        })
      });

      const urlData = await urlResponse.json();
      
      if (!urlData.success) {
        throw new Error(urlData.message);
      }

      // Step 2: Upload file to signed URL
      const uploadResponse = await fetch(urlData.signedUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': file.type
        },
        body: file
      });

      if (!uploadResponse.ok) {
        throw new Error('File upload failed');
      }

      // Step 3: Verify and publish
      const verifyResponse = await fetch(`${BASE_URL}/upload/verify`, {
        method: 'POST',
        headers: {
          'x-api-key': API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          relativePath: urlData.relativePath
        })
      });

      const verifyData = await verifyResponse.json();
      
      if (!verifyData.success) {
        throw new Error(verifyData.message);
      }

      return verifyData.publicUrl;
    } catch (error) {
      console.error('Upload failed:', error);
      throw error;
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      let logoUrl = null;

      // Upload logo if selected
      if (logoFile) {
        logoUrl = await uploadFile(logoFile);
        console.log('✅ Logo uploaded:', logoUrl);
      }

      // Create institute
      const formData = new FormData(e.target);
      const response = await fetch(`${BASE_URL}/institutes`, {
        method: 'POST',
        headers: {
          'x-api-key': API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: formData.get('name'),
          email: formData.get('email'),
          systemContactPhoneNumber: formData.get('phone'),
          systemContactEmail: formData.get('systemEmail'),
          address: formData.get('address'),
          district: formData.get('district'),
          province: formData.get('province'),
          country: 'SRI_LANKA',
          logoUrl: logoUrl
        })
      });

      const result = await response.json();

      if (result.success) {
        alert(`✅ Institute created successfully!\nCode: ${result.data.institute.code}`);
        e.target.reset();
        setLogoFile(null);
      } else {
        alert(`❌ Error: ${result.message}`);
      }
    } catch (error) {
      alert(`❌ Registration failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <h2>Register Institute</h2>
      
      <input name="name" placeholder="Institute Name" required />
      <input name="email" type="email" placeholder="Contact Email" required />
      <input name="phone" placeholder="+94712345678" pattern="\+947\d{8}" required />
      <input name="systemEmail" type="email" placeholder="System Email" required />
      <input name="address" placeholder="Address" />
      
      <select name="district">
        <option value="COLOMBO">Colombo</option>
        <option value="GAMPAHA">Gampaha</option>
        <option value="KANDY">Kandy</option>
        {/* Add other districts */}
      </select>
      
      <select name="province">
        <option value="WESTERN">Western</option>
        <option value="CENTRAL">Central</option>
        {/* Add other provinces */}
      </select>
      
      <div>
        <label>Logo (Optional):</label>
        <input 
          type="file" 
          accept="image/*" 
          onChange={(e) => setLogoFile(e.target.files[0])} 
        />
      </div>

      <button type="submit" disabled={loading}>
        {loading ? 'Registering...' : 'Register Institute'}
      </button>
    </form>
  );
}

export default InstituteRegistration;
```

---

### Example 3: Batch Registration Script

**Node.js:**
```javascript
const fetch = require('node-fetch');

const API_KEY = 'YOUR_API_KEY';
const BASE_URL = 'https://your-api.com/api/public';

// Institutes to register
const institutes = [
  {
    name: 'Science Academy',
    email: 'admin@science.lk',
    systemContactPhoneNumber: '+94712345678',
    systemContactEmail: 'system@science.lk',
    district: 'COLOMBO',
    province: 'WESTERN'
  },
  {
    name: 'Arts College',
    email: 'admin@arts.lk',
    systemContactPhoneNumber: '+94712345679',
    systemContactEmail: 'system@arts.lk',
    district: 'GAMPAHA',
    province: 'WESTERN'
  }
];

async function registerInstitute(data) {
  const response = await fetch(`${BASE_URL}/institutes`, {
    method: 'POST',
    headers: {
      'x-api-key': API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ ...data, country: 'SRI_LANKA' })
  });

  return response.json();
}

async function batchRegister() {
  console.log(`📋 Starting batch registration of ${institutes.length} institutes...\n`);

  for (let i = 0; i < institutes.length; i++) {
    const institute = institutes[i];
    
    try {
      console.log(`[${i + 1}/${institutes.length}] Registering: ${institute.name}`);
      
      const result = await registerInstitute(institute);
      
      if (result.success) {
        console.log(`✅ Success! Code: ${result.data.institute.code}\n`);
      } else {
        console.log(`❌ Failed: ${result.message}\n`);
      }
      
      // Respect rate limit: wait 20 seconds between requests
      if (i < institutes.length - 1) {
        console.log('⏳ Waiting 20 seconds (rate limit)...\n');
        await new Promise(resolve => setTimeout(resolve, 20000));
      }
    } catch (error) {
      console.log(`❌ Error: ${error.message}\n`);
    }
  }

  console.log('✅ Batch registration complete!');
}

batchRegister();
```

---

## 🚨 Error Handling

### Common Error Codes

| Status Code | Meaning | Solution |
|-------------|---------|----------|
| 400 | Bad Request | Check request body validation |
| 401 | Unauthorized | Verify API key is correct |
| 429 | Too Many Requests | Wait before retrying (rate limit) |
| 409 | Conflict | Email already exists |
| 500 | Internal Server Error | Contact support |

### Error Response Format

```json
{
  "success": false,
  "message": "Human-readable error message",
  "requestId": "uuid-for-support",
  "errors": [
    {
      "field": "email",
      "message": "Institute with this email already exists"
    }
  ]
}
```

### Validation Errors

**Missing Required Field:**
```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    {
      "field": "systemContactPhoneNumber",
      "message": "systemContactPhoneNumber should not be empty"
    }
  ]
}
```

**Invalid Phone Format:**
```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    {
      "field": "systemContactPhoneNumber",
      "message": "Phone number must be in format +947XXXXXXXX"
    }
  ]
}
```

**Duplicate Email:**
```json
{
  "success": false,
  "message": "Institute with email 'test@institute.lk' already exists",
  "requestId": "uuid-here"
}
```

### Rate Limit Error

```json
{
  "statusCode": 429,
  "message": "ThrottlerException: Too Many Requests"
}
```

**Solution:** Wait 60 seconds before retrying. For institute creation, you're limited to 3 requests per minute.

---

## 🧪 Testing Guide

### Testing with Postman

1. **Create a new collection:** "Public Institute API"

2. **Add API Key to collection:**
   - Go to Collection Settings → Variables
   - Add variable: `api_key` = `YOUR_API_KEY`
   - Add variable: `base_url` = `https://your-api.com/api/public`

3. **Test 1: Simple Institute Creation**
   ```
   POST {{base_url}}/institutes
   Headers:
     x-api-key: {{api_key}}
     Content-Type: application/json
   Body:
     {
       "name": "Test Institute {{$timestamp}}",
       "email": "test{{$timestamp}}@institute.lk",
       "systemContactPhoneNumber": "+94712345678",
       "systemContactEmail": "system{{$timestamp}}@institute.lk",
       "district": "COLOMBO",
       "province": "WESTERN",
       "country": "SRI_LANKA"
     }
   ```

4. **Test 2: Rate Limit**
   - Run the above request 4 times quickly
   - 4th request should return 429 error

5. **Test 3: File Upload Flow**
   ```
   Step 1 - Get Signed URL:
   POST {{base_url}}/upload/signed-url
   Body:
     {
       "folder": "institute-images",
       "fileName": "test-logo.png",
       "contentType": "image/png",
       "fileSize": 2048576
     }
   
   Step 2 - Upload File:
   PUT <use signedUrl from response>
   Headers:
     Content-Type: image/png
   Body: Select file (binary)
   
   Step 3 - Verify:
   POST {{base_url}}/upload/verify
   Body:
     {
       "relativePath": "<use from step 1 response>"
     }
   ```

### Testing with cURL

**Test 1: Basic Creation**
```bash
curl -X POST https://your-api.com/api/public/institutes \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Institute",
    "email": "test@example.lk",
    "systemContactPhoneNumber": "+94712345678",
    "systemContactEmail": "system@example.lk",
    "district": "COLOMBO",
    "province": "WESTERN",
    "country": "SRI_LANKA"
  }'
```

**Test 2: Invalid Phone Number**
```bash
curl -X POST https://your-api.com/api/public/institutes \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test",
    "email": "test2@example.lk",
    "systemContactPhoneNumber": "0712345678",
    "systemContactEmail": "sys@example.lk"
  }'

# Expected: 400 error with phone format message
```

**Test 3: Rate Limit**
```bash
# Run this script to test rate limiting
for i in {1..5}; do
  echo "Request $i:"
  curl -X POST https://your-api.com/api/public/institutes \
    -H "x-api-key: YOUR_API_KEY" \
    -H "Content-Type: application/json" \
    -d "{
      \"name\": \"Test $i\",
      \"email\": \"test$i@example.lk\",
      \"systemContactPhoneNumber\": \"+94712345678\",
      \"systemContactEmail\": \"sys$i@example.lk\"
    }"
  echo -e "\n---\n"
  sleep 1
done

# Expected: First 3 succeed, 4th and 5th return 429
```

---

## 🔍 Troubleshooting

### Issue 1: "401 Unauthorized"

**Cause:** Invalid or missing API key

**Solution:**
```bash
# Check your API key is correct
curl -X POST https://your-api.com/api/public/institutes \
  -H "x-api-key: YOUR_CORRECT_API_KEY" \
  -v  # Verbose mode to see headers
```

---

### Issue 2: "429 Too Many Requests"

**Cause:** Rate limit exceeded (3 requests per minute for creation)

**Solution:**
```javascript
// Implement retry with exponential backoff
async function createWithRetry(data, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });

    if (response.status === 429) {
      const waitTime = Math.pow(2, i) * 10000; // 10s, 20s, 40s
      console.log(`Rate limited. Waiting ${waitTime/1000}s...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      continue;
    }

    return response.json();
  }
  
  throw new Error('Max retries exceeded');
}
```

---

### Issue 3: "Email already exists"

**Cause:** Institute with that email is already registered

**Solution:**
```javascript
// Check if institute exists before creating
const checkEmail = async (email) => {
  try {
    const response = await fetch(`${API_URL}?email=${email}`, {
      headers: { 'x-api-key': API_KEY }
    });
    // Handle response
  } catch (error) {
    // Email doesn't exist, safe to create
  }
};
```

---

### Issue 4: "Invalid phone format"

**Cause:** Phone number doesn't match +947XXXXXXXX format

**Solution:**
```javascript
function formatPhoneNumber(phone) {
  // Remove all non-digits
  const digits = phone.replace(/\D/g, '');
  
  // Check if starts with 94 or 0
  if (digits.startsWith('94')) {
    return `+${digits}`;
  } else if (digits.startsWith('0')) {
    return `+94${digits.substring(1)}`;
  } else if (digits.startsWith('7') && digits.length === 9) {
    return `+94${digits}`;
  }
  
  throw new Error('Invalid phone number format');
}

// Usage
const phone = formatPhoneNumber('0712345678'); // "+94712345678"
```

---

### Issue 5: File upload fails

**Cause:** Various reasons (file too large, wrong content type, expired URL)

**Solution:**
```javascript
const validateFile = (file) => {
  // Check size (max 5MB)
  if (file.size > 5 * 1024 * 1024) {
    throw new Error('File too large (max 5MB)');
  }
  
  // Check type
  const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];
  if (!allowedTypes.includes(file.type)) {
    throw new Error(`Invalid file type. Allowed: ${allowedTypes.join(', ')}`);
  }
  
  return true;
};

// Always upload within 10 minutes of getting signed URL
const uploadWithTimeout = async (signedUrl, file) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9 * 60 * 1000); // 9 min
  
  try {
    const response = await fetch(signedUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type },
      body: file,
      signal: controller.signal
    });
    
    clearTimeout(timeout);
    return response;
  } catch (error) {
    clearTimeout(timeout);
    throw error;
  }
};
```

---

### Issue 6: Debugging with Request ID

Every response includes a `requestId`. Use it when contacting support:

```javascript
const response = await fetch(API_URL, { /* ... */ });
const result = await response.json();

if (!result.success) {
  console.error(`Error occurred. Request ID: ${result.requestId}`);
  console.error(`Message: ${result.message}`);
  
  // Save for support ticket
  localStorage.setItem('lastErrorRequestId', result.requestId);
}
```

---

## 📊 Best Practices

### 1. Always Use HTTPS
```javascript
// ✅ Good
const API_URL = 'https://your-api.com/api/public/institutes';

// ❌ Bad
const API_URL = 'http://your-api.com/api/public/institutes';
```

### 2. Never Expose API Key in Frontend
```javascript
// ❌ Bad - API key visible in browser
const API_KEY = 'your-secret-key';

// ✅ Good - Proxy through your backend
// Frontend → Your Backend → Public API
app.post('/create-institute', async (req, res) => {
  const response = await fetch(PUBLIC_API_URL, {
    headers: { 'x-api-key': process.env.API_KEY }
  });
  res.json(await response.json());
});
```

### 3. Implement Proper Error Handling
```javascript
async function safeCreateInstitute(data) {
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });

    const result = await response.json();

    if (!response.ok) {
      // Log for debugging
      console.error('API Error:', {
        status: response.status,
        requestId: result.requestId,
        message: result.message
      });

      // Return user-friendly message
      return {
        success: false,
        message: getUserFriendlyMessage(response.status, result)
      };
    }

    return result;
  } catch (error) {
    console.error('Network error:', error);
    return {
      success: false,
      message: 'Network error. Please check your connection.'
    };
  }
}

function getUserFriendlyMessage(status, result) {
  switch (status) {
    case 400:
      return `Validation error: ${result.errors?.[0]?.message || result.message}`;
    case 401:
      return 'Authentication failed. Please contact support.';
    case 429:
      return 'Too many requests. Please wait a minute and try again.';
    case 409:
      return 'An institute with this email already exists.';
    default:
      return 'Something went wrong. Please try again later.';
  }
}
```

### 4. Validate Input Before Sending
```javascript
const validateInstituteData = (data) => {
  const errors = [];

  // Name
  if (!data.name || data.name.length < 3) {
    errors.push('Name must be at least 3 characters');
  }

  // Email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(data.email)) {
    errors.push('Invalid email format');
  }

  // Phone
  const phoneRegex = /^\+947\d{8}$/;
  if (!phoneRegex.test(data.systemContactPhoneNumber)) {
    errors.push('Phone must be in format +947XXXXXXXX');
  }

  // System Email
  if (!emailRegex.test(data.systemContactEmail)) {
    errors.push('Invalid system email format');
  }

  return errors;
};

// Usage
const errors = validateInstituteData(formData);
if (errors.length > 0) {
  alert('Please fix these errors:\n' + errors.join('\n'));
  return;
}

// Proceed with API call
```

### 5. Respect Rate Limits
```javascript
class RateLimitedAPI {
  constructor(apiKey, limit = 3, windowMs = 60000) {
    this.apiKey = apiKey;
    this.limit = limit;
    this.windowMs = windowMs;
    this.requests = [];
  }

  async createInstitute(data) {
    // Remove old requests outside window
    const now = Date.now();
    this.requests = this.requests.filter(time => now - time < this.windowMs);

    // Check if limit reached
    if (this.requests.length >= this.limit) {
      const oldestRequest = this.requests[0];
      const waitTime = this.windowMs - (now - oldestRequest);
      throw new Error(`Rate limit reached. Wait ${Math.ceil(waitTime / 1000)}s`);
    }

    // Make request
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });

    this.requests.push(now);
    return response.json();
  }
}

// Usage
const api = new RateLimitedAPI('YOUR_API_KEY');
try {
  const result = await api.createInstitute(data);
} catch (error) {
  console.error(error.message);
}
```

---

## 📈 Monitoring and Analytics

### Track Your Usage

```javascript
class APIAnalytics {
  constructor() {
    this.stats = {
      totalRequests: 0,
      successCount: 0,
      errorCount: 0,
      errors: []
    };
  }

  logRequest(result, duration) {
    this.stats.totalRequests++;

    if (result.success) {
      this.stats.successCount++;
    } else {
      this.stats.errorCount++;
      this.stats.errors.push({
        timestamp: new Date(),
        message: result.message,
        requestId: result.requestId
      });
    }

    console.log(`📊 API Stats:`, {
      total: this.stats.totalRequests,
      success: this.stats.successCount,
      errors: this.stats.errorCount,
      duration: `${duration}ms`
    });
  }

  getReport() {
    return {
      ...this.stats,
      successRate: (this.stats.successCount / this.stats.totalRequests * 100).toFixed(2) + '%'
    };
  }
}

// Usage
const analytics = new APIAnalytics();

async function createInstitute(data) {
  const startTime = Date.now();
  const result = await /* API call */;
  const duration = Date.now() - startTime;
  
  analytics.logRequest(result, duration);
  return result;
}

// Get report
console.log(analytics.getReport());
```

---

## 🆘 Support

### Getting Help

1. **Check this documentation first**
2. **Review error message and request ID**
3. **Check API status:** https://status.your-api.com
4. **Contact support:**
   - Email: api-support@your-domain.com
   - Include: Request ID, timestamp, error message

### Reporting Issues

When reporting issues, include:
```
Subject: API Issue - [Brief Description]

Request ID: uuid-from-response
Timestamp: 2025-01-20T10:30:00.000Z
Endpoint: POST /api/public/institutes
Status Code: 400
Error Message: [Full error message]

Request Body:
[Sanitized request body]

Expected Behavior:
[What you expected]

Actual Behavior:
[What happened]
```

---

## 📝 Changelog

### Version 2.0.0 (2025-01-20)
- ✅ Added auto-generated institute codes (INST-YYYYMMDD-XXX)
- ✅ Made all images optional
- ✅ Added required system contact fields (phone + email)
- ✅ Implemented rate limiting (3/min for creation, 10/min for uploads)
- ✅ Enhanced logging with request IDs
- ✅ Improved security and abuse prevention

### Version 1.0.0 (2025-01-15)
- ✅ Initial public API release
- ✅ API key authentication
- ✅ File upload with signed URLs
- ✅ Basic validation and error handling

---

## 📜 License

This API is proprietary. Unauthorized use, distribution, or reverse engineering is prohibited.

---

## 🎓 Quick Reference Card

```
BASE URL: https://your-api.com/public

AUTHENTICATION:
Header: Authorization: Bearer YOUR_API_KEY

RATE LIMITS:
- Create Institute: 3/min
- File Upload: 10/min
- General: 5/min

REQUIRED FIELDS:
✓ name
✓ email (unique)
✓ systemContactPhoneNumber (+947XXXXXXXX)
✓ systemContactEmail

OPTIONAL FIELDS:
□ Basic Info: shortName, phone, pinCode
□ Location: address, city, state, district, province, country
□ Branding: logoUrl, loadingGifUrl, imageUrl
□ Theme: primaryColorCode, secondaryColorCode
□ About: vision, mission
□ Social: websiteUrl, facebookPageUrl, youtubeChannelUrl

ENDPOINTS:
POST   /institutes                      Create institute
POST   /upload/generate-signed-url      Get upload URL
GET    /upload/get-signed-url           Get upload URL (query params)
POST   /upload/verify-and-publish       Verify upload

FILE LIMITS:
- Max size: 5MB
- Types: jpg, png, gif, webp, svg
- Expiry: 10 minutes
- Upload: AWS S3 multipart/form-data

RESPONSE FIELDS:
All fields returned including: id, code, type, isActive, isDefault,
createdAt, updatedAt (sensitive fields partially masked)
```

---

**End of Documentation**

For the latest updates, visit: https://docs.your-api.com/public-institute-api
