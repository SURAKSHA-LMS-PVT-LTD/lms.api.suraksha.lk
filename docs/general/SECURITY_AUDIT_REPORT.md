# 🔒 Security Audit Report — Authentication & Authorization Gaps

**Project:** lms-api-suraksha-lk (NestJS)  
**Date:** June 2025  
**Scope:** All 59 controller files in `src/`  

---

## Executive Summary

| Severity | Count | Description |
|----------|-------|-------------|
| 🔴 CRITICAL | 3 | Public-facing endpoints blocked by global JWT guard (broken flows) |
| 🟠 HIGH | 3 | Missing role/authorization guards on sensitive endpoints |
| 🟡 MEDIUM | 4 | Sensitive data exposure, debug endpoint, manual password scrubbing |
| 🟢 LOW | 2 | Minor informational findings |

---

## Global Guard Architecture

The application registers **three global guards** in `src/app.module.ts` (lines 170–184):

```typescript
// 1. OriginValidationGuard — validates request origin
{ provide: APP_GUARD, useClass: OriginValidationGuard }
// 2. JwtAuthGuard — JWT authentication (bypassed by @Public())
{ provide: APP_GUARD, useClass: JwtAuthGuard }
// 3. ThrottlerGuard — rate limiting
{ provide: APP_GUARD, useClass: ThrottlerGuard }
```

The `@Public()` decorator (in `src/common/decorators/public.decorator.ts`) sets `isPublic` metadata. `JwtAuthGuard` (`src/auth/guards/jwt-auth.guard.ts`) checks this flag via `Reflector`—if `true`, JWT validation is **skipped**.

**Key implication:** Every endpoint is protected by `JwtAuthGuard` by default. Any public-facing endpoint that omits `@Public()` will be **blocked** for unauthenticated users.

---

## 🔴 CRITICAL FINDINGS

### FINDING 1 — FirstLoginController: All 8 endpoints blocked for unauthenticated users

**File:** `src/auth/controllers/first-login.controller.ts`  
**Severity:** 🔴 CRITICAL — First-login flow is **completely inaccessible** without a JWT  

This controller has **zero** `@Public()` decorators and **zero** `@UseGuards()` decorators. All 8 endpoints rely solely on the global `JwtAuthGuard`, which will **reject** unauthenticated requests. Since the entire purpose of this controller is to let first-time users (who have no JWT) set up their password, these endpoints are effectively broken.

| Line | Endpoint | Method |
|------|----------|--------|
| 43 | `auth/initiate` | `POST` |
| 79 | `auth/verify-otp` | `POST` |
| 102 | `auth/set-password` | `POST` |
| 136 | `auth/resend-otp` | `POST` |
| 166 | `auth/status` | `GET` |
| 194 | `auth/verify-otp-complete` | `POST` |
| 263 | `auth/verify-otp-enhanced` | `POST` |
| 287 | `auth/complete-profile` | `PUT` |

**Code snippet** (lines 35–68):
```typescript
@ApiTags('First Login')
@Controller('auth')
export class FirstLoginController {
  // NO @Public(), NO @UseGuards — relies on global JwtAuthGuard

  @Post('initiate')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 900000 } })
  async initiateFirstLogin(
    @Body() dto: InitiateFirstLoginDto,
    @Req() req: Request
  ): Promise<FirstLoginResponseDto> {
    // ...
  }
}
```

**Recommendation:** Add `@Public()` to all endpoints in this controller (or at class level). Consider adding `@UseGuards(ApiKeyOrJwtGuard)` if system-only access is intended, or use throttling as the sole protection for these unauthenticated flows.

---

### FINDING 2 — PasswordResetController: Reset flow blocked for unauthenticated users

**File:** `src/auth/controllers/password-reset.controller.ts`  
**Severity:** 🔴 CRITICAL — Password reset flow is **inaccessible** without a JWT  

