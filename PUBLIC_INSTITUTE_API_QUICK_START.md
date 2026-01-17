# 🚀 Public Institute API - Quick Start Guide

## 🔑 Get Your API Key
Contact system administrator: api-support@suraksha.lk

---

## 📋 3-Step Process

### STEP 1: Upload Logo (Optional)

```bash
# 1.1: Get upload URL
curl "https://api.suraksha.lk/public/upload/get-signed-url?folder=institute-images&fileName=logo.png&contentType=image/png&fileSize=1024000" \
  -H "x-api-key: YOUR_API_KEY"

# Save the uploadUrl and relativePath from response

# 1.2: Upload file
curl -X PUT "UPLOAD_URL_FROM_STEP_1" \
  -H "Content-Type: image/png" \
  --data-binary @logo.png

# 1.3: Make file public
curl -X POST "https://api.suraksha.lk/public/upload/verify-and-publish" \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{"relativePath": "RELATIVE_PATH_FROM_STEP_1"}'

# Save the publicUrl for step 2
```

---

### STEP 2: Create Institute

```bash
curl -X POST "https://api.suraksha.lk/public/institutes" \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{
    "name": "Cambridge International School",
    "code": "CIS001",
    "email": "admin@cambridge-school.edu",
    "logoUrl": "PUBLIC_URL_FROM_STEP_1",
    "phone": "+94712345678",
    "city": "Colombo",
    "country": "Sri Lanka"
  }'
```

---

## ⚡ JavaScript Example

```javascript
const API_KEY = 'YOUR_API_KEY';
const BASE_URL = 'https://api.suraksha.lk';

// Step 1: Upload logo
async function uploadLogo(file) {
  // Get signed URL
  const signedUrl = await fetch(
    `${BASE_URL}/public/upload/get-signed-url?` +
    `folder=institute-images&` +
    `fileName=${file.name}&` +
    `contentType=${file.type}&` +
    `fileSize=${file.size}`,
    { headers: { 'x-api-key': API_KEY } }
  ).then(r => r.json());
  
  // Upload file
  await fetch(signedUrl.uploadUrl, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': file.type }
  });
  
  // Verify and publish
  const verified = await fetch(
    `${BASE_URL}/public/upload/verify-and-publish`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY
      },
      body: JSON.stringify({ relativePath: signedUrl.relativePath })
    }
  ).then(r => r.json());
  
  return verified.publicUrl;
}

// Step 2: Create institute
async function createInstitute(data) {
  const response = await fetch(`${BASE_URL}/public/institutes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY
    },
    body: JSON.stringify(data)
  });
  
  return response.json();
}

// Usage
const logoFile = document.getElementById('logo').files[0];
const logoUrl = await uploadLogo(logoFile);

const result = await createInstitute({
  name: 'Cambridge International School',
  code: 'CIS001',
  email: 'admin@cambridge-school.edu',
  logoUrl: logoUrl,
  phone: '+94712345678',
  city: 'Colombo',
  country: 'Sri Lanka'
});

console.log('Institute created:', result);
```

---

## ⚡ React Example

```jsx
import React, { useState } from 'react';
import axios from 'axios';

const API_KEY = 'YOUR_API_KEY';
const BASE_URL = 'https://api.suraksha.lk';

function InstituteRegistration() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      const formData = new FormData(e.target);
      const logoFile = formData.get('logo');
      
      // Step 1: Upload logo if provided
      let logoUrl = null;
      if (logoFile && logoFile.size > 0) {
        // Get signed URL
        const { data: signedUrl } = await axios.get(
          `${BASE_URL}/public/upload/get-signed-url`,
          {
            params: {
              folder: 'institute-images',
              fileName: logoFile.name,
              contentType: logoFile.type,
              fileSize: logoFile.size,
            },
            headers: { 'x-api-key': API_KEY },
          }
        );
        
        // Upload file
        await axios.put(signedUrl.uploadUrl, logoFile, {
          headers: { 'Content-Type': logoFile.type },
        });
        
        // Verify
        const { data: verified } = await axios.post(
          `${BASE_URL}/public/upload/verify-and-publish`,
          { relativePath: signedUrl.relativePath },
          { headers: { 'x-api-key': API_KEY } }
        );
        
        logoUrl = verified.publicUrl;
      }
      
      // Step 2: Create institute
      const { data: result } = await axios.post(
        `${BASE_URL}/public/institutes`,
        {
          name: formData.get('name'),
          code: formData.get('code'),
          email: formData.get('email'),
          phone: formData.get('phone'),
          logoUrl: logoUrl,
          city: formData.get('city'),
          country: formData.get('country'),
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': API_KEY,
          },
        }
      );
      
      alert(`Institute created successfully! ID: ${result.data.id}`);
    } catch (err) {
      setError(err.response?.data?.message || err.message);
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <form onSubmit={handleSubmit}>
      <input name="name" placeholder="Institute Name" required />
      <input name="code" placeholder="Code (e.g., CIS001)" required />
      <input name="email" type="email" placeholder="Email" required />
      <input name="phone" placeholder="Phone" />
      <input name="city" placeholder="City" />
      <input name="country" placeholder="Country" />
      <input name="logo" type="file" accept="image/*" />
      
      <button type="submit" disabled={loading}>
        {loading ? 'Creating...' : 'Create Institute'}
      </button>
      
      {error && <p style={{color: 'red'}}>{error}</p>}
    </form>
  );
}
```

---

## 🔒 Security Notes

1. **Never expose API key in client-side code**
   - Use backend proxy for production
   - Store API key in environment variables

2. **File size limits**
   - Max 5MB per image
   - Allowed types: JPG, PNG, WEBP, SVG

3. **Code format**
   - Uppercase letters, numbers, hyphens, underscores only
   - 3-50 characters
   - Example: `CIS001`, `SCHOOL-2024`

---

## ❓ Common Errors

### 401 Unauthorized
```json
{ "statusCode": 401, "message": "Invalid API key" }
```
**Fix:** Check your API key is correct

### 409 Conflict
```json
{ "statusCode": 409, "message": "Institute with this code already exists" }
```
**Fix:** Use a different institute code

### 400 Bad Request (File Upload)
```json
{ "statusCode": 400, "message": "File size exceeds maximum allowed size of 5MB" }
```
**Fix:** Compress your image before uploading

---

## 📞 Support

- **Email:** api-support@suraksha.lk
- **Docs:** https://docs.suraksha.lk/api
- **Status:** https://status.suraksha.lk
