# IMPORTANT: Developer Guide for Entity Timestamps

## ⚠️ CRITICAL RULE

**ALL entities now use MANUAL timestamp management!**

`@CreateDateColumn` and `@UpdateDateColumn` decorators have been REMOVED from all 46 entities.

## 🔧 How to Work with Entities

### ✅ Creating New Records

**ALWAYS set both createdAt and updatedAt when creating:**

```typescript
import { now } from '../../common/utils/timezone.util';

// Example: Creating a user
const user = userRepository.create({
  email: 'user@example.com',
  firstName: 'John',
  // ... other fields
  createdAt: now(),  // ⚠️ REQUIRED
  updatedAt: now()   // ⚠️ REQUIRED
});
await userRepository.save(user);
```

### ✅ Updating Existing Records

**ALWAYS update updatedAt when modifying:**

```typescript
import { now } from '../../common/utils/timezone.util';

// Example: Updating a user
const user = await userRepository.findOne({ where: { id } });
user.email = 'newemail@example.com';
user.updatedAt = now();  // ⚠️ REQUIRED
await userRepository.save(user);
```

### ✅ Bulk Operations

**Set timestamps for ALL records:**

```typescript
import { now } from '../../common/utils/timezone.util';

const timestamp = now();
const users = userRepository.create([
  { email: 'user1@example.com', createdAt: timestamp, updatedAt: timestamp },
  { email: 'user2@example.com', createdAt: timestamp, updatedAt: timestamp },
  { email: 'user3@example.com', createdAt: timestamp, updatedAt: timestamp }
]);
await userRepository.save(users);
```

## 🚫 What NOT to Do

### ❌ DON'T use new Date()
```typescript
// ❌ WRONG
entity.createdAt = new Date();  // Uses UTC, not Sri Lanka time
```

### ❌ DON'T forget timestamps
```typescript
// ❌ WRONG
const user = userRepository.create({
  email: 'user@example.com',
  firstName: 'John'
  // Missing createdAt and updatedAt!
});
await userRepository.save(user);
```

### ❌ DON'T use @CreateDateColumn or @UpdateDateColumn
```typescript
// ❌ WRONG - These decorators have been removed
@CreateDateColumn({ name: 'created_at', type: 'timestamp' })
createdAt: Date;
```

## 📋 Affected Entities (46 Total)

All entities listed in `ENTITY_TIMESTAMP_FIX_COMPLETE.md` require manual timestamp management.

### Most Critical for Your Work:
- UserEntity
- StudentEntity  
- ParentEntity
- StudentBookhireAttendanceEntity ⚠️ (attendance emailing)
- InstitutePaymentEntity
- PaymentEntity
- SMSCampaignEntity
- All institute/class/subject entities

## 🔍 How to Check if You're Doing it Right

### Run this query in your database:
```sql
-- Check recent records have correct timestamps (should be Sri Lanka time, not UTC)
SELECT 
  id, 
  created_at, 
  updated_at,
  CONVERT_TZ(created_at, '+00:00', '+05:30') as sri_lanka_time
FROM users 
WHERE created_at > NOW() - INTERVAL 1 DAY 
ORDER BY created_at DESC 
LIMIT 10;
```

### The timestamps should:
- ✅ Match Sri Lanka time (Asia/Colombo, UTC+5:30)
- ✅ Be approximately 5.5 hours ahead of UTC
- ✅ Not show dates in the future
- ✅ Match when OTPs/emails are sent

## 🛠️ Timezone Utilities Available

Located in: `src/common/utils/timezone.util.ts`

### now()
Returns: `Date` object in Sri Lanka timezone
Use for: Database operations, entity timestamps
```typescript
user.createdAt = now();
user.updatedAt = now();
```

### nowTimestamp()
Returns: `number` (milliseconds)
Use for: Mathematical calculations, date arithmetic
```typescript
const expiryTime = nowTimestamp() + (15 * 60 * 1000); // 15 minutes from now
```

### getCurrentSriLankaISO()
Returns: `string` (ISO format)
Use for: API responses, logging
```typescript
return {
  success: true,
  timestamp: getCurrentSriLankaISO()
};
```

### getCurrentSriLankaDate()
Returns: `string` (YYYY-MM-DD)
Use for: Date-only fields
```typescript
entity.attendanceDate = getCurrentSriLankaDate();
```

## 🐛 Common Mistakes to Avoid

1. **Forgetting to import `now`**
   ```typescript
   // ❌ WRONG - now is not defined
   entity.createdAt = now();
   
   // ✅ CORRECT
   import { now } from '../../common/utils/timezone.util';
   entity.createdAt = now();
   ```

2. **Not setting updatedAt on updates**
   ```typescript
   // ❌ WRONG
   entity.status = 'active';
   await repository.save(entity);
   
   // ✅ CORRECT
   entity.status = 'active';
   entity.updatedAt = now();
   await repository.save(entity);
   ```

3. **Using Date.now() instead of nowTimestamp()**
   ```typescript
   // ❌ WRONG - Date.now() is UTC
   const expiry = Date.now() + 900000;
   
   // ✅ CORRECT
   const expiry = nowTimestamp() + 900000;
   ```

## 📧 Why This Matters

**Before the fix:**
- User registers at 8:00 PM Sri Lanka time
- Database shows createdAt: 2:30 PM (UTC)
- OTPs expire immediately
- Attendance emails show wrong times
- Payment records have confusing timestamps

**After the fix:**
- User registers at 8:00 PM Sri Lanka time
- Database shows createdAt: 8:00 PM (correct!)
- OTPs work correctly
- Attendance emails show accurate times
- Payment records are clear

## 🆘 Need Help?

If you see:
- OTPs expiring immediately → Check createdAt timestamp
- Wrong timestamps in emails → Check entity creation code
- Database times look wrong → Verify `now()` is being used
- Compilation errors about timestamps → Ensure entity has manual @Column, not @CreateDateColumn

Refer to: `ENTITY_TIMESTAMP_FIX_COMPLETE.md` for full technical details.

---
**Updated:** January 18, 2026
**Status:** All 46 entities migrated to manual timestamp management
