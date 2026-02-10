# 🔧 Quick Fix Guide - Remaining Controller Updates

## Files That Need IP Extraction Fix

### 1. Mobile Controller
**File**: `src/auth/controllers/auth.mobile.controller.ts`

**Find and replace** (3 occurrences):
```typescript
// OLD (line ~118, ~206)
ipAddress: req.ip || req.connection?.remoteAddress || 'unknown'

// NEW
ipAddress: getClientIp(req)
```

**Add import at top**:
```typescript
import { getClientIp } from '../../common/utils/ip-extractor.util';
```

### 2. V2 Controller  
**File**: `src/auth/controllers/auth.v2.controller.ts`

**Find and replace** (2 occurrences):
```typescript
// OLD (line ~57, ~131)
ipAddress: req.ip || req.connection.remoteAddress || 'unknown'

// NEW  
ipAddress: getClientIp(req)
```

**Add import at top**:
```typescript
import { getClientIp } from '../../common/utils/ip-extractor.util';
```

### 3. Main.ts Configuration
**File**: `src/main.ts`

**Add after `NestFactory.create()`**:
```typescript
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // ✅ ADD THIS LINE
  app.set('trust proxy', true); // Enable X-Forwarded-For header reading
  
  // ... rest of your code
}
```

---

## Database Migration

### Option A: Direct SQL
```sql
-- Add column
ALTER TABLE refresh_tokens 
ADD COLUMN last_active_at TIMESTAMP NULL;

-- Initialize existing records
UPDATE refresh_tokens 
SET last_active_at = created_at 
WHERE last_active_at IS NULL;
```

### Option B: TypeORM Migration
```bash
# Create migration
npm run typeorm migration:create -- -n AddLastActiveAtColumn

# Edit the generated file in migrations/ folder
# Add the SQL commands above

# Run migration
npm run typeorm migration:run
```

---

## Frontend Type Updates

**Update your TypeScript interface**:

```typescript
// OLD
interface Session {
  platform: string;
  createdAt: string;
  expiresInHuman: string;
  ipAddress: string;        // REMOVE
  deviceId: string;         // REMOVE
  isCurrent: boolean;       // REMOVE
}

// NEW
interface Session {
  deviceType: 'web' | 'android' | 'ios';  // RENAMED
  firstLogin: string;                     // RENAMED
  lastLogin: string | null;               // NEW
  expiresIn: string;                      // RENAMED
  isRevoked: boolean;                     // NEW
}
```

---

## Quick Test Commands

```bash
# 1. Verify TypeScript compiles
npx tsc --noEmit

# 2. Test sessions API
curl -X GET http://localhost:3000/auth/sessions \
  -H "Authorization: Bearer YOUR_TOKEN"

# 3. Check database
psql -U user -d database -c "SELECT ip_address, last_active_at FROM refresh_tokens LIMIT 5;"
```

---

## Estimated Time

- Controller updates: 5 minutes
- main.ts update: 1 minute  
- Database migration: 2 minutes
- Testing: 5 minutes
- **Total: ~15 minutes**
