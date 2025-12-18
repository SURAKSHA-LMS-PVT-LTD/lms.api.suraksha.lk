# API Key Authentication for Comprehensive User Creation

## Overview
This document explains how to use the special API key authentication feature for the comprehensive user creation endpoint. This allows external systems and automated processes to create users without requiring JWT authentication and role-based access control.

---

## 🔑 Feature Summary

- **Endpoint**: `POST /users/comprehensive`
- **Purpose**: Create users across multiple tables (users, students, parents) in a single API call
- **Authentication Options**:
  1. **JWT Bearer Token** (Standard - subject to role checks)
  2. **Special API Key** (External systems - bypasses role checks)

---

## 🚀 Quick Start

### Step 1: Generate API Key

Generate a secure random API key (64 characters recommended):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Example output:
```
a7f3c8e2d9b4f6a1c3e5d8b2f4a6c9e1d3b5f7a9c2e4d6b8f1a3c5e7d9b2f4a6
```

### Step 2: Add to Environment Variables

Add the generated key to your `.env` file:

```bash
# Special API Key for External System Access
SPECIAL_API_KEY=a7f3c8e2d9b4f6a1c3e5d8b2f4a6c9e1d3b5f7a9c2e4d6b8f1a3c5e7d9b2f4a6
```

### Step 3: Use in API Requests

Use the API key as a Bearer token:

```bash
curl -X POST https://your-api.com/users/comprehensive \
  -H "Authorization: Bearer a7f3c8e2d9b4f6a1c3e5d8b2f4a6c9e1d3b5f7a9c2e4d6b8f1a3c5e7d9b2f4a6" \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "John",
    "lastName": "Doe",
    "email": "john.doe@example.com",
    "phoneNumber": "+94771234567",
    "userType": "USER",
    "gender": "MALE",
    "district": "COLOMBO",
    "province": "WESTERN",
    "country": "Sri Lanka"
  }'
```

---

## 📚 Authentication Methods Comparison

| Feature | JWT Bearer Token | Special API Key |
|---------|-----------------|-----------------|
| **Header** | `Authorization: Bearer <JWT_TOKEN>` | `Authorization: Bearer <SPECIAL_API_KEY>` |
| **Access Control** | Role-based (SUPERADMIN, ORG_MANAGER, INSTITUTE_ADMIN, TEACHER) | Full access - bypasses all role checks |
| **Use Case** | Authenticated users within the system | External systems, integrations, automation |
| **Expiration** | Yes (configurable, default 7 days) | No expiration |
| **Rate Limiting** | Yes (global default: 100 req/min) | Yes (same rate limits apply) |
| **Security** | User-specific permissions | System-wide permissions |

---

## 🔐 Security Considerations

### DO ✅
- ✅ Store API key in environment variables (never in code)
- ✅ Use HTTPS in production
- ✅ Rotate API key periodically (quarterly recommended)
- ✅ Monitor API key usage logs
- ✅ Use different API keys for different environments (dev, staging, prod)
- ✅ Restrict network access to trusted IPs if possible
- ✅ Generate API keys with high entropy (minimum 32 bytes)

### DON'T ❌
- ❌ Commit API key to version control
- ❌ Share API key via email or chat
- ❌ Use same API key across multiple applications
- ❌ Expose API key in client-side code
- ❌ Use weak or predictable API keys
- ❌ Store API key in plaintext files
- ❌ Log API key values (mask in logs)

---

## 📖 API Documentation

### Endpoint Details

**URL**: `POST /users/comprehensive`

**Authentication**: 
- Bearer Token (JWT or API Key)

**Content-Type**: 
- `application/json` OR 
- `multipart/form-data`

### User Types & Table Creation

| userType | Tables Created | Required Data |
|----------|---------------|---------------|
| `USER` | users + students + parents | All fields + studentData + parentData |
| `USER_WITHOUT_PARENT` | users + students | All fields + studentData |
| `USER_WITHOUT_STUDENT` | users + parents | All fields + parentData |
| `SUPERADMIN` | users only | All fields |
| `ORGANIZATION_MANAGER` | users only | All fields |

### Request Example (JSON)

```json
{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john.doe@example.com",
  "phoneNumber": "+94771234567",
  "userType": "USER",
  "gender": "MALE",
  "dateOfBirth": "2010-05-15",
  "nic": "201012345678",
  "addressLine1": "123 Main Street",
  "city": "Colombo",
  "district": "COLOMBO",
  "province": "WESTERN",
  "postalCode": "00100",
  "country": "Sri Lanka",
  "imageUrl": "https://example.com/profile.jpg",
  "isActive": true,
  "studentData": {
    "studentId": "STU-2024-001",
    "emergencyContact": "+94771234567",
    "bloodGroup": "O_POSITIVE"
  },
  "parentData": {
    "fatherPhoneNumber": "+94771111111",
    "motherPhoneNumber": "+94772222222",
    "occupation": "ENGINEER",
    "workplace": "ABC Corporation"
  }
}
```

