# SYSTEM_ADMINS Target Type - Feature Addition

## Problem Identified

When using `targetUserTypes: ["ALL"]`, system administrators (SUPER_ADMIN users) were being included, but there was **no way to target them specifically**.

### Available Target Types (Before):
- `ALL` - All active users
- `STUDENTS` - Student users only
- `TEACHERS` - Teacher users only
- `PARENTS` - Parent users only
- `INSTITUTE_ADMINS` - Institute admin users only
- `ATTENDANCE_MARKERS` - Attendance marker users only
- `USERS_WITHOUT_INSTITUTE` - Users not in any institute
- `USERS_WITHOUT_PARENT` - Users who cannot be parents
- `USERS_WITHOUT_STUDENT` - Users who cannot be students
- `VERIFIED_USERS_ONLY` - Only email-verified users
- `UNVERIFIED_USERS_ONLY` - Only unverified users

**Missing:** No option to target SUPER_ADMIN users specifically!

---

## Solution Implemented

### Added New Target Type: `SYSTEM_ADMINS`

**Files Modified:**

1. **`src/modules/push-notifications/entities/push-notification.entity.ts`**
   - Added `SYSTEM_ADMINS = 'SYSTEM_ADMINS'` to enum
   - Comment: `// Users with SUPERADMIN user type`

2. **`src/modules/push-notifications/services/push-notification.service.ts`**
   - Added logic to query users with `userType = SUPER_ADMIN`
   - Code:
     ```typescript
     if (targetTypes.includes(NotificationTargetUserType.SYSTEM_ADMINS)) {
       const systemAdmins = await this.userRepository.find({
         where: { isActive: true, userType: UserType.SUPERADMIN },
         select: ['id']
       });
       systemAdmins.forEach(a => userIds.add(a.id));
     }
     ```

---

## How to Use

### 1. Target ONLY System Admins

```json
{
  "title": "System Administrator Message",
  "body": "This goes only to SUPER_ADMIN users",
  "scope": "GLOBAL",
  "targetUserTypes": ["SYSTEM_ADMINS"],
  "priority": "HIGH",
  "sendImmediately": true
}
```

### 2. Target Multiple Admin Types

```json
{
  "title": "Admin Announcement",
  "body": "This goes to both system and institute admins",
  "scope": "GLOBAL",
  "targetUserTypes": ["SYSTEM_ADMINS", "INSTITUTE_ADMINS"],
  "priority": "HIGH",
  "sendImmediately": true
}
```

### 3. Testing with PowerShell

```powershell
$token = "YOUR_JWT_TOKEN"
$body = @{
  title = "Test System Admin Notification"
  body = "Testing the new SYSTEM_ADMINS target type"
  scope = "GLOBAL"
  targetUserTypes = @("SYSTEM_ADMINS")
  priority = "HIGH"
  sendImmediately = $true
} | ConvertTo-Json

$response = Invoke-RestMethod `
  -Uri "http://127.0.0.1:8080/push-notifications/admin" `
  -Method POST `
  -Headers @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
  } `
  -Body $body

$response | Format-List
```

---

## Expected Results

### If System Admin Has FCM Token:
```json
{
  "totalRecipients": 1,
  "sentCount": 1,
  "failedCount": 0,
  "usersWithTokens": 1,
  "usersWithoutTokens": 0
}
```
✅ Notification delivered to device!

### If System Admin Does NOT Have FCM Token:
```json
{
  "totalRecipients": 1,
  "sentCount": 0,
  "failedCount": 0,
  "usersWithTokens": 0,
  "usersWithoutTokens": 1
}
```
❌ User needs to register FCM token from mobile app

---

## Important Notes

### Two Separate Issues Fixed:

1. **Missing SYSTEM_ADMINS Target Type** (this feature)
   - ✅ FIXED: Added SYSTEM_ADMINS enum and logic
   - ✅ Can now target SUPER_ADMIN users specifically

2. **Users with FCM Tokens are Inactive** (separate issue)
   - ❌ STILL NEEDS FIX: Run SQL to activate users with tokens
   - SQL Fix:
     ```sql
     UPDATE users 
     SET is_active = true 
     WHERE id IN (
       SELECT DISTINCT user_id 
       FROM user_fcm_tokens 
       WHERE is_active = true
     );
     ```

---

## Testing Steps

1. **Restart Server:**
   ```powershell
   npm start
   ```

2. **Verify System Admin is Active:**
   ```sql
   SELECT id, email, user_type, is_active 
   FROM users 
   WHERE user_type = 'SUPER_ADMIN';
   ```

3. **Check if System Admin Has FCM Token:**
   ```sql
   SELECT u.email, t.device_type, t.is_active
   FROM users u
   INNER JOIN user_fcm_tokens t ON t.user_id = u.id
   WHERE u.user_type = 'SUPER_ADMIN';
   ```

4. **Send Test Notification:**
   Use the PowerShell script above with `targetUserTypes: ["SYSTEM_ADMINS"]`

5. **Check Results:**
   - If `sentCount > 0`: ✅ Success!
   - If `usersWithoutTokens > 0`: Register FCM token from mobile app
   - If `totalRecipients = 0`: System admin might be inactive

---

## Related Documentation

- `DIAGNOSE_NOTIFICATION_ISSUE.sql` - SQL queries for diagnosis
- `FCM_TOKEN_TROUBLESHOOTING.md` - FCM token registration guide
- `SYSTEM_ADMIN_API_COMPLETE_GUIDE.md` - Complete API reference

---

## Summary

✅ **Feature Added:** `SYSTEM_ADMINS` target type  
✅ **Purpose:** Target SUPER_ADMIN users specifically  
✅ **Usage:** `"targetUserTypes": ["SYSTEM_ADMINS"]`  
⚠️ **Remember:** Users must be active AND have FCM tokens registered  
