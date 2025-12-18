# 🎯 Quick Reference: User Creation with Image URLs

## ✅ What Changed?

The `POST /users/comprehensive` endpoint now accepts **image URLs** in addition to file uploads.

---

## 🚀 Two Ways to Create Users

### Method 1: JSON with URLs (NEW ✨)
```json
POST /users/comprehensive
Content-Type: application/json

{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john@example.com",
  "phoneNumber": "+94771234567",
  "userType": "USER",
  "gender": "MALE",
  "district": "COLOMBO",
  "province": "WESTERN",
  "country": "Sri Lanka",
  
  "imageUrl": "https://example.com/profile.jpg",
  "idUrl": "https://example.com/id-card.pdf",
  
  "studentData": { "bloodGroup": "O_POSITIVE" },
  "parentData": { "occupation": "ENGINEER" }
}
```

### Method 2: File Upload (Existing)
```
POST /users/comprehensive
Content-Type: multipart/form-data

firstName: John
lastName: Doe
email: john@example.com
image: <file>
idDocument: <file>
...
```

---

## 📋 New DTO Fields

```typescript
imageUrl?: string;  // Profile image URL (optional)
idUrl?: string;     // ID document URL (optional)
```

**Validation:**
- ✅ Must be valid URL format
- ✅ Optional (can be omitted)
- ✅ Uses `@IsUrl()` decorator

---

## 🔄 Priority Logic

If both file and URL provided:
1. **File Upload** (Priority 1) ⬅️ Used
2. **URL** (Priority 2) ⬅️ Ignored

---

## ✅ Benefits

- ✅ No need to download/re-upload existing images
- ✅ Faster bulk imports
- ✅ External system integration
- ✅ Reduced server storage
- ✅ Backward compatible (no breaking changes)

---

## 🧪 Test Examples

**cURL:**
```bash
curl -X POST http://localhost:3000/api/users/comprehensive \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "firstName": "Test",
    "lastName": "User",
    "email": "test@example.com",
    "phoneNumber": "+94771234567",
    "userType": "USER_WITHOUT_PARENT",
    "gender": "MALE",
    "district": "COLOMBO",
    "province": "WESTERN",
    "country": "Sri Lanka",
    "imageUrl": "https://i.pravatar.cc/300",
    "studentData": { "bloodGroup": "O_POSITIVE" }
  }'
```

**JavaScript:**
```javascript
const response = await fetch('/api/users/comprehensive', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    firstName: 'Test',
    imageUrl: 'https://example.com/image.jpg',
    // ... other required fields
  })
});
```

---

## 📝 Changes Summary

**Files Modified:**
1. ✅ `src/modules/user/dto/create-user-comprehensive.dto.ts` - Added imageUrl & idUrl fields
2. ✅ `src/modules/user/user.controller.ts` - Support for application/json requests
3. ✅ `src/modules/user/user.service.ts` - Handle both files and URLs

**Build Status:** ✅ SUCCESS (0 errors)

---

## 🔒 Security

- ✅ URL validation with `@IsUrl()`
- ✅ File upload validation unchanged
- ✅ Priority: Files over URLs (more secure)
- ✅ No new vulnerabilities introduced

---

**Status:** ✅ Production Ready  
**Backward Compatible:** ✅ Yes  
**Breaking Changes:** ❌ None
