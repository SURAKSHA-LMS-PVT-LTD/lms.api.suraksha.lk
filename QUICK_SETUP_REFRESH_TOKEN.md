# 🚀 Quick Setup Guide - Refresh Token Implementation

## ✅ What Was Implemented

### Backend Changes (Completed)

1. **✅ Environment Variables**
   - Added `JWT_REFRESH_SECRET` to .env.example
   - Added `JWT_REFRESH_EXPIRES_IN` to .env.example
   - Updated auth.config.ts with refresh token configuration

2. **✅ API Endpoint**
   - Created `POST /v2/auth/refresh` endpoint
   - Implements automatic token refresh with cookie management
   - Includes rate limiting (10 attempts per minute)

3. **✅ Security Features**
   - Refresh tokens stored in httpOnly cookies (XSS protection)
   - One-time use refresh tokens (old token revoked on refresh)
   - Automatic cleanup for inactive users
   - IP address and user agent tracking

## 📝 Required Setup Steps

### Step 1: Update .env File

```bash
# Add these to your .env file

# Generate JWT_REFRESH_SECRET (MUST be different from JWT_SECRET!)
# Run: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
JWT_REFRESH_SECRET=your_generated_refresh_secret_here

# Set expiration times
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
```

### Step 2: Verify CORS Configuration

Ensure your CORS configuration allows credentials:

```typescript
// In main.ts or app.module.ts
app.enableCors({
  origin: ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true,  // ✅ Required for cookies!
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});
```

### Step 3: Test the Implementation

```bash
# 1. Test login
curl -X POST http://localhost:3000/v2/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "password"}' \
  -c cookies.txt

# 2. Test refresh
curl -X POST http://localhost:3000/v2/auth/refresh \
  -H "Content-Type: application/json" \
  -b cookies.txt
```

## 📚 Documentation Files

1. **[REFRESH_TOKEN_IMPLEMENTATION.md](./REFRESH_TOKEN_IMPLEMENTATION.md)** - Comprehensive guide
   - Environment setup
   - API endpoints documentation
   - Frontend implementation examples (React/TypeScript)
   - Security best practices
   - Error handling
   - Testing guide
   - Troubleshooting

2. This file (QUICK_SETUP.md) - Quick reference

## 🎯 Frontend Integration Points

### Existing v2 Login Endpoint
- **Endpoint**: `POST /v2/auth/login`
- **Returns**: Access token (15 min) + refresh token in cookie
- **Already implemented**: Yes ✅

### New Refresh Endpoint
- **Endpoint**: `POST /v2/auth/refresh`
- **Input**: Refresh token (from cookie or body)
- **Returns**: New access token (15 min) + new refresh token in cookie
- **Newly implemented**: Yes ✅

## 🔑 Key Differences from v1

| Feature | v1 (/auth/login) | v2 (/v2/auth/login + /v2/auth/refresh) |
|---------|------------------|----------------------------------------|
| Access Token Lifetime | 7 days | 15 minutes |
| Refresh Token | ❌ Not available | ✅ 7 days (httpOnly cookie) |
| Auto Token Refresh | ❌ Manual re-login | ✅ Automatic |
| XSS Protection | ⚠️ Limited | ✅ Full (httpOnly cookies) |
| Security Level | Medium | High |

## 🎨 Frontend Code Template

### Minimal Implementation

```typescript
// 1. Login
const login = async (email: string, password: string) => {
  const response = await fetch('http://localhost:3000/v2/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',  // ⭐ IMPORTANT
    body: JSON.stringify({ email, password }),
  });
  
  const data = await response.json();
  localStorage.setItem('access_token', data.access_token);
  return data;
};

// 2. API Call with Auto-Refresh
const apiCall = async (endpoint: string, options: RequestInit = {}) => {
  const token = localStorage.getItem('access_token');
  
  let response = await fetch(`http://localhost:3000${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    },
    credentials: 'include',  // ⭐ IMPORTANT
  });

  // If 401, refresh token and retry
  if (response.status === 401) {
    const refreshResponse = await fetch('http://localhost:3000/v2/auth/refresh', {
      method: 'POST',
      credentials: 'include',  // ⭐ IMPORTANT
    });

    if (refreshResponse.ok) {
      const { access_token } = await refreshResponse.json();
      localStorage.setItem('access_token', access_token);
      
      // Retry original request
      response = await fetch(`http://localhost:3000${endpoint}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${access_token}`,
          ...options.headers,
        },
        credentials: 'include',
      });
    } else {
      // Refresh failed, redirect to login
      localStorage.clear();
      window.location.href = '/login';
      throw new Error('Session expired');
    }
  }

  return response.json();
};

// 3. Usage
const getUserProfile = async () => {
  return await apiCall('/users/me', { method: 'GET' });
};
```

## ⚠️ Important Notes

1. **Cookie Requirements**
   - Frontend must use `credentials: 'include'` in all fetch calls
   - Backend must enable CORS with `credentials: true`
   - Works best on same domain or proper CORS setup

2. **Security**
   - Never store refresh token in localStorage
   - Refresh token is automatically managed in httpOnly cookie
   - Access token can be in localStorage (short-lived)

3. **Token Expiration**
   - Access token: 15 minutes (configurable)
   - Refresh token: 7 days (configurable)
   - Refresh token is one-time use (revoked after refresh)

4. **Rate Limits**
   - Login: 5 attempts per 15 minutes
   - Refresh: 10 attempts per minute

## 🐛 Common Issues

### Issue: "Refresh token not provided"
**Solution**: Add `credentials: 'include'` to fetch options

### Issue: CORS errors
**Solution**: Enable CORS with `credentials: true` in backend

### Issue: Cookies not working locally
**Solution**: 
- Use `localhost` (not 127.0.0.1)
- Check `NODE_ENV` is set correctly
- Browser devtools → Application → Cookies

## ✅ Deployment Checklist

- [ ] Added JWT_REFRESH_SECRET to .env (different from JWT_SECRET)
- [ ] Set JWT_EXPIRES_IN=15m
- [ ] Set JWT_REFRESH_EXPIRES_IN=7d
- [ ] Verified CORS allows credentials
- [ ] Updated frontend to use v2 endpoints
- [ ] Added `credentials: 'include'` to all API calls
- [ ] Implemented automatic token refresh on 401
- [ ] Tested login flow
- [ ] Tested refresh flow
- [ ] Tested expired token handling
- [ ] Verified cookies are set correctly

## 📖 Next Steps

1. Read [REFRESH_TOKEN_IMPLEMENTATION.md](./REFRESH_TOKEN_IMPLEMENTATION.md) for detailed implementation
2. Update frontend to use v2 endpoints
3. Test thoroughly in development
4. Deploy to production

**Documentation Created**: January 9, 2026
**Ready for Integration**: Yes ✅
