# Suraksha LMS — ID Strategy Audit & Migration Plan

> **Status:** Design document — no code has been changed.  
> **Scope:** All 91 MySQL entities in `src/` (modules + auth).  
> **Goal:** Identify the security risk from sequential BigInt IDs, define which tables need UUIDs, and lay out an executable, zero-downtime migration path that keeps existing data intact.

---

## 1. The Security Problem with Sequential BigInt IDs

Every table that exposes a BigInt auto-increment primary key in a URL or API response leaks information:

| Attack vector | Example |
|---|---|
| **Enumeration** | `GET /payment/214132421` → try `214132422`, `214132423`… — scrapes all payments |
| **Count inference** | ID `5001` on day 1, `9503` on day 90 → attacker knows ~50 new records/day |
| **Existence probing** | `404` vs `403` confirms whether a record exists at all |
| **Competitor intelligence** | Invoice / order numbers reveal business volume |

Sequential IDs are **not** a substitute for access control, but they are a meaningful additional attack surface even when auth is correct — one misconfigured guard exposes the entire table in a predictable crawl.

---

## 2. Current State — Complete Entity Inventory

### 2.1 BigInt auto-increment (needs review per category below)

| # | Entity / Table | Module | Exposed in API? | Notes |
|---|---|---|---|---|
| 1 | `users` | user | ✅ Yes — JWT subject, all routes | Core identity; human-meaningful number useful on receipts |
| 2 | `institutes` | institute | ✅ Yes — every tenant route | Root multi-tenant key; bigint leaks institute count |
| 3 | `institute_classes` | institute_class | ✅ Yes | Leaked in many route paths |
| 4 | `subjects` | subject | ✅ Yes | Leaked in route paths |
| 5 | `institute_class_payments` | payment | ✅ Yes — receipt, routes | **Receipt uses this ID; must stay human-readable** |
| 6 | `institute_class_payment_submissions` | payment | ✅ Yes — receipt Ref: | **Same — Ref on receipt must stay human-readable** |
| 7 | `institute_payments` | payment | ✅ Yes | Same as above |
| 8 | `institute_payment_submissions` | payment | ✅ Yes | Same as above |
| 9 | `institute_class_subject_payments` | payment | ✅ Yes | Same as above |
| 10 | `institute_class_subject_payment_submissions` | payment | ✅ Yes | Same as above |
| 11 | `payments` (legacy) | payment | ✅ Yes | General payment record |
| 12 | `push_notifications` | push-notifications | ✅ Yes | Notification ID in API |
| 13 | `notification_recipients` | push-notifications | Internal only | Join table; low risk |
| 14 | `notification_reads` | push-notifications | Internal only | Join table; low risk |
| 15 | `institute_calendar_days` | institute | ✅ Yes | Calendar API routes |
| 16 | `institute_calendar_events` | institute | ✅ Yes | Calendar API routes |
| 17 | `institute_class_calendars` | institute | ✅ Yes | Calendar API routes |
| 18 | `institute_sms_messages` | sms | ✅ Yes | SMS history API |
| 19 | `sms_campaigns` | sms | ✅ Yes | Campaign management |
| 20 | `sender_masks` | sms | ✅ Yes | Mask management |
| 21 | `institute_sms_credentials` | sms | Internal only | Already varchar(36) PK |
| 22 | `institute_sms_payment_submissions` | sms | ✅ Yes | SMS-payment link |
| 23 | `attendance_records` | attendance | ✅ Yes | Attendance view; also DynamoDB keyed |
| 24 | `institute_class_attendance_sessions` | attendance | ✅ Yes | Session management API |
| 25 | `institute_class_attendance_session_groups` | attendance | ✅ Yes | Group management API |
| 26 | `attendance_devices` | attendance-device | ✅ Yes | Device management |
| 27 | `attendance_device_configs` | attendance-device | ✅ Yes | Config API |
| 28 | `attendance_device_sessions` | attendance-device | ✅ Yes | Session tracking |
| 29 | `attendance_device_event_bindings` | attendance-device | ✅ Yes | Event bindings |
| 30 | `attendance_device_audit_logs` | attendance-device | Internal only | Audit log; low risk |
| 31 | `institute_class_subject_exams` | exam | ✅ Yes | Exam management |
| 32 | `institute_class_subject_homeworks` | homework | ✅ Yes | Homework management |
| 33 | `institute_class_subject_homework_references` | homework | ✅ Yes | Reference files |
| 34 | `finance_accounts` | finance | ✅ Yes | Finance hub |
| 35 | `finance_categories` | finance | ✅ Yes | Finance hub |
| 36 | `finance_ledger` | finance | ✅ Yes | Ledger entries |
| 37 | `teacher_wallets` | finance | ✅ Yes | Teacher finance |
| 38 | `institute_drive_files` | institute-drive | ✅ Yes | Drive file API |
| 39 | `institute_drive_tokens` | institute-drive | Internal only | Token store |
| 40 | `user_drive_files` | user-drive | ✅ Yes | Drive file API |
| 41 | `user_drive_tokens` | user-drive | Internal only | Token store |
| 42 | `user_fcm_tokens` | user | Internal only | Push token store |
| 43 | `user_images` | user | Internal only | Image log |
| 44 | `user_otps` | user | Internal only | OTP; short-lived |
| 45 | `institute_login_sessions` | auth | Internal only | Session store |
| 46 | `password_resets` | auth | Internal only | Reset tokens |
| 47 | `login_events` | tenant | Internal only | Audit log |
| 48 | `monthly_billing_summaries` | tenant | Internal only | Billing internal |
| 49 | `tenant_billing_payments` | tenant | ✅ Yes | Billing portal |
| 50 | `institute_billing_configs` | tenant | Internal only | Config store |
| 51 | `institute_feature_permissions` | rbac | Internal only | Permission records |
| 52 | `institute_user_types` | rbac | ✅ Yes | RBAC management |
| 53 | `institute_feature_toggles` | features | Internal only | Toggle store |
| 54 | `cards` | user-card | ✅ Yes | Card management |
| 55 | `card_payments` | user-card | ✅ Yes | Card payment records |
| 56 | `user_id_card_orders` | user-card | ✅ Yes | Card orders |
| 57 | `account_deletion_requests` | account-deletion | Internal only | Admin management |
| 58 | `reason_of_parent_skips` | student | Internal only | Internal log |
| 59 | `institute_operating_configs` | institute | Internal only | Config store |
| 60 | `sms_sender_masks` | sms | ✅ Yes | Mask management |
| 61 | `lectures` (structured module) | structured-lectures | ✅ Yes | Lecture API |
| 62 | `bookhires` | private-transport | ✅ Yes | Transport API |