### Response Example

```json
{
  "user": {
    "id": "123",
    "firstName": "John",
    "lastName": "Doe",
    "email": "jo***e@example.com",
    "phoneNumber": "+947*****567",
    "userType": "USER",
    "gender": "MALE",
    "isActive": true,
    "createdAt": "2024-11-07T10:30:00Z"
  },
  "student": {
    "userId": "123",
    "studentId": "STU-2024-001",
    "emergencyContact": "+94771234567",
    "bloodGroup": "O_POSITIVE"
  },
  "parent": {
    "id": "456",
    "userId": "123",
    "occupation": "ENGINEER",
    "workplace": "ABC Corporation"
  },
  "summary": {
    "tablesCreated": ["users", "students", "parents"],
    "userType": "USER",
    "totalTablesAffected": 3
  }
}
```

---

## 🧪 Testing

### Test API Key Authentication

```bash
# 1. Test with valid API key (should succeed)
curl -X POST http://localhost:3000/users/comprehensive \
  -H "Authorization: Bearer YOUR_SPECIAL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"firstName":"Test","lastName":"User","email":"test@example.com","phoneNumber":"+94771234567","userType":"USER_WITHOUT_PARENT","gender":"MALE","district":"COLOMBO","province":"WESTERN","country":"Sri Lanka","studentData":{"studentId":"TEST-001"}}'

# 2. Test with invalid API key (should return 401)
curl -X POST http://localhost:3000/users/comprehensive \
  -H "Authorization: Bearer invalid_key_here" \
  -H "Content-Type: application/json" \
  -d '{"firstName":"Test"}'

# 3. Test with no authorization (should return 401)
curl -X POST http://localhost:3000/users/comprehensive \
  -H "Content-Type: application/json" \
  -d '{"firstName":"Test"}'
```

### Test JWT Authentication (Fallback)

```bash
# Get JWT token first
JWT_TOKEN=$(curl -X POST http://localhost:3000/v2/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"password"}' \
  | jq -r '.access_token')

# Use JWT token
curl -X POST http://localhost:3000/users/comprehensive \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"firstName":"Test","lastName":"User","email":"test2@example.com","phoneNumber":"+94771234568","userType":"USER_WITHOUT_PARENT","gender":"MALE","district":"COLOMBO","province":"WESTERN","country":"Sri Lanka","studentData":{"studentId":"TEST-002"}}'
```

---

## 🔄 How It Works

### Authentication Flow

```
1. Request arrives with Authorization header
   ↓
2. ApiKeyOrJwtGuard checks Authorization header
   ↓
3. Extract Bearer token
   ↓
4. Check if token matches SPECIAL_API_KEY
   ↓
   ├── YES: Set user.isApiKeyAuth = true → Skip role checks → Allow access
   │
   └── NO: Fall back to JWT validation
       ↓
       ├── Valid JWT: Check roles via FlexibleAccessGuard
       │   ├── Has required role: Allow access
       │   └── No required role: Deny (403 Forbidden)
       │
       └── Invalid JWT: Deny (401 Unauthorized)
```

### Code Implementation

**Guard Check (api-key-or-jwt.guard.ts)**:
```typescript
const specialApiKey = this.configService.get<string>('SPECIAL_API_KEY');

if (specialApiKey && token === specialApiKey) {
  // API Key authentication successful
  request.user = {
    isApiKeyAuth: true,
    authType: 'API_KEY',
    s: 'api-key-user',
    userType: 'API_KEY',
  };
  return true;
}

// Fall back to JWT
return super.canActivate(context);
```

**Role Bypass (flexible-access.guard.ts)**:
```typescript
// If authenticated via API key, skip all role checks
if (user.isApiKeyAuth || user.authType === 'API_KEY') {
  return true;
}
```

---

## 🚨 Error Responses

### 401 Unauthorized - No Authorization Header
```json
{
  "statusCode": 401,
  "message": "No authorization header provided",
  "error": "Unauthorized"
}
```

### 401 Unauthorized - Invalid API Key
```json
{
  "statusCode": 401,
  "message": "Invalid or expired JWT token",
  "error": "Unauthorized"
}
```

### 400 Bad Request - Validation Failed
```json
{
  "statusCode": 400,
  "message": "studentData is required for USER type",
  "error": "Bad Request"
}
```

### 409 Conflict - Duplicate User
```json
{
  "statusCode": 409,
  "message": "Email already exists",
  "error": "Conflict"
}
```

