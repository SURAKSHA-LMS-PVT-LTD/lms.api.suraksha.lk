# `/auth/me` Endpoint Documentation

## Overview
The `/auth/me` endpoint provides secure access to the authenticated user's profile information based on their JWT token.

## Endpoint Details

**URL:** `GET /auth/me`  
**Authentication:** Required (JWT Bearer Token)  
**Authorization:** Any authenticated user

## Security Features

### ✅ Implemented Security Measures

1. **JWT Authentication Required**
   - Uses `@UseGuards(JwtAuthGuard)` decorator
   - Validates JWT token signature and expiration
   - Rejects requests without valid authentication

2. **No Password Exposure**
   - Password field is explicitly excluded from all queries
   - Uses TypeORM `select` to only fetch non-sensitive fields

3. **User ID from JWT Only**
   - User ID is extracted from verified JWT payload (`req.user.s`)
   - No user-provided parameters accepted (prevents user enumeration)
   - Cannot access other users' profiles

4. **Cache-First Architecture**
   - Primary: Retrieves from Redis cache (fast, ~15ms)
   - Fallback: Database query if cache miss (~200ms)
   - Automatically caches results for future requests

5. **Error Handling**
   - Returns `401 Unauthorized` for invalid tokens
   - Returns `401 Unauthorized` if user not found
   - Proper error logging without exposing sensitive information

## Request Format

```http
GET /auth/me HTTP/1.1
Host: localhost:8080
Authorization: Bearer <your-jwt-token>
```

## Response Format

### Success Response (200 OK)

```json
{
  "success": true,
  "data": {
    "id": "12345",
    "firstName": "John",
    "lastName": "Doe",
    "email": "john.doe@example.com",
    "phoneNumber": "+94771234567",
    "userType": "STUDENT",
    "dateOfBirth": "2005-01-15",
    "gender": "M",
    "nic": "200512345678",
    "birthCertificateNo": null,
    "addressLine1": "123 Main Street",
    "addressLine2": "Apartment 4B",
    "city": "Colombo",
    "district": "COLOMBO",
    "province": "WESTERN",
    "postalCode": "00100",
    "country": "SRI_LANKA",
    "imageUrl": "https://storage.googleapis.com/...",
    "idUrl": "https://storage.googleapis.com/...",
    "isActive": true,
    "subscriptionPlan": "FREE",
    "paymentExpiresAt": null,
    "telegramId": "123456789",
    "rfid": "ABC123",
    "language": "E",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-11-22T00:00:00.000Z"
  }
}
```

### Error Responses

#### 401 Unauthorized (Missing/Invalid Token)
```json
{
  "statusCode": 401,
  "message": "Unauthorized"
}
```

#### 401 Unauthorized (User Not Found)
```json
{
  "statusCode": 401,
  "message": "User not found"
}
```

## Response Fields

| Field | Type | Description | Cache Availability |
|-------|------|-------------|-------------------|
| `id` | string | User ID | ✅ |
| `firstName` | string | First name | ✅ |
| `lastName` | string | Last name | ✅ |
| `email` | string | Email address | ✅ |
| `phoneNumber` | string? | Phone number | ✅ |
| `userType` | string | User role (STUDENT, TEACHER, etc.) | ✅ |
| `dateOfBirth` | Date? | Birth date | ✅ |
| `gender` | string? | Gender (M/F/O) | ✅ |
| `nic` | string? | National ID | ✅ |
| `birthCertificateNo` | string? | Birth certificate number | ✅ |
| `addressLine1` | string? | Address line 1 | ✅ |
| `addressLine2` | string? | Address line 2 | ✅ |
| `city` | string? | City | ✅ |
| `district` | string? | District | ✅ |
| `province` | string? | Province | ✅ |
| `postalCode` | string? | Postal code | ✅ |
| `country` | string? | Country | ✅ |
| `imageUrl` | string? | Profile image URL | ✅ |
| `idUrl` | string? | ID card image URL | ❌ DB only |
| `isActive` | boolean | Account status | ✅ |
| `subscriptionPlan` | string? | Subscription plan | ❌ DB only |
| `paymentExpiresAt` | Date? | Payment expiration | ❌ DB only |
| `telegramId` | string? | Telegram ID | ❌ DB only |
| `rfid` | string? | RFID tag | ❌ DB only |
| `language` | string? | Preferred language (S/E/T) | ❌ DB only |
| `createdAt` | Date | Account creation date | ✅ |
| `updatedAt` | Date | Last update date | ✅ |