### 2.2 Already using UUID (no change needed)

| Entity / Table | Module | Notes |
|---|---|---|
| `advertisements` | advertisement | `@PrimaryGeneratedColumn('uuid')` ✅ |
| `structured_lectures` | structured-lectures | `@PrimaryGeneratedColumn('uuid')` ✅ |
| `refresh_tokens` | auth | `@PrimaryGeneratedColumn('uuid')` ✅ |
| `otp_verification_codes` | auth | `@PrimaryGeneratedColumn('uuid')` ✅ |
| `bookhire_owners` | private-transport | `@PrimaryGeneratedColumn('uuid')` ✅ |
| `student_bookhire_attendances` | private-transport | `@PrimaryGeneratedColumn('uuid')` ✅ |
| `student_bookhire_enrollments` | private-transport | `@PrimaryGeneratedColumn('uuid')` ✅ |

### 2.3 Composite BigInt primary keys (special handling)

| Entity / Table | Key columns | Notes |
|---|---|---|
| `institute_class_students` | `(institute_id, institute_class_id, student_user_id)` | Membership join table — no separate PK needed |
| `institute_class_subjects` | `(institute_id, class_id, subject_id)` | Same — composite is correct |
| `students` | `user_id` (FK as PK) | 1-to-1 extension of user |

### 2.4 Special PK strings (fine as-is)

| Entity / Table | PK type | Notes |
|---|---|---|
| `feature_catalog` | `varchar` (feature_key) | Semantic key — correct design |
| `institute_sms_credentials` | `varchar(36)` | Already UUID-like string |

---

## 3. Classification & Decision

The key insight from the user's requirement:

> *"user id require still manage like 251041432 etc number — no need one by one but like classes etc no need it — but again like payment one 214132421 require for receipt in bills"*

This translates to three tiers:

### Tier A — Keep BigInt (human-readable numbers required)

These IDs appear on **printed documents, SMS receipts, or user-visible references** where a short memorable number is desirable. UUIDs would make these unusable on paper.