---

## 🔧 Configuration

### Environment Variables

**Required**:
```bash
SPECIAL_API_KEY=your_secure_api_key_here
```

**Optional (affects this endpoint)**:
```bash
# Rate limiting (default: 100 requests per minute)
THROTTLE_LIMIT=100
THROTTLE_TTL=60000

# Database configuration (required for user creation)
DB_HOST=localhost
DB_PORT=3306
DB_USERNAME=lms_user
DB_PASSWORD=secure_password
DB_DATABASE=lms_database
```

### Key Rotation Process

1. Generate new API key:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

2. Update environment variable:
```bash
SPECIAL_API_KEY=new_key_here
```

3. Restart application:
```bash
npm run start:prod
```

4. Update all external systems with new key

5. Monitor old key usage (should be zero)

6. Document rotation in change log

---

## 📊 Monitoring & Logging

### Recommended Monitoring

1. **API Key Usage Metrics**:
   - Total requests using API key
   - Success rate
   - Error rate
   - Response times

2. **Security Monitoring**:
   - Failed authentication attempts
   - Unusual usage patterns (time/volume)
   - Geographic anomalies (if IP tracking enabled)

### Log Examples

```
[ApiKeyOrJwtGuard] API key authentication successful for comprehensive user creation
[ApiKeyOrJwtGuard] Invalid API key attempt from IP 192.168.1.100
[FlexibleAccessGuard] Bypassing role checks for API key authentication
[UsersController] User created via API key: userId=123, userType=USER
```

---

## 🎯 Use Cases

### 1. Student Management System Integration
External school management system automatically creates student accounts:
```javascript
const axios = require('axios');

async function createStudent(studentData) {
  const response = await axios.post('https://lms-api.com/users/comprehensive', {
    ...studentData,
    userType: 'USER_WITHOUT_PARENT'
  }, {
    headers: {
      'Authorization': `Bearer ${process.env.LMS_API_KEY}`,
      'Content-Type': 'application/json'
    }
  });
  
  return response.data;
}
```

### 2. Bulk User Import Script
Administrative script for importing users from CSV:
```python
import requests
import csv

API_KEY = os.environ['SPECIAL_API_KEY']
headers = {
    'Authorization': f'Bearer {API_KEY}',
    'Content-Type': 'application/json'
}

with open('users.csv') as f:
    reader = csv.DictReader(f)
    for row in reader:
        response = requests.post(
            'https://lms-api.com/users/comprehensive',
            json=row,
            headers=headers
        )
        print(f"Created user: {response.json()['user']['id']}")
```

### 3. Mobile App Backend Integration
Mobile app backend creates users without managing JWT tokens:
```typescript
export async function registerStudent(data: StudentRegistration) {
  const response = await fetch('https://lms-api.com/users/comprehensive', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.SPECIAL_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      ...data,
      userType: 'USER'
    })
  });
  
  return response.json();
}
```

---

## 📋 Checklist for Production Deployment

- [ ] Generate strong API key (minimum 64 characters)
- [ ] Add `SPECIAL_API_KEY` to production `.env` file
- [ ] Never commit `.env` file to version control
- [ ] Use different API keys for dev/staging/prod
- [ ] Enable HTTPS in production
- [ ] Set up API key rotation schedule (quarterly)
- [ ] Configure rate limiting appropriately
- [ ] Set up monitoring and alerting
- [ ] Document API key owner/purpose
- [ ] Implement IP whitelisting (if applicable)
- [ ] Test API key authentication before go-live
- [ ] Train team on API key security
- [ ] Create incident response plan for key compromise

---

## 🆘 Troubleshooting

### Issue: "No authorization header provided"
**Solution**: Add `Authorization: Bearer <key>` header to request

### Issue: "Invalid or expired JWT token"
**Solution**: 
1. Verify API key matches `.env` file exactly
2. Check for extra spaces/newlines in key
3. Ensure key is being read from environment correctly

### Issue: API key works locally but not in production
**Solution**:
1. Verify `.env` file is deployed to production
2. Check environment variable is loaded (`console.log(process.env.SPECIAL_API_KEY)`)
3. Restart application after updating environment

### Issue: Rate limiting blocking requests
**Solution**:
1. Check rate limit settings (`THROTTLE_LIMIT`, `THROTTLE_TTL`)
2. Implement request queuing/throttling on client side
3. Consider increasing limits for API key authentication

---

## 📞 Support

For issues or questions:
1. Check this documentation
2. Review application logs
3. Test with curl examples above
4. Contact: LMS Development Team

---

**Last Updated**: November 7, 2024  
**Version**: 1.0  
**Maintainer**: LMS Development Team