The three password-reset endpoints (`reset/initiate`, `reset/verify-otp`, `reset/complete`) have **no** `@Public()` and **no** `@UseGuards()`. The global `JwtAuthGuard` will reject all unauthenticated requests. Users who forgot their password **cannot** initiate a reset.

Note: The password *change* endpoints (lines 255, 296, 337) correctly use `@UseGuards(JwtAuthGuard, FlexibleAccessGuard)` since they require an authenticated user.

| Line | Endpoint | Method | Has Guard? |
|------|----------|--------|------------|
| 161 | `auth/password/reset/initiate` | `POST` | ❌ None — **blocked** |
| 193 | `auth/password/reset/verify-otp` | `POST` | ❌ None — **blocked** |
| 221 | `auth/password/reset/complete` | `POST` | ❌ None — **blocked** |
| 255 | `auth/password/change` | `POST` | ✅ `JwtAuthGuard, FlexibleAccessGuard` |
| 296 | `auth/password/change/initiate` | `POST` | ✅ `JwtAuthGuard, FlexibleAccessGuard` |
| 337 | `auth/password/change/complete` | `POST` | ✅ `JwtAuthGuard, FlexibleAccessGuard` |

**Code snippet** (lines 155–168):
```typescript
@Controller('auth/password')
export class PasswordResetController {
  constructor(private readonly passwordResetService: PasswordResetService) {}

  @Post('reset/initiate')
  @Throttle({ default: { limit: 3, ttl: 900000 } })
  @HttpCode(HttpStatus.OK)
  async initiatePasswordReset(
    @Body(ValidationPipe) initiatePasswordResetDto: InitiatePasswordResetDto,
    @Req() req: ExpressRequest
  ) { ... }
}
```

**Recommendation:** Add `@Public()` to the three `reset/*` endpoints. Throttling is already in place, which is good. These must be accessible without authentication.

---

### FINDING 3 — BookhireOwnerAuthController: Register & Login blocked by global JWT guard

**File:** `src/modules/private-transportation/controllers/bookhire-owner.controller.ts`  
**Severity:** 🔴 CRITICAL — Registration and login are **inaccessible**  

The `register` (line 51) and `login` (line 73) endpoints are marked as `// ✅ PUBLIC` in comments but have **no** `@Public()` decorator. The global `JwtAuthGuard` will reject unauthenticated requests, making registration and login impossible.

**Code snippet** (lines 46–91):
```typescript
@Controller('api/bookhire-owner-auth')
export class BookhireOwnerAuthController {
  // ✅ PUBLIC: Registration endpoint with rate limiting  <-- COMMENT ONLY, no @Public()
  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async register(@Body() createBookhireOwnerDto: CreateBookhireOwnerDto) {
    return this.bookhireOwnerService.register(createBookhireOwnerDto);
  }

  // ✅ PUBLIC: Login endpoint with rate limiting  <-- COMMENT ONLY, no @Public()
  @Post('login')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  async login(@Body() loginDto: BookhireOwnerLoginDto) {
    return this.bookhireOwnerService.login(loginDto);
  }
}
```

**Recommendation:** Add `@Public()` to both `register` and `login` endpoints. The rate limiting is already correctly applied.

---

## 🟠 HIGH SEVERITY FINDINGS

### FINDING 4 — EnhancedAdvertisingController: 5 endpoints missing role authorization

**File:** `src/modules/advertisement/enhanced-advertising.controller.ts`  
**Severity:** 🟠 HIGH — Sensitive business operations accessible to **any authenticated user**  

This controller has class-level `@UseGuards(JwtAuthGuard)` (line 27) but **5 endpoints** lack `FlexibleAccessGuard` or `@RequireAnyOfRoles`, meaning any authenticated user (students, parents, etc.) can access advertising analytics, track revenue, and create promotional offers.

Compare with the properly guarded endpoints (`dynamic-pricing`, `bid`, `competitor-blocking`, `sponsorship-tier`) which all use `@UseGuards(JwtAuthGuard, FlexibleAccessGuard)` + `@RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })`.