| Table | Reason |
|---|---|
| `users` | User ID shown in institute dashboards, attendance sheets, ID cards; format `251041432` is the student's system number |
| `institute_class_payments` | Payment ID appears on receipts |
| `institute_class_payment_submissions` | **Receipt Ref number** — must be short and readable |
| `institute_payments` | Same — institute-level payment receipts |
| `institute_payment_submissions` | Same |
| `institute_class_subject_payments` | Same |
| `institute_class_subject_payment_submissions` | Same |
| `payments` (legacy) | Legacy receipts |

**Action:** Keep BigInt. **Harden with access control only** — no ID change.  
**Controller hardening:** Ensure every route has `@UseGuards(JwtAuthGuard, FlexibleAccessGuard)` + ownership check. The ParseBigIntPipe stays.

### Tier B — Migrate to UUID (exposed, no human-readability need)

These IDs are used in API routes and responses but have **no receipt/document/display requirement**. Sequential exposure is a real risk.

| Table | Current | Target | Priority |
|---|---|---|---|
| `institutes` | BIGINT | UUID | 🔴 Critical — root multi-tenant key; leaks institute count |
| `institute_classes` | BIGINT | UUID | 🔴 High |
| `subjects` | BIGINT | UUID | 🔴 High |
| `institute_class_attendance_sessions` | BIGINT | UUID | 🟡 Medium |
| `institute_class_attendance_session_groups` | BIGINT | UUID | 🟡 Medium |
| `push_notifications` | BIGINT | UUID | 🟡 Medium |
| `institute_calendar_days` | BIGINT | UUID | 🟡 Medium |
| `institute_calendar_events` | BIGINT | UUID | 🟡 Medium |
| `institute_class_calendars` | BIGINT | UUID | 🟡 Medium |
| `attendance_records` | BIGINT | UUID | 🟡 Medium |
| `attendance_devices` | BIGINT | UUID | 🟡 Medium |
| `attendance_device_configs` | BIGINT | UUID | 🟡 Medium |
| `attendance_device_sessions` | BIGINT | UUID | 🟡 Medium |
| `institute_class_subject_exams` | BIGINT | UUID | 🟡 Medium |
| `institute_class_subject_homeworks` | BIGINT | UUID | 🟡 Medium |
| `finance_accounts` | BIGINT | UUID | 🟡 Medium |
| `finance_categories` | BIGINT | UUID | 🟡 Medium |
| `finance_ledger` | BIGINT | UUID | 🟡 Medium |
| `teacher_wallets` | BIGINT | UUID | 🟡 Medium |
| `institute_drive_files` | BIGINT | UUID | 🟢 Low |
| `user_drive_files` | BIGINT | UUID | 🟢 Low |
| `cards` | BIGINT | UUID | 🟡 Medium |
| `user_id_card_orders` | BIGINT | UUID | 🟡 Medium |
| `card_payments` | BIGINT | UUID | 🟡 Medium |
| `tenant_billing_payments` | BIGINT | UUID | 🟡 Medium |
| `institute_user_types` | BIGINT | UUID | 🟢 Low |
| `institute_sms_messages` | BIGINT | UUID | 🟢 Low |
| `sms_campaigns` | BIGINT | UUID | 🟢 Low |
| `sender_masks` / `sms_sender_masks` | BIGINT | UUID | 🟢 Low |
| `bookhires` | INT | UUID | 🟢 Low |
| `lectures` (structured module) | BIGINT | UUID | 🟢 Low |

### Tier C — Internal only (keep BigInt or any — not exposed)

These never appear in URLs or external-facing responses. Risk is negligible.

`user_fcm_tokens`, `user_images`, `user_otps`, `institute_login_sessions`, `password_resets`, `login_events`, `monthly_billing_summaries`, `institute_billing_configs`, `institute_feature_permissions`, `institute_feature_toggles`, `notification_recipients`, `notification_reads`, `attendance_device_audit_logs`, `attendance_device_event_bindings`, `institute_drive_tokens`, `user_drive_tokens`, `account_deletion_requests`, `reason_of_parent_skips`, `institute_operating_configs`, `institute_sms_payment_submissions`

**Action:** No change required. Focus effort on Tier B.

---

## 4. Why String Type Already Makes Migration Safe

The existing codebase already uses `string` (not `number` or `bigint`) for all ID fields in TypeScript:

```typescript
// Current — entity
@PrimaryGeneratedColumn('increment', { type: 'bigint' })
id: string;  // ← already a string in TS

// Target — entity  
@PrimaryGeneratedColumn('uuid')
id: string;  // ← same TS type
```

