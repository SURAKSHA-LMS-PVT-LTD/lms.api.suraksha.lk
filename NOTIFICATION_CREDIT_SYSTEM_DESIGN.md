# Notification Credit-Based System — Design & Architecture Plan

## Current System Audit

### What Exists Today

#### 1. Fixed subscription-plan model (the system to replace)
- `users.subscription_plan` — a single ENUM column selecting one pre-set package  
  (`FREE | WHATSAPP | TELEGRAM | EMAIL | PRO_WHATSAPP | PRO_SMS | PRO_TELEGRAM | PRO_EMAIL | DYNAMAD`)
- `NOTIFICATION_PACKAGES_CONFIG` — static hard-coded map in  
  `src/modules/advertisement/services/notification-packages.config.ts`  
  Each plan name maps to a fixed array of `channels[]` — no per-user on/off toggles.
- `AttendanceNotificationService.sendAttendanceNotification()` reads `data.subscriptionPlan`  
  → looks up `NOTIFICATION_PACKAGES_CONFIG.packages[plan]` → fires all channels in parallel.
- `attendance.service.ts` line 1417 fire-and-forgets into  
  `sendAttendanceNotificationWithAdvertising()` which reads `data.student.subscriptionPlan`.

#### 2. SMS credits — already exists, institute-level
- Entity: `SmsCreditEntity` (`sms_credits` table, PK = `institute_id`)
- Columns: `balance`, `total_purchased`, `total_used`, `last_topup_at`
- Credits are deducted per SMS send.

#### 3. WhatsApp credits — does NOT exist yet (only env-token based)
- WhatsApp is sent via `WHATSAPP_ACCESS_TOKEN` env var — no credit tracking.

#### 4. Push notifications — Firebase FCM, free tier, no credit cost
- `FcmNotificationService` is ready; no cost tracking needed.

#### 5. Email notifications — free; no credit cost needed.

#### 6. Notification logging — DynamoDB (`SmsNotificationLogs`)
- Already logs every SMS to DynamoDB for audit.

#### 7. `users.user_settings` JSON column
- Already has a nested `{ notifications: { email, sms, push } }` shape — **partially prepared but unused by attendance flow**.

---

## Problems with Current System

| Problem | Impact |
|---|---|
| Plan is a static ENUM — cannot toggle individual channels | Admin must reassign entire plan to change one channel |
| No WhatsApp credit ledger | Can't bill per-message; unlimited spend risk |
| SMS credits are institute-level only, not user/parent level | Can't associate cost to specific notification recipient |
| `user_settings.notifications` JSON shape exists but attendance ignores it | Dual truth: plan says "send push" but user turned it off |
| No purchase history or top-up invoices | No audit trail for credit purchases |
| Hard-coded package config means code change to add a new bundle | Forces redeploy for business tier changes |

---

## Recommended Design — Credit + Per-User Toggle System

### Core Architecture

```
Institute buys credits  →  credits stored in per-channel ledger
                                  ↓
When attendance is marked:
  1. Load parent user's notification preferences (per-channel on/off flags)
  2. For each ENABLED channel:
       a. Check institute has enough credits (SMS / WhatsApp)
       b. Deduct credit atomically
       c. Send notification
       d. Log result (DynamoDB)
  3. Push (FCM) and Email are free — always send if enabled
```

---

## Database Schema Design

### Table 1 — Add columns to `users` (per-user notification preferences)

```sql
ALTER TABLE `users`
  ADD COLUMN `notif_push_enabled`      TINYINT(1) NOT NULL DEFAULT 1  COMMENT 'FCM push on/off',
  ADD COLUMN `notif_sms_enabled`       TINYINT(1) NOT NULL DEFAULT 0  COMMENT 'SMS on/off',
  ADD COLUMN `notif_whatsapp_enabled`  TINYINT(1) NOT NULL DEFAULT 0  COMMENT 'WhatsApp on/off',
  ADD COLUMN `notif_email_enabled`     TINYINT(1) NOT NULL DEFAULT 1  COMMENT 'Email on/off';
```

> **Why booleans, not JSON?**  
> The existing `user_settings.notifications` JSON is nullable and not indexed. Separate boolean columns are fast (`WHERE notif_sms_enabled = 1`), type-safe, and trivially migrated.