**Note:** Fields marked "❌ DB only" return `undefined` when data comes from cache. Full data is returned on cache miss (database query).

## Usage Examples

### JavaScript (Fetch API)
```javascript
const token = localStorage.getItem('authToken');

fetch('http://localhost:8080/auth/me', {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
})
  .then(response => response.json())
  .then(data => {
    console.log('User Profile:', data.data);
  })
  .catch(error => {
    console.error('Error:', error);
  });
```

### Axios
```javascript
import axios from 'axios';

const getProfile = async () => {
  try {
    const response = await axios.get('http://localhost:8080/auth/me', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log('User Profile:', response.data.data);
    return response.data.data;
  } catch (error) {
    console.error('Error fetching profile:', error);
    throw error;
  }
};
```

### cURL
```bash
curl -X GET http://localhost:8080/auth/me \
  -H "Authorization: Bearer YOUR_JWT_TOKEN_HERE" \
  -H "Content-Type: application/json"
```

## Performance Metrics

### Cache Hit (Typical)
- Response Time: ~15-30ms
- Database Queries: 0
- Cache Queries: 1
- Best for: Frequent profile access

### Cache Miss (Fallback)
- Response Time: ~150-250ms
- Database Queries: 1
- Cache Queries: 1 + 1 (set cache)
- Occurs: First access, cache expiration, cache unavailable

## Security Best Practices

### ✅ DO
- Always include the JWT token in Authorization header
- Store tokens securely (HttpOnly cookies or secure storage)
- Handle 401 errors by redirecting to login
- Clear tokens on logout

### ❌ DON'T
- Never expose JWT tokens in URLs
- Don't store tokens in localStorage for sensitive apps
- Don't share tokens between users
- Don't ignore 401 responses

## Integration with Frontend

### React Example
```jsx
import { useState, useEffect } from 'react';
import axios from 'axios';

function UserProfile() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const token = localStorage.getItem('authToken');
        const response = await axios.get('http://localhost:8080/auth/me', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        setUser(response.data.data);
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to load profile');
        // Redirect to login on 401
        if (err.response?.status === 401) {
          window.location.href = '/login';
        }
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, []);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div>
      <h1>{user.firstName} {user.lastName}</h1>
      <p>Email: {user.email}</p>
      <p>User Type: {user.userType}</p>
      {user.imageUrl && <img src={user.imageUrl} alt="Profile" />}
    </div>
  );
}
```

## Development vs Production

### Development Mode
- CORS: Accepts requests from any origin
- Origin validation: Disabled
- Error messages: Detailed for debugging

### Production Mode
- CORS: Restricted to whitelisted origins only
- Origin validation: Strictly enforced
- Error messages: Generic for security
- Rate limiting: Enabled
- HTTPS: Required

## Testing

### Manual Testing with Swagger
1. Navigate to `http://localhost:8080/api-docs`
2. Find the `GET /auth/me` endpoint
3. Click "Try it out"
4. Enter your JWT token in the Authorization field
5. Click "Execute"

### Automated Testing
```typescript
describe('GET /auth/me', () => {
  it('should return user profile for authenticated user', async () => {
    const response = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${validToken}`)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveProperty('id');
    expect(response.body.data).toHaveProperty('email');
    expect(response.body.data).not.toHaveProperty('password');
  });

  it('should return 401 without token', async () => {
    await request(app.getHttpServer())
      .get('/auth/me')
      .expect(401);
  });
});
```

## Related Endpoints

- `POST /auth/login` - Get JWT token
- `POST /auth/change-password-authenticated` - Change password
- `GET /users/profile` - Alternative user profile endpoint
- `PATCH /users/profile` - Update user profile

## Changelog

### v1.0.0 (2024-11-22)
- ✅ Initial implementation
- ✅ JWT authentication required
- ✅ Cache-first architecture
- ✅ Secure password exclusion
- ✅ Comprehensive error handling
- ✅ Development/Production CORS handling
