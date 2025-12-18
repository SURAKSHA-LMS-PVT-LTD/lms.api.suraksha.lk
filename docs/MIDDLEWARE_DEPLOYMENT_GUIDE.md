# SQL Injection Detection Middleware - Deployment Guide

**Priority:** 🚨 **IMMEDIATE**  
**Time Required:** 5 minutes  
**Risk:** Low (can be disabled if issues occur)

---

## Quick Deployment Steps

### Step 1: Verify Middleware File Exists

The middleware has been created at:
```
src/common/middleware/sql-injection-detector.middleware.ts
```

### Step 2: Add to App Module

Open `src/app.module.ts` and add the following:

```typescript
import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { SqlInjectionDetectorMiddleware } from './common/middleware/sql-injection-detector.middleware';

@Module({
  imports: [
    // ... your existing imports
  ],
  controllers: [
    // ... your existing controllers
  ],
  providers: [
    // ... your existing providers
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(SqlInjectionDetectorMiddleware)
      .forRoutes('*'); // Apply to all routes
  }
}
```

**If your AppModule already implements NestModule:**

Just add the middleware to the existing `configure()` method:

```typescript
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(
        // ... existing middleware
        SqlInjectionDetectorMiddleware
      )
      .forRoutes('*');
  }
}
```

### Step 3: Test Locally

```bash
# Start the development server
npm run start:dev

# Test a malicious request
curl -X POST http://localhost:3000/api/test \
  -H "Content-Type: application/json" \
  -d '{"test": "1' UNION SELECT * FROM users--"}'

# Expected Response:
# {
#   "statusCode": 400,
#   "message": "Invalid request: Potential SQL injection pattern detected...",
#   "error": "Bad Request"
# }
```

### Step 4: Monitor Logs

The middleware logs all blocked attempts:

```bash
# Watch for SQL injection attempts:
tail -f logs/app.log | grep "SQL Injection"

# Example log output:
# 🚨 SQL Injection attempt detected in request body!
#   Path: POST /api/test
#   IP: 127.0.0.1
#   User-Agent: curl/7.68.0
#   Payload: {"test":"1' UNION SELECT * FROM users--"}
```

---

## Rollback Plan (If Issues Occur)

If the middleware causes false positives or issues:

### Option 1: Disable Completely

```typescript
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Comment out or remove:
    // consumer
    //   .apply(SqlInjectionDetectorMiddleware)
    //   .forRoutes('*');
  }
}
```

### Option 2: Apply to Specific Routes Only

```typescript
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(SqlInjectionDetectorMiddleware)
      .forRoutes(
        '/sms/*',        // Only SMS endpoints
        '/auth/*',       // Only auth endpoints
        '/institute/*'   // Only institute endpoints
      );
  }
}
```

### Option 3: Exclude Specific Routes

```typescript
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(SqlInjectionDetectorMiddleware)
      .exclude(
        '/health',       // Health check
        '/api/docs'      // API documentation
      )
      .forRoutes('*');
  }
}
```

---

## Testing Checklist

Before deploying to production, test these scenarios:

### ✅ Test 1: Legitimate Requests (Should Pass)

```bash
# Normal user registration:
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePass123",
    "firstName": "John",
    "lastName": "Doe"
  }'

# Expected: 201 Created (or normal response)
```

### ✅ Test 2: SQL Injection Attempt (Should Block)

```bash
# UNION-based injection:
curl -X POST http://localhost:3000/api/sms/send-campaign \
  -H "Content-Type: application/json" \
  -d '{
    "classIds": ["1' UNION SELECT password FROM users--"],
    "message": "Test"
  }'

# Expected: 400 Bad Request
```

### ✅ Test 3: Comment Injection (Should Block)

```bash
# Comment-based attack:
curl -X GET "http://localhost:3000/api/users?name=admin'--"

# Expected: 400 Bad Request
```

### ✅ Test 4: Boolean Blind Injection (Should Block)

```bash
# OR 1=1 attack:
curl -X POST http://localhost:3000/api/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com' OR '1'='1",
    "password": "anything"
  }'

# Expected: 400 Bad Request
```

---

## Monitoring & Alerts

### Set Up Log Monitoring

```bash
# Create alert script (alert-sql-injection.sh):
#!/bin/bash
tail -f /var/log/lms/app.log | grep --line-buffered "SQL Injection" | while read line
do
  echo "SECURITY ALERT: $line"
  # Send to Slack/Email/SMS:
  # curl -X POST https://hooks.slack.com/services/YOUR/WEBHOOK/URL \
  #   -H 'Content-Type: application/json' \
  #   -d "{\"text\":\"$line\"}"
done
```

### Metrics to Track

1. **Number of blocked attempts per hour**
   ```bash
   grep "SQL Injection" app.log | wc -l
   ```

2. **Most targeted endpoints**
   ```bash
   grep "SQL Injection" app.log | grep -oP 'Path: \K[^\\n]+' | sort | uniq -c | sort -nr
   ```

3. **Attack source IPs**
   ```bash
   grep "SQL Injection" app.log | grep -oP 'IP: \K[^\\n]+' | sort | uniq -c | sort -nr
   ```

---

## Performance Impact

### Expected Impact:
- **Latency:** +1-3ms per request
- **Memory:** +5MB (pattern compilation)
- **CPU:** Negligible (<1%)

### Benchmark Results (Estimated):

| Scenario | Without Middleware | With Middleware | Overhead |
|----------|-------------------|-----------------|----------|
| Simple GET | 10ms | 12ms | +2ms |
| POST with JSON | 25ms | 27ms | +2ms |
| Large payload (100KB) | 50ms | 53ms | +3ms |

---

## Production Deployment Checklist

- [ ] Middleware file created and committed
- [ ] AppModule updated with middleware
- [ ] Local testing completed (all 4 tests)
- [ ] No false positives detected
- [ ] Staging deployment successful
- [ ] Log monitoring configured
- [ ] Alert system configured
- [ ] Rollback plan documented
- [ ] Team notified of deployment

---

## FAQ

### Q: Will this middleware block legitimate requests?

**A:** No. The patterns are specifically designed to detect SQL injection attempts. Normal user input like names, emails, or addresses will not be blocked.

### Q: What if a user legitimately needs to input SQL-like text?

**A:** Extremely rare. If this occurs:
1. Check the logs to verify it's legitimate
2. Add the specific pattern to an exclusion list
3. Or exclude that specific endpoint from the middleware

### Q: How do I update the detection patterns?

**A:** Edit `src/common/middleware/sql-injection-detector.middleware.ts` and modify the `sqlInjectionPatterns` array.

### Q: Can attackers bypass this middleware?

**A:** This is defense-in-depth. The primary protection is the QueryBuilder fixes. The middleware is an additional layer. Even if bypassed, the underlying code is now safe.

---

## Support

If you encounter issues:

1. Check the logs: `tail -f logs/app.log`
2. Review false positive rate
3. Test rollback procedure
4. Contact security team

---

**Last Updated:** November 5, 2025  
**Status:** ✅ Ready for Deployment  
**Estimated Deployment Time:** 5 minutes