---

### Table 2 — `notification_credits` (institute-level credit ledger per channel)

Replaces/extends the existing `sms_credits` table. Keep `sms_credits` for backward compat; add a new unified table.

```sql
CREATE TABLE `notification_credits` (
  `id`               BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `institute_id`     BIGINT      NOT NULL,
  `channel`          ENUM('SMS','WHATSAPP') NOT NULL,
  `balance`          DECIMAL(12,4) NOT NULL DEFAULT 0,
  `total_purchased`  DECIMAL(12,4) NOT NULL DEFAULT 0,
  `total_used`       DECIMAL(12,4) NOT NULL DEFAULT 0,
  `low_balance_threshold` DECIMAL(12,4) NOT NULL DEFAULT 10,
  `low_balance_alerted_at` TIMESTAMP NULL,
  `created_at`       TIMESTAMP NOT NULL,
  `updated_at`       TIMESTAMP NOT NULL,
  UNIQUE KEY `uq_institute_channel` (`institute_id`, `channel`),
  INDEX `idx_notif_credits_institute` (`institute_id`)
) ENGINE=InnoDB;
```

---

### Table 3 — `notification_credit_transactions` (full ledger/audit trail)

```sql
CREATE TABLE `notification_credit_transactions` (
  `id`             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `institute_id`   BIGINT       NOT NULL,
  `channel`        ENUM('SMS','WHATSAPP') NOT NULL,
  `txn_type`       ENUM('PURCHASE','DEDUCT','REFUND','ADJUSTMENT') NOT NULL,
  `amount`         DECIMAL(12,4) NOT NULL,   -- positive = credit in, negative = deduct
  `balance_after`  DECIMAL(12,4) NOT NULL,
  `reference_id`   VARCHAR(100) NULL,        -- attendance record ID / invoice ID
  `reference_type` VARCHAR(50) NULL,         -- 'attendance_mark' | 'purchase' | 'refund'
  `description`    VARCHAR(255) NULL,
  `created_by`     BIGINT NULL,              -- admin user who topped up (null = system)
  `created_at`     TIMESTAMP NOT NULL,
  INDEX `idx_notif_txn_institute` (`institute_id`),
  INDEX `idx_notif_txn_channel`   (`institute_id`, `channel`),
  INDEX `idx_notif_txn_type`      (`txn_type`)
) ENGINE=InnoDB;
```

---

### Table 4 — `notification_credit_purchases` (payment submission for top-up)

```sql
CREATE TABLE `notification_credit_purchases` (
  `id`              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `institute_id`    BIGINT        NOT NULL,
  `channel`         ENUM('SMS','WHATSAPP') NOT NULL,
  `package_name`    VARCHAR(100)  NOT NULL,   -- e.g. 'SMS_500', 'WA_1000'
  `credits_amount`  DECIMAL(12,4) NOT NULL,
  `price_lkr`       DECIMAL(10,2) NOT NULL,
  `payment_method`  VARCHAR(50)   NOT NULL,   -- 'BANK_TRANSFER' | 'CARD'
  `payment_reference` VARCHAR(200) NULL,
  `payment_slip_url` VARCHAR(500) NULL,       -- cloud storage / drive link
  `status`          ENUM('PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING',
  `approved_by`     BIGINT        NULL,
  `approved_at`     TIMESTAMP     NULL,
  `rejection_reason` TEXT         NULL,
  `created_at`      TIMESTAMP     NOT NULL,
  `updated_at`      TIMESTAMP     NOT NULL,
  INDEX `idx_notif_purchase_institute` (`institute_id`),
  INDEX `idx_notif_purchase_status`    (`status`)
) ENGINE=InnoDB;
```

---

## Entity & Code Changes

### Modified: `UserEntity` — add 4 boolean columns

```typescript
// src/modules/user/entities/user.entity.ts

@Column({ name: 'notif_push_enabled', type: 'boolean', default: true,
  comment: 'FCM push notifications on/off' })
notifPushEnabled: boolean;

@Column({ name: 'notif_sms_enabled', type: 'boolean', default: false,
  comment: 'SMS attendance notifications on/off' })
notifSmsEnabled: boolean;

@Column({ name: 'notif_whatsapp_enabled', type: 'boolean', default: false,
  comment: 'WhatsApp attendance notifications on/off' })
notifWhatsappEnabled: boolean;

@Column({ name: 'notif_email_enabled', type: 'boolean', default: true,
  comment: 'Email attendance notifications on/off' })
notifEmailEnabled: boolean;
```