| Line | Endpoint | Method | Missing Guard | Risk |
|------|----------|--------|---------------|------|
| 36 | `student-allocations/:studentId` | `GET` | No role check | Any user can view any student's allocations (IDOR) |
| 77 | `track-revenue` | `POST` | No role check | Any user can inject fake revenue data |
| 117 | `analytics` | `GET` | No role check | Any user can access business analytics |
| 259 | `promotional-offer/:serviceId` | `POST` | No role check | Any user can create promotional offers |
| 348 | `summary` | `GET` | No role check | Any user can access advertising summary |

**Code snippet** (lines 27–49, 77–78):
```typescript
@Controller('enhanced-advertising')
@UseGuards(JwtAuthGuard)  // class-level: JWT only, NO role check
export class EnhancedAdvertisingController {

  @Get('student-allocations/:studentId')
  // NO @UseGuards(FlexibleAccessGuard), NO @RequireAnyOfRoles
  async getStudentAllocations(@Param('studentId') studentId: string, ...) { ... }

  @Post('track-revenue')
  @HttpCode(HttpStatus.OK)
  // NO @UseGuards(FlexibleAccessGuard), NO @RequireAnyOfRoles
  async trackRevenue(@Body() body: { serviceId, revenueType, amount }) { ... }
}
```

**Recommendation:** Add `@UseGuards(JwtAuthGuard, FlexibleAccessGuard)` and `@RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })` to all 5 endpoints, consistent with the other endpoints in this controller.

---

### FINDING 5 — student-allocations/:studentId IDOR (Insecure Direct Object Reference)

**File:** `src/modules/advertisement/enhanced-advertising.controller.ts`, line 36  
**Severity:** 🟠 HIGH — Cross-user data access  

The `getStudentAllocations` endpoint accepts a `studentId` parameter but performs **no ownership validation**. The code comments confirm: `// Public access - no validation needed`. Any authenticated user can query any student's transport service allocations by guessing or iterating student IDs.

**Code snippet** (lines 36–55):
```typescript
@Get('student-allocations/:studentId')
async getStudentAllocations(
  @Param('studentId') studentId: string,
  @Query('location') location?: string,
  @Req() req?: any,
) {
  // Public access - no validation needed   <-- EXPLICIT SKIP
  const allocations = await this.enhancedAdvertisingService.controlStudentAllocations(
    studentId, location
  );
  return { success: true, data: { studentId, availableServices: allocations, ... } };
}
```

**Recommendation:** Validate that `req.user.id === studentId` or that the requesting user is an admin/parent of the student.

---

### FINDING 6 — Debug endpoint relying on NODE_ENV check

**File:** `src/auth/auth.controller.ts`, lines 230–248  
**Severity:** 🟠 HIGH — User enumeration / info leak if `NODE_ENV` is misconfigured  

The `debug-user/:email` endpoint exposes whether a user exists, their email, whether they have a password set, their active status, and user type. While it has `@RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })` and a production check, the production block depends on `process.env.NODE_ENV === 'production'` being set correctly. If `NODE_ENV` is unset or misconfigured, this endpoint is live.

**Code snippet** (lines 230–248):
```typescript
@Get('debug-user/:email')
@UseGuards(JwtAuthGuard, FlexibleAccessGuard)
@RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
async debugUser(@Param('email') email: string) {
  if (process.env.NODE_ENV === 'production') {
    throw new UnauthorizedException('Debug endpoints disabled in production');
  }
  const user = await this.authService.findUserByEmail(email);
  return {
    exists: !!user,
    email: user?.email,
    hasPassword: !!user?.password,   // exposes password existence
    isActive: user?.isActive,
    userType: user?.userType
  };
}
```

**Recommendation:** Remove this endpoint entirely, or move it to a separate debug module that is **not compiled** in production builds. Relying on `NODE_ENV` alone is fragile.

---

## 🟡 MEDIUM SEVERITY FINDINGS