And in controllers:
```typescript
// Current
@Param('id', ParseBigIntPipe) id: string  // validates numeric string

// Target
@Param('id') id: string  // accepts UUID string — remove ParseBigIntPipe
```

**This means:**
- All existing service code that uses `id: string` continues to compile unchanged.
- All existing API clients (frontend) that store IDs as strings continue to work.
- No TypeScript type changes are needed — only the DB column type and generator change.
- The pipe swap is the only controller change per endpoint.

---

## 5. Migration Strategy — Zero Downtime, Data Preserved

### 5.1 Principle: Dual-column migration

Never drop the old numeric ID in the same migration that adds UUID. Run three phases across three deployments:

```
Phase 1 (add)   → Deploy → Phase 2 (swap) → Deploy → Phase 3 (drop)
```

### 5.2 Phase 1 — Add UUID column alongside BigInt

For each Tier B table, add `uuid` column, populate it, add unique index:

```sql
-- Example: institutes table
ALTER TABLE `institutes`
  ADD COLUMN `uuid` VARCHAR(36) NULL AFTER `id`,
  ADD UNIQUE INDEX `idx_institutes_uuid` (`uuid`);

-- Backfill existing rows (run as batch to avoid lock contention)
UPDATE `institutes` SET `uuid` = UUID() WHERE `uuid` IS NULL;

-- Make non-nullable once backfill is complete
ALTER TABLE `institutes` MODIFY `uuid` VARCHAR(36) NOT NULL;
```

**NestJS migration file example:**
```typescript
// src/migrations/1760000000000-AddUuidToInstitutes.ts
export class AddUuidToInstitutes1760000000000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE \`institutes\` ADD COLUMN \`uuid\` VARCHAR(36) NULL`);
    await qr.query(`ALTER TABLE \`institutes\` ADD UNIQUE INDEX \`idx_institutes_uuid\` (\`uuid\`)`);
    // Batch backfill — safe for large tables
    let offset = 0;
    const batchSize = 5000;
    while (true) {
      const result = await qr.query(
        `UPDATE \`institutes\` SET \`uuid\` = UUID() WHERE \`uuid\` IS NULL LIMIT ${batchSize}`
      );
      if (result.affectedRows === 0) break;
      offset += batchSize;
    }
    await qr.query(`ALTER TABLE \`institutes\` MODIFY \`uuid\` VARCHAR(36) NOT NULL`);
  }
  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE \`institutes\` DROP INDEX \`idx_institutes_uuid\``);
    await qr.query(`ALTER TABLE \`institutes\` DROP COLUMN \`uuid\``);
  }
}
```

After this migration:
- Old API routes using numeric ID still work (BigInt `id` column intact).
- New API routes can start using `uuid` column.
- **No existing data changed.**

### 5.3 Phase 2 — Make UUID the primary key

Once all API consumers have switched to UUID-based routes:

```sql
-- Drop old PK, rename columns
ALTER TABLE `institutes`
  DROP PRIMARY KEY,
  CHANGE COLUMN `id` `_legacy_id` BIGINT NOT NULL,
  CHANGE COLUMN `uuid` `id` VARCHAR(36) NOT NULL,
  ADD PRIMARY KEY (`id`);

-- Update all FK columns referencing institutes.id
-- (do same dual-column swap on FK side first)
```

**Entity change:**
```typescript
// Before
@PrimaryGeneratedColumn('increment', { type: 'bigint' })
id: string;

// After
@PrimaryGeneratedColumn('uuid')
id: string;