---

### New entity: `NotificationCreditEntity`

```typescript
// src/modules/notification-credits/entities/notification-credit.entity.ts

export enum NotificationChannel {
  SMS = 'SMS',
  WHATSAPP = 'WHATSAPP',
}

@Entity('notification_credits')
@Index('uq_institute_channel', ['instituteId', 'channel'], { unique: true })
export class NotificationCreditEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' }) id: string;
  @Column({ name: 'institute_id', type: 'bigint' }) instituteId: string;
  @Column({ name: 'channel', type: 'enum', enum: NotificationChannel }) channel: NotificationChannel;
  @Column({ name: 'balance', type: 'decimal', precision: 12, scale: 4, default: 0 }) balance: number;
  @Column({ name: 'total_purchased', type: 'decimal', precision: 12, scale: 4, default: 0 }) totalPurchased: number;
  @Column({ name: 'total_used', type: 'decimal', precision: 12, scale: 4, default: 0 }) totalUsed: number;
  @Column({ name: 'low_balance_threshold', type: 'decimal', precision: 12, scale: 4, default: 10 }) lowBalanceThreshold: number;
  @Column({ name: 'low_balance_alerted_at', type: 'timestamp', nullable: true }) lowBalanceAlertedAt?: Date;
  @Column({ name: 'created_at', type: 'timestamp' }) createdAt: Date;
  @Column({ name: 'updated_at', type: 'timestamp' }) updatedAt: Date;
}
```

---

### New service: `NotificationCreditService`

Key methods:

```typescript
// src/modules/notification-credits/services/notification-credit.service.ts

async getBalance(instituteId: string, channel: NotificationChannel): Promise<number>

/**
 * Atomically deduct one credit. Returns false if insufficient balance.
 * Uses SELECT ... FOR UPDATE to prevent race conditions.
 */
async deductCredit(
  instituteId: string,
  channel: NotificationChannel,
  referenceId: string,
  referenceType: string,
): Promise<{ success: boolean; balanceAfter: number }>

/**
 * Add credits after admin approves a purchase.
 */
async topUpCredits(
  instituteId: string,
  channel: NotificationChannel,
  amount: number,
  purchaseId: string,
  approvedBy: string,
): Promise<void>

async getLedger(instituteId: string, channel?: NotificationChannel, page?, limit?): Promise<PaginatedLedger>
```

---

### Modified: `AttendanceNotificationData` interface

Add user preference flags so the notification service doesn't need a second DB hit:

```typescript
export interface AttendanceNotificationData {
  // ... existing fields ...
  
  // NEW: parent's per-channel preferences (loaded once when fetching student data)
  parentNotifPrefs?: {
    pushEnabled: boolean;
    smsEnabled: boolean;
    whatsappEnabled: boolean;
    emailEnabled: boolean;
  };
  
  // Keep subscriptionPlan for backward compat / ad logic
  subscriptionPlan: string;
}
```

---

### Modified: `AttendanceNotificationService.sendAttendanceNotification()`

Replace the subscription-plan → channel list lookup with the user preference flags + credit check:

```typescript
async sendAttendanceNotification(data: AttendanceNotificationData): Promise<NotificationSummary> {

  // 1. Build enabled channels from user preferences (not subscription plan)
  const prefs = data.parentNotifPrefs ?? { pushEnabled: true, emailEnabled: true, smsEnabled: false, whatsappEnabled: false };
  
  const channelMap: Record<string, boolean> = {
    push:      prefs.pushEnabled,
    email:     prefs.emailEnabled,
    sms:       prefs.smsEnabled,
    whatsapp:  prefs.whatsappEnabled,
  };

  let channels = Object.entries(channelMap)
    .filter(([, enabled]) => enabled)
    .map(([ch]) => ch);

  // 2. For paid channels (SMS / WhatsApp): check + deduct credit atomically
  if (channels.includes('sms')) {
    const result = await this.creditService.deductCredit(data.instituteId, NotificationChannel.SMS, data.studentId, 'attendance_mark');
    if (!result.success) channels = channels.filter(c => c !== 'sms');
  }
  if (channels.includes('whatsapp')) {
    const result = await this.creditService.deductCredit(data.instituteId, NotificationChannel.WHATSAPP, data.studentId, 'attendance_mark');
    if (!result.success) channels = channels.filter(c => c !== 'whatsapp');
  }

  // 3. Advertisement channel filtering (unchanged: modeOfSending logic)
  // ...existing ad-filter code...

  // 4. Fire all remaining channels in parallel (unchanged)
  const results = await Promise.all(channels.map(ch => this.sendChannelNotification(ch, data, retryConfig)));
  
  // ...
}
```

---

### Modified: `attendance.service.ts` — `fetchStudentWithParentData()`

Load parent's notification prefs when fetching student data for attendance:

```typescript
// When joining parent user, also select the 4 notif columns
const parent = await this.userRepo.findOne({
  where: { id: parentUserId },
  select: ['id', 'phoneNumber', 'email', 'telegramId',
           'notifPushEnabled', 'notifSmsEnabled', 'notifWhatsappEnabled', 'notifEmailEnabled'],
});

// Pass into notificationData:
parentNotifPrefs: {
  pushEnabled:     parent?.notifPushEnabled ?? true,
  emailEnabled:    parent?.notifEmailEnabled ?? true,
  smsEnabled:      parent?.notifSmsEnabled ?? false,
  whatsappEnabled: parent?.notifWhatsappEnabled ?? false,
},
```

---

## API Endpoints

### User-facing (parent manages own notifications)

| Method | Path | Description |
|---|---|---|
| `GET` | `/users/notification-preferences` | Get my 4 channel on/off flags |
| `PATCH` | `/users/notification-preferences` | Update my channel flags |

### Institute admin — credit management

| Method | Path | Description |
|---|---|---|
| `GET` | `/institutes/notification-credits` | Get SMS + WhatsApp balance |
| `GET` | `/institutes/notification-credits/ledger` | Paginated credit transaction history |
| `POST` | `/institutes/notification-credits/purchase` | Submit purchase request (slip upload) |
| `GET` | `/institutes/notification-credits/purchases` | List own purchase requests |

### Super admin — approve top-ups

| Method | Path | Description |
|---|---|---|
| `GET` | `/admin/notification-credit-purchases` | All pending purchases across institutes |
| `PATCH` | `/admin/notification-credit-purchases/:id/approve` | Approve + credit institute |
| `PATCH` | `/admin/notification-credit-purchases/:id/reject` | Reject with reason |
| `POST` | `/admin/notification-credits/manual-topup` | Force top-up without purchase request |

---

## Credit Pricing Config (keep in DB, not hard-coded)

A simple config table or environment variables works. Suggested structure:

```
SMS cost per message:       1 credit  (= LKR ~2.50)
WhatsApp cost per message:  2 credits (= LKR ~5.00)
Push cost:                  0 (free)
Email cost:                 0 (free)
```

Packages to sell:

| Package Name | Channel | Credits | Price (LKR) |
|---|---|---|---|
| `SMS_100` | SMS | 100 | 250 |
| `SMS_500` | SMS | 500 | 1,100 |
| `SMS_1000` | SMS | 1,000 | 2,000 |
| `WA_100` | WhatsApp | 100 | 500 |
| `WA_500` | WhatsApp | 500 | 2,250 |
| `WA_1000` | WhatsApp | 1,000 | 4,000 |

---

## Migration Plan (step-by-step, zero downtime)

### Phase 1 — Schema migration (no behaviour change yet)
1. Add 4 boolean columns to `users` with safe defaults  
   (`notif_push_enabled=1`, `notif_email_enabled=1`, `notif_sms_enabled=0`, `notif_whatsapp_enabled=0`)
2. Create `notification_credits` table
3. Create `notification_credit_transactions` table
4. Create `notification_credit_purchases` table
5. Seed `notification_credits` rows for all existing institutes with current SMS balance copied from `sms_credits`

### Phase 2 — Backfill user preferences from existing subscription plan