### FINDING 7 — Meeting passwords returned in API responses by default

**Files:**  
- `src/modules/institute_class_subject_modules/institute_class_subject_lectures/entities/institute_class_subject_lecture.entity.ts`, line 98  
- `src/modules/institute_mudules/institue_lectures/entities/institue_lecture.entity.ts`, line 68  
**Severity:** 🟡 MEDIUM — Sensitive data exposure  

Both lecture entities define a `meeting_password` column **without** `select: false`. This means meeting passwords (e.g., Zoom/Teams passwords) are included in every query result by default and returned in API responses unless explicitly excluded.

Compare with the `User` entity which correctly uses `select: false` on the password column:

```typescript
// ✅ User entity (src/modules/user/entities/user.entity.ts, line 50-51)
@Column({ type: 'varchar', length: 120, nullable: true, select: false })
password: string;

// ❌ Lecture entity (line 98) — NO select: false
@Column({ name: 'meeting_password', type: 'varchar', length: 50, nullable: true })
meeting_password: string;

// ❌ Institute lecture entity (line 68) — NO select: false
@Column({ name: 'meeting_password', type: 'varchar', length: 50, nullable: true })
meeting_password: string;
```

**Recommendation:** Add `select: false` to both `meeting_password` columns and explicitly select it only in the specific queries/endpoints where it's needed (e.g., when joining a meeting).

---

### FINDING 8 — Bookhire owner password exclusion via manual `delete` (fragile pattern)

**File:** `src/modules/private-transportation/services/bookhire-owner.service.ts`  
**Severity:** 🟡 MEDIUM — Fragile password scrubbing  

The bookhire owner service excludes the password from responses via `delete ownerObject.password` after converting the entity to a plain object. This is fragile—if any code path skips the deletion or the object shape changes, the password hash leaks.

| Line | Context | Pattern |
|------|---------|---------|
| 77 | `register()` response | `delete ownerObject.password` |
| 116 | `login()` response | `delete ownerObject.password` |
| 125, 140, 220, 283 | Repository queries | `password: false` in select options |

**Code example** (line 77):
```typescript
const ownerObject = { ...savedOwner };
delete ownerObject.password;   // fragile — easy to miss
```

**Recommendation:** Add `select: false` to the `password` column in the BookhireOwner entity, consistent with the User entity pattern. This provides defense-in-depth at the ORM level.

---

### FINDING 9 — FlexibleAccessGuard bypassed for API key auth

**File:** `src/auth/guards/api-key-or-jwt.guard.ts`  
**Severity:** 🟡 MEDIUM — Authorization bypass by design  

When a request authenticates via `SPECIAL_API_KEY`, the `FlexibleAccessGuard` is automatically bypassed (`isApiKeyAuth || authType === 'API_KEY'`). The API key user is set to `u: -1` which is **not** a superadmin, but effectively gets superadmin-like access since role checks are skipped entirely.

This is by design for system-to-system communication, but any endpoint using `@Public()` + `@UseGuards(ApiKeyOrJwtGuard, FlexibleAccessGuard)` effectively has an authorization bypass for API key holders.

**Affected endpoints** (User controller):
| Line | Endpoint | Risk |
|------|----------|------|
| 132 | `POST api/users/comprehensive` | API key bypasses role checks |
| 3281 | `POST api/users/create-email-otp/request` | API key bypasses role checks |
| 3346 | `POST api/users/create-email-otp/verify` | API key bypasses role checks |
| 3397 | `POST api/users/create-phone-number-otp/request` | API key bypasses role checks |
| 3464 | `POST api/users/create-phone-number-otp/verify` | API key bypasses role checks |
| 3529 | `POST api/users/create-phone-number-otp/re-request` | API key bypasses role checks |
| 3580 | `POST api/users/verify-phone-otp` | API key bypasses role checks |