// Keep legacy numeric for reference / backward compat queries
@Column({ name: '_legacy_id', type: 'bigint', nullable: true })
legacyId: string;
```

### 5.4 Phase 3 — Drop legacy column

Once stable (suggest 30+ days):
```sql
ALTER TABLE `institutes` DROP COLUMN `_legacy_id`;
```

### 5.5 Foreign key migration order

Migrate tables in dependency order (parents before children):

```
1. users              (Tier A — keep, but add uuid if needed for routes)
2. institutes         (Tier B — all other tables FK to this)
3. institute_classes  (FK → institutes)
4. subjects           (FK → institutes)
5. institute_class_attendance_sessions (FK → institute_classes)
6. finance_accounts   (FK → institutes)
... etc
```

For composite-key tables (`institute_class_students`) — no change to composite PK, but the referenced `institute_id` / `class_id` columns will change type as parent tables migrate.

---

## 6. Performance Impact Analysis

### 6.1 Storage cost

| Type | Bytes per value | Index bytes |
|---|---|---|
| BIGINT | 8 bytes | 8 bytes |
| VARCHAR(36) UUID | 36 bytes | 36 bytes |
| BINARY(16) UUID | 16 bytes | 16 bytes |

**Option A — VARCHAR(36):** Simple, readable in `SELECT *`, debuggable. 4.5× larger index than BigInt.  
**Option B — BINARY(16):** 2× larger than BigInt, requires `UUID_TO_BIN()` / `BIN_TO_UUID()` in queries. Less debuggable.

**Recommendation:** Use **VARCHAR(36)** for developer ergonomics. For `institutes` and `users` (highest FK fan-out), evaluate BINARY(16) if table exceeds 10M rows.

### 6.2 Index efficiency

BigInt B-tree indexes are maximally compact and cache-friendly. UUID (v4) values are **random** — they cause B-tree page splits and fragmentation:

| Metric | BigInt autoincrement | UUID v4 (VARCHAR) | UUID v7 (ordered) |
|---|---|---|---|
| Insert order | Sequential → minimal splits | Random → frequent splits | Sequential → minimal splits |
| Index fragmentation | Very low | High at scale | Low |
| Read locality | Excellent | Poor | Good |
| Range scan | Efficient | N/A | Good |

**Recommendation for Tier B tables that are write-heavy** (attendance_records, finance_ledger, push_notifications):  
Use **UUID v7** (time-ordered) instead of UUID v4. MySQL 8.0.28+ has `UUID_TO_BIN(UUID(), 1)` with swap flag that achieves ordering. Alternatively use a NanoID with timestamp prefix.

```typescript
// Ordered UUID helper (can use 'ulid' npm package instead)
import { v7 as uuidv7 } from 'uuid'; // npm i uuid@^9 — v7 is time-ordered

@BeforeInsert()
generateId() {
  if (!this.id) this.id = uuidv7();
}
```

### 6.3 JOIN performance

When `institutes.id` changes from BIGINT to VARCHAR(36), every JOIN that references `institute_id` FK column must compare 36-byte strings instead of 8-byte integers. For hot join paths (attendance queries, payment lookups) this adds ~15–30% CPU overhead on large result sets.

**Mitigation:** Add covering indexes on the most common join patterns. The overhead is acceptable at current scale (<1M rows per table).

### 6.4 Existing numeric IDs — backward compatibility

Because TypeScript already uses `string` everywhere, and because the dual-column migration keeps the old BigInt in `_legacy_id`, API responses can include both:

```json
{
  "id": "018e7c3d-...",      // new UUID — use in all new API calls
  "legacyId": "214132421"    // old numeric — still valid for receipt display
}
```

Frontend routes using `/class/214132421/...` continue working during Phase 1→2 transition window by looking up `WHERE _legacy_id = ?` in a compatibility shim.

---

## 7. Controller Changes Per Table

For each Tier B table endpoint, the change is mechanical:

```typescript
// BEFORE
@Get(':id')
@UseGuards(JwtAuthGuard)
async getOne(@Param('id', ParseBigIntPipe) id: string) { ... }