Run a one-time script to set the boolean columns based on the user's current subscription plan:

```sql
-- Users on WhatsApp/PRO_WHATSAPP plans → enable WhatsApp
UPDATE users SET notif_whatsapp_enabled = 1
WHERE subscription_plan IN ('WHATSAPP', 'PRO-WHATSAPP', 'PRO-SMS', 'DYNAMAD');

-- Users on plans that included SMS
UPDATE users SET notif_sms_enabled = 1
WHERE subscription_plan IN ('FREE', 'PRO-SMS', 'DYNAMAD');

-- Push + email already default to true
```

### Phase 3 — Update attendance notification flow
- Add `parentNotifPrefs` population in `fetchStudentWithParentData()`
- Inject `NotificationCreditService` into `AttendanceNotificationService`
- Replace plan → channel lookup with preference flags + credit check
- Keep `subscriptionPlan` in `AttendanceNotificationData` for ad-serving logic only (no channel selection)

### Phase 4 — Build new API endpoints
- User notification preferences endpoints (`GET`/`PATCH`)
- Institute credit balance + ledger
- Purchase request + admin approval flow

### Phase 5 — Frontend
- Parent app: toggle switches per channel
- Institute dashboard: credit balance widget, purchase flow
- Admin panel: pending purchase approvals queue

### Phase 6 — Cleanup (later sprint)
- Remove `SubscriptionPlan` enum usage from notification channel selection  
  (keep it if still needed for ad-serving tier)
- Archive `NOTIFICATION_PACKAGES_CONFIG` (keep for now as ad-tier reference)

---

## Files to Create / Modify

### New module: `src/modules/notification-credits/`
```
notification-credits.module.ts
entities/
  notification-credit.entity.ts
  notification-credit-transaction.entity.ts
  notification-credit-purchase.entity.ts
services/
  notification-credit.service.ts
controllers/
  notification-credit-institute.controller.ts   (institute admin)
  notification-credit-admin.controller.ts       (super admin)
dto/
  purchase-credits.dto.ts
  approve-purchase.dto.ts
  credit-ledger-query.dto.ts
  response/credit-balance.response.dto.ts
  response/ledger-entry.response.dto.ts
```

### Modified files
| File | Change |
|---|---|
| `src/modules/user/entities/user.entity.ts` | Add 4 boolean notif columns |
| `src/modules/user/user.controller.ts` | Add GET/PATCH notification preferences endpoints |
| `src/modules/attendance/services/attendance-notification.service.ts` | Replace plan lookup with prefs + credit check |
| `src/modules/attendance/attendance.service.ts` | Load parent notif prefs in fetchStudentWithParentData |
| `src/migrations/` | 2 new migration files |

### Unchanged (no changes needed)
| File | Reason |
|---|---|
| `sms-credit.entity.ts` | Kept for backward compat; SMS channel now also uses `notification_credits` |
| `FcmNotificationService` | Push is free, no credit deduction |
| `NotificationLoggingService` (DynamoDB) | Already logs correctly |
| `advertisement/notification-packages.config.ts` | Kept for ad-tier logic only |

---

## Low-Balance Alert Strategy

When `balance` drops below `low_balance_threshold` after deduction:
1. Check `low_balance_alerted_at` — skip if alert already sent within 24 h.
2. Send email+push to institute admin user.
3. Update `low_balance_alerted_at = NOW()`.

This is done inside `NotificationCreditService.deductCredit()` as a fire-and-forget side-effect.

---

## Summary: Why This Design

| Decision | Rationale |
|---|---|
| Boolean columns on `users` (not JSON) | Fast index scan at attendance time; type-safe; no null JSON parsing |
| Unified `notification_credits` table per channel | Mirrors existing `sms_credits` pattern that already works; separates SMS and WhatsApp ledgers clearly |
| Credit deduction inside notification service (not controller) | Atomic with send; prevents credit spend without delivery attempt |
| `SELECT FOR UPDATE` on deduct | Prevents double-spend under concurrent attendance marking |
| Keep `subscriptionPlan` column | Still drives advertisement-tier logic; remove only after full ad-system migration |
| Phase-by-phase migration | Zero-downtime; existing attendance continues working throughout |