**Recommendation:** Audit the `SPECIAL_API_KEY` value strength and rotation policy. Consider limiting API key access to specific endpoints rather than using a blanket bypass. Log all API key-authenticated requests for monitoring.

---

### FINDING 10 — Weak secret detection uses hardcoded checklist

**Files:**  
- `src/auth/strategies/jwt.strategy.ts`, line ~44  
- `src/modules/payment/payment.module.ts`, line ~63  
**Severity:** 🟡 MEDIUM — Incomplete weak secret protection  

The codebase checks JWT secrets against a small hardcoded list: `['secret', 'fallback-secret-key', 'your-secret-key', 'jwt-secret', 'change-me']`. While this is a good practice, the list is very limited and doesn't check for minimum length, entropy, or other common weak secrets.

**Recommendation:** Add minimum length requirements (e.g., 32+ characters), entropy checks, and expand the weak secret list. Consider failing startup if secrets don't meet minimum requirements.

---

## 🟢 LOW SEVERITY / INFORMATIONAL

### FINDING 11 — No hardcoded secrets found ✅

All sensitive values (`JWT_SECRET`, `JWT_REFRESH_SECRET`, `SPECIAL_API_KEY`, `SMSLENZ_API_KEY`, `GOOGLE_CLIENT_SECRET`, `AWS_SECRET_ACCESS_KEY`, `HMAC_SECRET`) are properly loaded from environment variables via `configService.get<string>()`. No hardcoded secrets were discovered in the codebase.

---

### FINDING 12 — @Public() decorator usage summary (27 instances)

All `@Public()` usages were reviewed. The following are **legitimate** uses for unauthenticated access:

| File | Line(s) | Endpoint(s) | Risk Level |
|------|---------|-------------|------------|
| `src/auth/controllers/auth.v2.controller.ts` | 15, 81 | Login, Refresh token | ✅ Expected |
| `src/auth/auth.controller.ts` | 256, 301 | Forgot-password, Reset-password | ✅ Expected |
| `src/auth/controllers/auth.mobile.controller.ts` | 54, 156, 232 | Mobile login, Refresh, Logout | ✅ Expected |
| `src/modules/user/user.controller.ts` | 132 | Comprehensive user create | ⚠️ Protected by ApiKeyOrJwtGuard |
| `src/modules/user/user.controller.ts` | 3281–3580 | OTP endpoints (6 total) | ⚠️ Protected by ApiKeyOrJwtGuard |
| `src/modules/institute/public-institute.controller.ts` | 56 | Class-level @Public | ⚠️ Protected by ApiKeyOrJwtGuard |
| `src/common/controllers/public-upload.controller.ts` | 97 | Class-level @Public | ⚠️ Protected by ApiKeyOrJwtGuard |
| `src/common/controllers/upload.controller.ts` | 213, 368 | Profile image signed URLs | ⚠️ Review if these should be public |

All `@Public() + @UseGuards(ApiKeyOrJwtGuard)` patterns are correctly layered — they bypass JWT but still require either a valid JWT or the system API key.

---

## Summary of Recommendations

| Priority | Action | Finding |
|----------|--------|---------|
| 🔴 P0 | Add `@Public()` to `FirstLoginController` (class-level) | #1 |
| 🔴 P0 | Add `@Public()` to `PasswordResetController` reset endpoints | #2 |
| 🔴 P0 | Add `@Public()` to BookhireOwner `register` and `login` | #3 |
| 🟠 P1 | Add `FlexibleAccessGuard` + `@RequireAnyOfRoles` to 5 enhanced-advertising endpoints | #4, #5 |
| 🟠 P1 | Remove or conditionally compile debug endpoint | #6 |
| 🟡 P2 | Add `select: false` to `meeting_password` columns | #7 |
| 🟡 P2 | Add `select: false` to BookhireOwner `password` column | #8 |
| 🟡 P2 | Audit API key strength, rotation, and logging | #9 |
| 🟡 P2 | Strengthen weak secret validation | #10 |

---

*End of Security Audit Report*