// AFTER
@Get(':id')
@UseGuards(JwtAuthGuard)
async getOne(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) { ... }
```

A **custom `ParseIdPipe`** can accept either format during the transition window:

```typescript
// src/common/pipes/parse-id.pipe.ts
@Injectable()
export class ParseIdPipe implements PipeTransform {
  transform(value: string): string {
    if (!value?.trim()) throw new BadRequestException('ID is required');
    // Accept UUID (v4/v7) or numeric (legacy BigInt)
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
    const isNumeric = /^\d{1,20}$/.test(value);
    if (!isUuid && !isNumeric) throw new BadRequestException(`Invalid ID format: ${value}`);
    return value;
  }
}
```

During transition: routes accept both. After Phase 3: switch to `ParseUUIDPipe` only.

---

## 8. What Does NOT Need to Change

| Item | Reason |
|---|---|
| JWT payload (`sub` claim) | User ID stays BigInt — the JWT `sub` is the numeric user ID |
| Receipt / bill reference numbers | Payment submission IDs stay BigInt — they ARE the bill numbers |
| ParseBigIntPipe on user routes | User IDs stay numeric |
| ParseBigIntPipe on payment routes | Payment IDs stay numeric |
| Composite join tables | No external-facing single ID; composite is correct |
| Frontend TypeScript string types | Already `string` — no change |
| DynamoDB keys (attendance) | Already string-based attendance IDs in DynamoDB |
| Internal audit / log tables | Not exposed; risk is negligible |
| OTP tables | Short-lived; not exposed |
| FCM token tables | Not exposed |

---

## 9. Prioritised Migration Roadmap

### Sprint 1 — Critical (2–3 days)
**Target:** `institutes`, `institute_classes`, `subjects`  
These are the root FKs that everything else references. Migrating them first unblocks all downstream tables.

- [ ] Add `uuid` columns (Phase 1 migration)
- [ ] Update entity definitions (add `legacyId` field, change generator)
- [ ] Add `ParseIdPipe` to replace `ParseBigIntPipe` on institute/class/subject controllers
- [ ] Frontend: update API calls to use UUID from response `id` field
- [ ] Deploy + monitor

### Sprint 2 — High (3–5 days)
**Target:** Attendance sessions, calendar, attendance records, devices

- [ ] `institute_class_attendance_sessions` + groups
- [ ] `institute_calendar_days` + events + class calendars
- [ ] `attendance_records`
- [ ] `attendance_devices` + configs + sessions

### Sprint 3 — Medium (3–5 days)
**Target:** Finance, push notifications, exams, homeworks

- [ ] `finance_accounts` + categories + ledger + teacher_wallets
- [ ] `push_notifications`
- [ ] `institute_class_subject_exams`
- [ ] `institute_class_subject_homeworks` + references

### Sprint 4 — Lower (2–3 days)
**Target:** Cards, drive, SMS, transport, billing

- [ ] `cards` + card_payments + user_id_card_orders
- [ ] `institute_drive_files`, `user_drive_files`
- [ ] `sms_campaigns`, `sender_masks`, `institute_sms_messages`
- [ ] `bookhires`
- [ ] `tenant_billing_payments`
- [ ] `institute_user_types`

### Sprint 5 — Cleanup (1 day)
- [ ] Drop all `_legacy_id` columns from Phase 1 tables
- [ ] Remove `ParseIdPipe` transition shim, switch to `ParseUUIDPipe`
- [ ] Update Swagger docs

---

## 10. Summary Decision Matrix

| Entity group | ID type decision | Rationale |
|---|---|---|
| `users` | **Keep BigInt** | Student/teacher ID number is on physical ID cards, attendance sheets, receipts |
| `payment` + `*_submissions` | **Keep BigInt** | Bill reference numbers on printed receipts must be short and human-readable |
| `institutes` | **Migrate to UUID** | 🔴 Highest priority — root key, leaks institute count |
| `institute_classes` | **Migrate to UUID** | 🔴 High — leaks class count per institute |
| `subjects` | **Migrate to UUID** | 🔴 High |
| Attendance sessions/groups | **Migrate to UUID** | 🟡 Medium |
| Calendar entities | **Migrate to UUID** | 🟡 Medium |
| Finance entities | **Migrate to UUID** | 🟡 Medium |
| Push notifications | **Migrate to UUID** | 🟡 Medium |
| Cards/orders | **Migrate to UUID** | 🟡 Medium |
| Exams/homeworks | **Migrate to UUID** | 🟡 Medium |
| Internal-only tables | **No change needed** | Not exposed; access-control risk is negligible |
| Already UUID tables | **No change** | ✅ Already correct |

---

## 11. Can Current Data Be Kept As-Is?

**Yes, completely.** The migration is purely additive in Phase 1:

1. New `uuid VARCHAR(36)` column added alongside existing `id BIGINT`.
2. Existing rows get a UUID backfilled — their numeric ID is untouched.
3. All existing foreign key values remain valid.
4. API responses can expose both `id` (UUID) and `legacyId` (BigInt number) simultaneously.
5. Frontend code that stored the old numeric ID continues to resolve via `WHERE _legacy_id = ?` lookups during the transition window.
6. No data is deleted or modified — only new columns added, then old columns eventually dropped after the cutover is stable.

The TypeScript `string` type already used for all IDs means **zero application code changes are needed** at Phase 1. The entity decorator changes and controller pipe swaps are the only code modifications required, and they can be done incrementally per module.

---

*Document generated: 2026-05-16. Update after each sprint completion.*
