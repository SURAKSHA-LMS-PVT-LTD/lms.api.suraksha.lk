# Backend API Guidelines

## Tech Stack
**NestJS + TypeORM + MySQL + DynamoDB**

This NestJS backend serves as the central API for the LMS platform. It uses:
- **TypeORM** for MySQL relational data (users, institutes, attendance records at scale)
- **DynamoDB** for high-volume time-series data (attendance event logs, real-time metrics)
- **Jest** for unit/integration testing with ts-jest transformer
- Multi-tenant architecture: all queries scoped to `instituteId`

## Quick Start

```bash
npm install
npm run start:dev              # Watch mode on port 8080
npm run validate:env           # Check .env file is proper
npm run test                   # Run all Jest tests
npm run test:cov              # Coverage report
npm run migration:run          # Apply pending migrations
npm run migration:show         # List all migrations
```

## Module Organization

Each feature lives in `src/modules/<feature>/`:
- `<feature>.module.ts` — NestJS module (imports, providers, exports)
- `<feature>.controller.ts` — HTTP endpoints
- `<feature>.service.ts` — Business logic
- `<feature>.repository.ts` — Database queries (extends TypeORM Repository)
- `<feature>.dto.ts` — Request/response validation (class-validator decorators)
- `<feature>.entity.ts` — Database schema (TypeORM column definitions)
- Nested submodules for related entities (e.g., `institute_modules/institute_class_subject_modules/`)

**Pattern**: Services call repositories (not raw TypeORM), repositories return typed data, controllers validate DTOs before passing to services.

## Database & Migrations

### Before Modifying Schema
1. Create a migration: `npm run typeorm migration:create src/migrations/AddMyColumn`
2. Edit the generated file in `src/migrations/`
3. Apply it: `npm run migration:run`
4. Verify in dev DB: `npm run migration:show`

### After Schema Changes
- Update the `.entity.ts` file with new columns
- Check all `.repository.ts` files that SELECT from the entity—verify they still map correctly
- Look for interceptors that read entity properties (might be using deleted columns)
- Run tests: `npm run test`

### Critical: Empty/Null Parameters
Repository `SELECT` queries sometimes receive `''` (empty string) instead of valid IDs.
**Pattern**: Always validate input before query:
```typescript
if (!instituteId || !userId) throw new BadRequestException('Missing IDs');
// Then query safely
```

## Testing

All critical paths should have Jest tests living in `**/*.spec.ts` files.

```bash
npm run test           # Single run (30s timeout per test)
npm run test:watch    # Watch mode during development
npm run test:cov      # Coverage—target >70% for new code
```

**Test pattern** (example):
```typescript
describe('UserService', () => {
  let service: UserService;
  let mockRepo: any;
  
  beforeEach(() => {
    mockRepo = { find: jest.fn() };
    service = new UserService(mockRepo);
  });
  
  it('should return users for institute', async () => {
    mockRepo.find.mockResolvedValue([{ id: '1', name: 'User' }]);
    const result = await service.getUsers('inst-123');
    expect(result).toHaveLength(1);
  });
});
```

## Multi-Tenant Scoping Pattern

**Every query must include `instituteId`:**

```typescript
// In repository
async getStudents(instituteId: string): Promise<Student[]> {
  return this.find({
    where: { instituteId },  // ← CRITICAL
    relations: ['user', 'parent'],
  });
}

// In service
async getStudents(instituteId: string): Promise<StudentDto[]> {
  const students = await this.studentRepo.getStudents(instituteId);
  return students.map(s => this.toDto(s));
}

// In controller
@Get()
async getStudents(@Param('instituteId') instituteId: string) {
  return this.studentService.getStudents(instituteId);
}
```

Missing `instituteId` WHERE clause = **security vulnerability**. Always add to PR review checklist.

## Timezone Gotcha & Solutions

**Critical**: The system uses Sri Lanka timezone (UTC+5:30).

**Problem**: `new Date().toISOString()` at 11:30 PM may return next day's ISO string, confusing calendar/attendance logic.

**Solution**: 
- Backend stores all times as ISO UTC
- Services expose timezone-aware methods for comparisons:
  ```typescript
  // In service
  getTodayInSriLanka(): Date {
    return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Colombo' }));
  }
  ```
- Frontend applies offset when displaying

**See**: `TIMEZONE_FIX_CORRECT_IMPLEMENTATION.md`, `TIMEZONE_AUDIT_REPORT.md` before implementing date logic.

## Intersceptors & Data Masking

Global NestJS interceptors in `src/common/interceptors/` apply:
- Data masking (hide sensitive user fields)
- Audit logging (log all mutations to DynamoDB)
- Request/response transformation

**After schema changes**: Verify interceptor code doesn't reference deleted entity properties.
```typescript
// Example: This will crash if 'deletedColumn' was removed
if (data.deletedColumn === undefined) { /* mask */ }
```

## Common Pattern: Audit & History

For features with historical records (payments, attendance):
1. Keep main entity in MySQL (current state)
2. Log all changes to DynamoDB with timestamp
3. Service provides `getHistory(id)` returning DynamoDB logs

Example: `ATTENDANCE_MARKING_COMPLETE_API_GUIDE.md` covers this for attendance records.

## Deployment

**Cloud Run** (Google Cloud):
- Image built from `Dockerfile` with NestJS app
- Environment variables injected at runtime (DB host, JWT secret, storage credentials)
- Scaling: 2 CPU, 4Gi memory, auto-scale to 100 instances per region
- **Before deploy**: Run `npm run validate:env` locally to catch missing vars early

## Useful Commands

```bash
# Development
npm run start:dev:local      # Local storage (file-based uploads)
npm run start:dev:aws        # AWS S3 mode
npm run start:dev:google     # Google Cloud Storage mode
npm run lint --fix           # Fix linting errors automatically
npm run security:check       # Validate all env vars present

# Database
npm run migration:run        # Apply pending
npm run migration:revert     # Rollback last
npm run migration:show       # View current state

# Testing
npm run test -- --testPathPattern=auth  # Test specific module
npm run test:debug           # Node inspect mode for debugging
```

## Code Review Checklist for PRs

- [ ] Multi-tenant: All queries include `instituteId` WHERE clause
- [ ] Tests: New service methods have Jest tests
- [ ] Migrations: Schema changes committed as .ts files in `src/migrations/`
- [ ] Timezone: Date operations use Sri Lanka offset or helper function
- [ ] Interceptors: No references to deleted entity properties
- [ ] DTOs: Request validation decorators present
- [ ] Errors: Service throws proper HTTP exceptions (404, 400, 500)
- [ ] Linting: `npm run lint` passes

---

**Feature guides**: Search backend folder for `*_COMPLETE_API_GUIDE.md` or `*_IMPLEMENTATION_GUIDE.md` matching your feature.  
**Architecture**: See `COMPLETE_SYSTEM_AUDIT.md`, `MULTI_TENANT_SYSTEM_ANALYSIS.md` for design rationale.
