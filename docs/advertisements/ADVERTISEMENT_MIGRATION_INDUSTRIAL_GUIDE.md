# Advertisement Module — Industrial-Grade Migration Guide

> **Generated:** 2025-01-XX  
> **Database:** MySQL 8.x · TypeORM · `synchronize: false`  
> **Entity:** `AdvertisementEntity` → table `advertisements`  
> **Status:** No migration files exist yet for this table

---

## Table of Contents

1. [Current Schema Analysis](#1-current-schema-analysis)
2. [Migration #1 — Initial Schema (Baseline)](#2-migration-1--initial-schema-baseline)
3. [Migration #2 — Index Optimization](#3-migration-2--index-optimization)
4. [Migration #3 — Frequency Capping Table](#4-migration-3--frequency-capping-table)
5. [Migration #4 — Impression Ledger Table](#5-migration-4--impression-ledger-table)
6. [Migration #5 — A/B Testing Support](#6-migration-5--ab-testing-support)
7. [Migration #6 — Budget & Billing Normalization](#7-migration-6--budget--billing-normalization)
8. [Migration #7 — Soft Delete & Archival](#8-migration-7--soft-delete--archival)
9. [Migration #8 — Advertiser/Campaign Hierarchy](#9-migration-8--advertisercampaign-hierarchy)
10. [Migration #9 — Advanced Targeting Normalization](#10-migration-9--advanced-targeting-normalization)
11. [Migration #10 — Performance Partitioning](#11-migration-10--performance-partitioning)
12. [Data Migration Strategies](#12-data-migration-strategies)
13. [Rollback Playbook](#13-rollback-playbook)
14. [Pre-Flight Checklist](#14-pre-flight-checklist)
15. [Post-Migration Verification](#15-post-migration-verification)

---

## 1. Current Schema Analysis

### 1.1 Existing Entity Columns (30+)

| Column | DB Type | Notes |
|--------|---------|-------|
| `id` | `UUID` (PK) | `PrimaryGeneratedColumn('uuid')` |
| `title` | `VARCHAR(255)` | NOT NULL |
| `access_key` | `VARCHAR(100)` | NOT NULL |
| `description` | `TEXT` | Nullable |
| `mediaUrl` | `VARCHAR(500)` | Nullable, auto-transformed via `@AfterLoad` |
| `landingUrl` | `VARCHAR(1000)` | Nullable |
| `sendingUrl` | `VARCHAR(500)` | Nullable |
| `supportivePlatforms` | `SET(...)` | SMS, WhatsApp, Telegram, Email, etc. |
| `mediaType` | `ENUM('image','video','audio','pdf')` | Default: `image` |
| `targetInstituteIds` | `JSON` | Nullable array |
| `targetCities` | `JSON` | Nullable array |
| `targetProvinces` | `SET(...)` | Province enum values |
| `targetDistricts` | `SET(...)` | District enum values |
| `minBornYear` | `INT` | Nullable |
| `maxBornYear` | `INT` | Nullable |
| `targetGenders` | `SET(...)` | Gender enum values |
| `targetOccupations` | `JSON` | Nullable |
| `targetUserTypes` | `SET(...)` | UserType enum values |
| `targetSubscriptionPlans` | `SET(...)` | SubscriptionPlan enum values |
| `displayDuration` | `INT` | Default: 30 |
| `priority` | `INT` | Default: 1 |
| `isActive` | `BOOLEAN` | Default: true |
| `startDate` | `DATETIME` | NOT NULL |
| `endDate` | `DATETIME` | NOT NULL |
| `maxSendings` | `INT` | Default: 1000 |
| `currentSendings` | `INT` | Default: 0 — **hot counter, write contention** |
| `cascadeToParents` | `BOOLEAN` | Default: false |
| `clickCount` | `INT` | Default: 0 — **hot counter** |
| `impressionCount` | `INT` | Default: 0 — **hot counter** |
| `budget` | `DECIMAL(10,2)` | Nullable |
| `costPerClick` | `DECIMAL(6,4)` | Nullable |
| `costPerImpression` | `DECIMAL(6,4)` | Nullable |
| `createdBy` | `VARCHAR(36)` | Nullable |
| `created_at` | `TIMESTAMP` | Auto via `@CreateDateColumn` |
| `updated_at` | `TIMESTAMP` | Auto via `@UpdateDateColumn` |

### 1.2 Existing Indexes (8)

```
idx_advertisements_isActive_startDate_endDate   (composite — critical for active ads)
idx_advertisements_priority
idx_advertisements_mediaType
idx_advertisements_createdBy
idx_advertisements_targetUserTypes
idx_advertisements_targetSubscriptionPlans
idx_advertisements_minBornYear_maxBornYear
idx_advertisements_targetGenders
```

### 1.3 Identified Schema Problems

| # | Problem | Severity | Impact |
|---|---------|----------|--------|
| 1 | Hot counters (`currentSendings`, `impressionCount`, `clickCount`) on same row cause write contention | **CRITICAL** | Lock contention at scale, lost updates |
| 2 | `SET` columns for targeting (Provinces, Districts, Genders, etc.) cannot be efficiently indexed or queried with `FIND_IN_SET` | **HIGH** | Full table scans for targeting queries |
| 3 | No frequency capping — same user can see same ad unlimited times | **HIGH** | Poor UX, wasted impressions |
| 4 | No impression/click audit trail — only aggregate counters | **MEDIUM** | Cannot debug, reconcile, or do cohort analysis |
| 5 | `JSON` columns (`targetInstituteIds`, `targetCities`, `targetOccupations`) cannot be indexed natively in MySQL 5.x | **MEDIUM** | Slow targeting queries |
| 6 | No soft delete — ads are either active or permanently lost | **MEDIUM** | No recovery path |
| 7 | No advertiser/campaign hierarchy — flat structure | **LOW** | Cannot group/manage campaigns |
| 8 | Budget/cost fields on the ad itself — no proper billing ledger | **LOW** | Cannot track spend accurately |

---

## 2. Migration #1 — Initial Schema (Baseline)

> **Priority:** REQUIRED · **Risk:** LOW (additive)  
> **Purpose:** Create the first migration file to capture the current schema as a baseline. This allows future migrations to reference a known starting point.

```typescript
// src/migrations/1738000000000-CreateAdvertisementsBaseline.ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAdvertisementsBaseline1738000000000 implements MigrationInterface {
  name = 'CreateAdvertisementsBaseline1738000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if table already exists (it was created via synchronize: true historically)
    const tableExists = await queryRunner.hasTable('advertisements');
    
    if (!tableExists) {
      await queryRunner.query(`
        CREATE TABLE \`advertisements\` (
          \`id\` VARCHAR(36) NOT NULL,
          \`title\` VARCHAR(255) NOT NULL,
          \`access_key\` VARCHAR(100) NOT NULL,
          \`description\` TEXT NULL,
          \`mediaUrl\` VARCHAR(500) NULL,
          \`landingUrl\` VARCHAR(1000) NULL,
          \`sendingUrl\` VARCHAR(500) NULL,
          \`supportivePlatforms\` SET('sms','whatsapp','telegram','email','mobile-push','web-push') NULL,
          \`mediaType\` ENUM('image','video','audio','pdf') NOT NULL DEFAULT 'image',
          \`targetInstituteIds\` JSON NULL,
          \`targetCities\` JSON NULL,
          \`targetProvinces\` SET(/* Province enum values */) NULL,
          \`targetDistricts\` SET(/* District enum values */) NULL,
          \`minBornYear\` INT NULL,
          \`maxBornYear\` INT NULL,
          \`targetGenders\` SET('MALE','FEMALE','OTHER') NULL,
          \`targetOccupations\` JSON NULL,
          \`targetUserTypes\` SET('SUPER_ADMIN','INSTITUTE_ADMIN','TEACHER','STUDENT','PARENT','OWNER','ATTENDANCE_MARKER') NULL,
          \`targetSubscriptionPlans\` SET(/* SubscriptionPlan values */) NULL,
          \`displayDuration\` INT NOT NULL DEFAULT 30,
          \`priority\` INT NOT NULL DEFAULT 1,
          \`isActive\` TINYINT NOT NULL DEFAULT 1,
          \`startDate\` DATETIME NOT NULL,
          \`endDate\` DATETIME NOT NULL,
          \`maxSendings\` INT NOT NULL DEFAULT 1000,
          \`currentSendings\` INT NOT NULL DEFAULT 0,
          \`cascadeToParents\` TINYINT NOT NULL DEFAULT 0,
          \`clickCount\` INT NOT NULL DEFAULT 0,
          \`impressionCount\` INT NOT NULL DEFAULT 0,
          \`budget\` DECIMAL(10,2) NULL,
          \`costPerClick\` DECIMAL(6,4) NULL,
          \`costPerImpression\` DECIMAL(6,4) NULL,
          \`createdBy\` VARCHAR(36) NULL,
          \`created_at\` TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          \`updated_at\` TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
          PRIMARY KEY (\`id\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);
    }

    // Ensure indexes exist (idempotent)
    await this.createIndexIfNotExists(queryRunner, 'advertisements', 'IDX_ad_active_dates', ['isActive', 'startDate', 'endDate']);
    await this.createIndexIfNotExists(queryRunner, 'advertisements', 'IDX_ad_priority', ['priority']);
    await this.createIndexIfNotExists(queryRunner, 'advertisements', 'IDX_ad_media_type', ['mediaType']);
    await this.createIndexIfNotExists(queryRunner, 'advertisements', 'IDX_ad_created_by', ['createdBy']);
    await this.createIndexIfNotExists(queryRunner, 'advertisements', 'IDX_ad_target_user_types', ['targetUserTypes']);
    await this.createIndexIfNotExists(queryRunner, 'advertisements', 'IDX_ad_target_plans', ['targetSubscriptionPlans']);
    await this.createIndexIfNotExists(queryRunner, 'advertisements', 'IDX_ad_born_year', ['minBornYear', 'maxBornYear']);
    await this.createIndexIfNotExists(queryRunner, 'advertisements', 'IDX_ad_target_genders', ['targetGenders']);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // WARNING: Only drop if you're absolutely sure this was a fresh creation
    // await queryRunner.query(`DROP TABLE IF EXISTS \`advertisements\``);
  }

  private async createIndexIfNotExists(
    queryRunner: QueryRunner, table: string, name: string, columns: string[]
  ): Promise<void> {
    const result = await queryRunner.query(
      `SELECT COUNT(*) as cnt FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
      [table, name]
    );
    if (result[0].cnt === 0) {
      await queryRunner.query(`CREATE INDEX \`${name}\` ON \`${table}\` (${columns.map(c => `\`${c}\``).join(', ')})`);
    }
  }
}
```

---

## 3. Migration #2 — Index Optimization

> **Priority:** HIGH · **Risk:** LOW (online DDL)  
> **Purpose:** Replace inefficient SET-column indexes with covering composite indexes for the actual query patterns used by `AdvertisementCacheService.getActiveAdvertisements()`.

### Current Query Pattern (from cache service):
```sql
SELECT ... FROM advertisements 
WHERE isActive = 1 
  AND startDate <= NOW() AND endDate >= NOW() 
  AND currentSendings < maxSendings 
ORDER BY priority DESC, created_at DESC
```

### Optimal Covering Index:

```typescript
// src/migrations/1738100000000-OptimizeAdvertisementIndexes.ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class OptimizeAdvertisementIndexes1738100000000 implements MigrationInterface {
  name = 'OptimizeAdvertisementIndexes1738100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop inefficient single-column indexes on SET columns
    // SET columns use FIND_IN_SET() which cannot use B-tree indexes
    await queryRunner.query(`ALTER TABLE \`advertisements\` DROP INDEX IF EXISTS \`IDX_ad_target_user_types\``);
    await queryRunner.query(`ALTER TABLE \`advertisements\` DROP INDEX IF EXISTS \`IDX_ad_target_plans\``);
    await queryRunner.query(`ALTER TABLE \`advertisements\` DROP INDEX IF EXISTS \`IDX_ad_target_genders\``);
    await queryRunner.query(`ALTER TABLE \`advertisements\` DROP INDEX IF EXISTS \`IDX_ad_media_type\``);

    // Create optimal covering index for active-ads query
    // This covers the WHERE, ORDER BY, and a subset of SELECT
    await queryRunner.query(`
      CREATE INDEX \`IDX_ad_active_query_covering\` 
      ON \`advertisements\` (\`isActive\`, \`startDate\`, \`endDate\`, \`currentSendings\`, \`priority\` DESC, \`created_at\` DESC)
    `);

    // Add index for budget tracking queries
    await queryRunner.query(`
      CREATE INDEX \`IDX_ad_budget_tracking\` 
      ON \`advertisements\` (\`createdBy\`, \`isActive\`, \`startDate\`)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`advertisements\` DROP INDEX IF EXISTS \`IDX_ad_active_query_covering\``);
    await queryRunner.query(`ALTER TABLE \`advertisements\` DROP INDEX IF EXISTS \`IDX_ad_budget_tracking\``);
    // Recreate original indexes
    await queryRunner.query(`CREATE INDEX \`IDX_ad_target_user_types\` ON \`advertisements\` (\`targetUserTypes\`)`);
    await queryRunner.query(`CREATE INDEX \`IDX_ad_target_plans\` ON \`advertisements\` (\`targetSubscriptionPlans\`)`);
    await queryRunner.query(`CREATE INDEX \`IDX_ad_target_genders\` ON \`advertisements\` (\`targetGenders\`)`);
    await queryRunner.query(`CREATE INDEX \`IDX_ad_media_type\` ON \`advertisements\` (\`mediaType\`)`);
  }
}
```

### Reasoning:
- **SET column indexes are useless**: MySQL cannot use a B-tree index for `FIND_IN_SET()` queries. These indexes waste disk and slow writes.
- **Covering index**: The new composite index covers the exact WHERE+ORDER BY used by the hot-path `getActiveAdvertisements()` cache refresh query.
- `mediaType` index only useful if filtered standalone, which doesn't happen in production queries.

---

## 4. Migration #3 — Frequency Capping Table

> **Priority:** HIGH · **Risk:** LOW (new table)  
> **Purpose:** Prevent the same user from seeing the same ad repeatedly. Industrial ad systems cap at N impressions per user per ad per time window.

```typescript
// src/migrations/1738200000000-CreateAdFrequencyCapping.ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAdFrequencyCapping1738200000000 implements MigrationInterface {
  name = 'CreateAdFrequencyCapping1738200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`advertisement_user_impressions\` (
        \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`advertisement_id\` VARCHAR(36) NOT NULL,
        \`user_id\` BIGINT NOT NULL,
        \`impression_count\` INT UNSIGNED NOT NULL DEFAULT 1,
        \`last_shown_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`first_shown_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_ad_user\` (\`advertisement_id\`, \`user_id\`),
        INDEX \`IDX_aui_user_last_shown\` (\`user_id\`, \`last_shown_at\`),
        INDEX \`IDX_aui_ad_impression_count\` (\`advertisement_id\`, \`impression_count\`),
        CONSTRAINT \`FK_aui_advertisement\` 
          FOREIGN KEY (\`advertisement_id\`) REFERENCES \`advertisements\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    -- Add frequency cap columns to advertisements table
    await queryRunner.query(`
      ALTER TABLE \`advertisements\` 
        ADD COLUMN \`max_impressions_per_user\` INT UNSIGNED NULL DEFAULT NULL COMMENT 'Max times a single user can see this ad (NULL = unlimited)',
        ADD COLUMN \`frequency_cap_window_hours\` INT UNSIGNED NULL DEFAULT NULL COMMENT 'Time window for frequency cap in hours (NULL = lifetime)'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS \`advertisement_user_impressions\``);
    await queryRunner.query(`ALTER TABLE \`advertisements\` DROP COLUMN IF EXISTS \`max_impressions_per_user\``);
    await queryRunner.query(`ALTER TABLE \`advertisements\` DROP COLUMN IF EXISTS \`frequency_cap_window_hours\``);
  }
}
```

### Entity Addition:
```typescript
// New columns in AdvertisementEntity
@Column({ name: 'max_impressions_per_user', type: 'int', unsigned: true, nullable: true, default: null })
maxImpressionsPerUser?: number;

@Column({ name: 'frequency_cap_window_hours', type: 'int', unsigned: true, nullable: true, default: null })
frequencyCapWindowHours?: number;
```

### Service Integration:
```typescript
// In AdvertisementMatchingService.selectAdvertisement()
async canShowToUser(adId: string, userId: string, maxPerUser: number, windowHours?: number): Promise<boolean> {
  const qb = this.impressionRepo.createQueryBuilder('aui')
    .where('aui.advertisement_id = :adId', { adId })
    .andWhere('aui.user_id = :userId', { userId });
  
  if (windowHours) {
    qb.andWhere('aui.last_shown_at >= DATE_SUB(NOW(), INTERVAL :hours HOUR)', { hours: windowHours });
  }

  const record = await qb.getOne();
  return !record || record.impressionCount < maxPerUser;
}
```

---

## 5. Migration #4 — Impression Ledger Table

> **Priority:** HIGH · **Risk:** LOW (new table)  
> **Purpose:** Move hot write counters off the `advertisements` row to eliminate write contention. Provides full audit trail for reconciliation and analytics.

```typescript
// src/migrations/1738300000000-CreateAdImpressionLedger.ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAdImpressionLedger1738300000000 implements MigrationInterface {
  name = 'CreateAdImpressionLedger1738300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`advertisement_events\` (
        \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`advertisement_id\` VARCHAR(36) NOT NULL,
        \`user_id\` BIGINT NULL COMMENT 'NULL for anonymous/system events',
        \`event_type\` ENUM('impression','click','sending','skip','error') NOT NULL,
        \`channel\` ENUM('sms','whatsapp','telegram','email','mobile_push','web_push','in_app') NULL,
        \`metadata\` JSON NULL COMMENT 'Extra context: subscription_plan, matching_score, etc.',
        \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        INDEX \`IDX_ae_ad_event\` (\`advertisement_id\`, \`event_type\`, \`created_at\`),
        INDEX \`IDX_ae_user_event\` (\`user_id\`, \`event_type\`, \`created_at\`),
        INDEX \`IDX_ae_created_at\` (\`created_at\`),
        CONSTRAINT \`FK_ae_advertisement\` 
          FOREIGN KEY (\`advertisement_id\`) REFERENCES \`advertisements\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        COMMENT='Append-only event ledger for advertisement analytics';
    `);

    -- Create materialized aggregate view (refreshed periodically)
    await queryRunner.query(`
      CREATE TABLE \`advertisement_stats\` (
        \`advertisement_id\` VARCHAR(36) NOT NULL,
        \`date\` DATE NOT NULL,
        \`impressions\` INT UNSIGNED NOT NULL DEFAULT 0,
        \`clicks\` INT UNSIGNED NOT NULL DEFAULT 0,
        \`sendings\` INT UNSIGNED NOT NULL DEFAULT 0,
        \`unique_users\` INT UNSIGNED NOT NULL DEFAULT 0,
        \`last_aggregated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`advertisement_id\`, \`date\`),
        INDEX \`IDX_as_date\` (\`date\`),
        CONSTRAINT \`FK_as_advertisement\` 
          FOREIGN KEY (\`advertisement_id\`) REFERENCES \`advertisements\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        COMMENT='Daily aggregated stats, materialized from advertisement_events';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS \`advertisement_stats\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`advertisement_events\``);
  }
}
```

### Migration Strategy for Counters:
1. Deploy with new tables + code that writes to BOTH old counters AND new ledger
2. Backfill `advertisement_stats` from current `impressionCount`/`clickCount`/`currentSendings`
3. Switch reads to `advertisement_stats`
4. Stop writing to old counter columns
5. Drop old columns in a later migration

---

## 6. Migration #5 — A/B Testing Support

> **Priority:** MEDIUM · **Risk:** LOW (new columns + table)  
> **Purpose:** Allow multiple ad variants per campaign to test effectiveness.

```typescript
// src/migrations/1738400000000-AddABTestingSupport.ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddABTestingSupport1738400000000 implements MigrationInterface {
  name = 'AddABTestingSupport1738400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`advertisements\`
        ADD COLUMN \`campaign_id\` VARCHAR(36) NULL COMMENT 'Groups ads into campaigns for A/B testing',
        ADD COLUMN \`variant_label\` VARCHAR(50) NULL DEFAULT NULL COMMENT 'A, B, C, or control',
        ADD COLUMN \`traffic_weight\` INT UNSIGNED NOT NULL DEFAULT 100 COMMENT 'Percentage weight for traffic splitting (0-100)',
        ADD INDEX \`IDX_ad_campaign\` (\`campaign_id\`, \`isActive\`)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`advertisements\` DROP INDEX IF EXISTS \`IDX_ad_campaign\``);
    await queryRunner.query(`ALTER TABLE \`advertisements\` DROP COLUMN IF EXISTS \`traffic_weight\``);
    await queryRunner.query(`ALTER TABLE \`advertisements\` DROP COLUMN IF EXISTS \`variant_label\``);
    await queryRunner.query(`ALTER TABLE \`advertisements\` DROP COLUMN IF EXISTS \`campaign_id\``);
  }
}
```

---

## 7. Migration #6 — Budget & Billing Normalization

> **Priority:** MEDIUM · **Risk:** LOW (new table)  
> **Purpose:** Move billing data to a proper ledger for accurate spend tracking and daily budget enforcement.

```typescript
// src/migrations/1738500000000-NormalizeAdBilling.ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class NormalizeAdBilling1738500000000 implements MigrationInterface {
  name = 'NormalizeAdBilling1738500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`advertisement_billing\` (
        \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`advertisement_id\` VARCHAR(36) NOT NULL,
        \`date\` DATE NOT NULL,
        \`impressions_billed\` INT UNSIGNED NOT NULL DEFAULT 0,
        \`clicks_billed\` INT UNSIGNED NOT NULL DEFAULT 0,
        \`cost_impressions\` DECIMAL(10,4) NOT NULL DEFAULT 0,
        \`cost_clicks\` DECIMAL(10,4) NOT NULL DEFAULT 0,
        \`total_cost\` DECIMAL(10,4) NOT NULL DEFAULT 0,
        \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_billing_ad_date\` (\`advertisement_id\`, \`date\`),
        CONSTRAINT \`FK_billing_advertisement\` 
          FOREIGN KEY (\`advertisement_id\`) REFERENCES \`advertisements\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    -- Add daily budget cap
    await queryRunner.query(`
      ALTER TABLE \`advertisements\`
        ADD COLUMN \`daily_budget\` DECIMAL(10,2) NULL DEFAULT NULL COMMENT 'Max spend per day in LKR'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS \`advertisement_billing\``);
    await queryRunner.query(`ALTER TABLE \`advertisements\` DROP COLUMN IF EXISTS \`daily_budget\``);
  }
}
```

---

## 8. Migration #7 — Soft Delete & Archival

> **Priority:** MEDIUM · **Risk:** LOW  
> **Purpose:** Enable soft delete for recovery and compliance. Archive old ads to keep the active table fast.

```typescript
// src/migrations/1738600000000-AddSoftDeleteAndArchival.ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSoftDeleteAndArchival1738600000000 implements MigrationInterface {
  name = 'AddSoftDeleteAndArchival1738600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`advertisements\`
        ADD COLUMN \`deleted_at\` DATETIME NULL DEFAULT NULL,
        ADD COLUMN \`archived_at\` DATETIME NULL DEFAULT NULL COMMENT 'Set when ad expires and is moved to cold storage',
        ADD INDEX \`IDX_ad_deleted_at\` (\`deleted_at\`)
    `);

    -- Update the active-ads covering index to include deleted_at
    await queryRunner.query(`
      CREATE INDEX \`IDX_ad_active_not_deleted\` 
      ON \`advertisements\` (\`deleted_at\`, \`isActive\`, \`startDate\`, \`endDate\`, \`currentSendings\`)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`advertisements\` DROP INDEX IF EXISTS \`IDX_ad_active_not_deleted\``);
    await queryRunner.query(`ALTER TABLE \`advertisements\` DROP INDEX IF EXISTS \`IDX_ad_deleted_at\``);
    await queryRunner.query(`ALTER TABLE \`advertisements\` DROP COLUMN IF EXISTS \`archived_at\``);
    await queryRunner.query(`ALTER TABLE \`advertisements\` DROP COLUMN IF EXISTS \`deleted_at\``);
  }
}
```

### Entity Change:
```typescript
@DeleteDateColumn({ name: 'deleted_at', type: 'datetime', nullable: true })
deletedAt?: Date;
```

> TypeORM's `@DeleteDateColumn` automatically filters soft-deleted rows from all `find*` queries.

---

## 9. Migration #8 — Advertiser/Campaign Hierarchy

> **Priority:** LOW · **Risk:** LOW (new tables)  
> **Purpose:** Proper campaign management structure for multi-advertiser support.

```typescript
// src/migrations/1738700000000-CreateCampaignHierarchy.ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCampaignHierarchy1738700000000 implements MigrationInterface {
  name = 'CreateCampaignHierarchy1738700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`advertisers\` (
        \`id\` VARCHAR(36) NOT NULL,
        \`name\` VARCHAR(255) NOT NULL,
        \`contact_email\` VARCHAR(255) NULL,
        \`contact_phone\` VARCHAR(20) NULL,
        \`total_budget\` DECIMAL(12,2) NOT NULL DEFAULT 0,
        \`remaining_budget\` DECIMAL(12,2) NOT NULL DEFAULT 0,
        \`is_active\` TINYINT NOT NULL DEFAULT 1,
        \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        INDEX \`IDX_advertiser_active\` (\`is_active\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await queryRunner.query(`
      CREATE TABLE \`ad_campaigns\` (
        \`id\` VARCHAR(36) NOT NULL,
        \`advertiser_id\` VARCHAR(36) NOT NULL,
        \`name\` VARCHAR(255) NOT NULL,
        \`objective\` ENUM('awareness','clicks','conversions') NOT NULL DEFAULT 'awareness',
        \`budget\` DECIMAL(10,2) NULL,
        \`start_date\` DATETIME NOT NULL,
        \`end_date\` DATETIME NOT NULL,
        \`status\` ENUM('draft','active','paused','completed','cancelled') NOT NULL DEFAULT 'draft',
        \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        INDEX \`IDX_campaign_advertiser\` (\`advertiser_id\`, \`status\`),
        INDEX \`IDX_campaign_dates\` (\`start_date\`, \`end_date\`, \`status\`),
        CONSTRAINT \`FK_campaign_advertiser\` 
          FOREIGN KEY (\`advertiser_id\`) REFERENCES \`advertisers\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    -- Link advertisements to campaigns
    await queryRunner.query(`
      ALTER TABLE \`advertisements\`
        ADD COLUMN \`advertiser_id\` VARCHAR(36) NULL,
        ADD INDEX \`IDX_ad_advertiser\` (\`advertiser_id\`),
        ADD CONSTRAINT \`FK_ad_advertiser\` 
          FOREIGN KEY (\`advertiser_id\`) REFERENCES \`advertisers\` (\`id\`) ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`advertisements\` DROP FOREIGN KEY IF EXISTS \`FK_ad_advertiser\``);
    await queryRunner.query(`ALTER TABLE \`advertisements\` DROP INDEX IF EXISTS \`IDX_ad_advertiser\``);
    await queryRunner.query(`ALTER TABLE \`advertisements\` DROP COLUMN IF EXISTS \`advertiser_id\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`ad_campaigns\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`advertisers\``);
  }
}
```

---

## 10. Migration #9 — Advanced Targeting Normalization

> **Priority:** LOW · **Risk:** MEDIUM (requires code refactor)  
> **Purpose:** Replace JSON/SET targeting columns with proper junction tables for efficient queries and proper indexing.

```typescript
// src/migrations/1738800000000-NormalizeTargeting.ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class NormalizeTargeting1738800000000 implements MigrationInterface {
  name = 'NormalizeTargeting1738800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Institute targeting junction table
    await queryRunner.query(`
      CREATE TABLE \`advertisement_target_institutes\` (
        \`advertisement_id\` VARCHAR(36) NOT NULL,
        \`institute_id\` BIGINT NOT NULL,
        PRIMARY KEY (\`advertisement_id\`, \`institute_id\`),
        INDEX \`IDX_ati_institute\` (\`institute_id\`),
        CONSTRAINT \`FK_ati_advertisement\` 
          FOREIGN KEY (\`advertisement_id\`) REFERENCES \`advertisements\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);

    // City targeting junction table
    await queryRunner.query(`
      CREATE TABLE \`advertisement_target_cities\` (
        \`advertisement_id\` VARCHAR(36) NOT NULL,
        \`city\` VARCHAR(100) NOT NULL,
        PRIMARY KEY (\`advertisement_id\`, \`city\`),
        INDEX \`IDX_atc_city\` (\`city\`),
        CONSTRAINT \`FK_atc_advertisement\` 
          FOREIGN KEY (\`advertisement_id\`) REFERENCES \`advertisements\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Occupation targeting junction table  
    await queryRunner.query(`
      CREATE TABLE \`advertisement_target_occupations\` (
        \`advertisement_id\` VARCHAR(36) NOT NULL,
        \`occupation\` VARCHAR(100) NOT NULL,
        PRIMARY KEY (\`advertisement_id\`, \`occupation\`),
        CONSTRAINT \`FK_ato_advertisement\` 
          FOREIGN KEY (\`advertisement_id\`) REFERENCES \`advertisements\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS \`advertisement_target_occupations\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`advertisement_target_cities\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`advertisement_target_institutes\``);
  }
}
```

### Data Migration Script (run separately):
```sql
-- Migrate targetInstituteIds JSON array to junction table
INSERT INTO advertisement_target_institutes (advertisement_id, institute_id)
SELECT a.id, j.institute_id
FROM advertisements a,
     JSON_TABLE(a.targetInstituteIds, '$[*]' COLUMNS (institute_id BIGINT PATH '$')) j
WHERE a.targetInstituteIds IS NOT NULL;

-- Migrate targetCities JSON array to junction table  
INSERT INTO advertisement_target_cities (advertisement_id, city)
SELECT a.id, j.city
FROM advertisements a,
     JSON_TABLE(a.targetCities, '$[*]' COLUMNS (city VARCHAR(100) PATH '$')) j
WHERE a.targetCities IS NOT NULL;
```

> ⚠️ **Important:** This migration requires significant refactoring of `AdvertisementMatchingService.calculateScore()` to JOIN these tables instead of in-memory array matching. Only proceed when you have capacity for a full scoring engine rewrite.

---

## 11. Migration #10 — Performance Partitioning

> **Priority:** LOW · **Risk:** HIGH (table rebuild)  
> **Purpose:** When `advertisement_events` grows beyond ~50M rows, partition by month for fast queries and easy archival.

```typescript
// src/migrations/1738900000000-PartitionEventLedger.ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class PartitionEventLedger1738900000000 implements MigrationInterface {
  name = 'PartitionEventLedger1738900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Note: Partitioning requires dropping and recreating the table
    // Schedule during maintenance window
    
    await queryRunner.query(`
      ALTER TABLE \`advertisement_events\` 
        DROP FOREIGN KEY \`FK_ae_advertisement\`
    `);
    
    await queryRunner.query(`
      ALTER TABLE \`advertisement_events\`
        PARTITION BY RANGE (YEAR(\`created_at\`) * 100 + MONTH(\`created_at\`)) (
          PARTITION p2025_01 VALUES LESS THAN (202502),
          PARTITION p2025_02 VALUES LESS THAN (202503),
          PARTITION p2025_03 VALUES LESS THAN (202504),
          PARTITION p2025_04 VALUES LESS THAN (202505),
          PARTITION p2025_05 VALUES LESS THAN (202506),
          PARTITION p2025_06 VALUES LESS THAN (202507),
          PARTITION p2025_07 VALUES LESS THAN (202508),
          PARTITION p2025_08 VALUES LESS THAN (202509),
          PARTITION p2025_09 VALUES LESS THAN (202510),
          PARTITION p2025_10 VALUES LESS THAN (202511),
          PARTITION p2025_11 VALUES LESS THAN (202512),
          PARTITION p2025_12 VALUES LESS THAN (202601),
          PARTITION p_future VALUES LESS THAN MAXVALUE
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`advertisement_events\` REMOVE PARTITIONING`);
  }
}
```

> ⚠️ **MySQL Limitation:** Partitioned tables cannot have foreign keys. Drop the FK before partitioning and enforce referential integrity at the application layer.

---

## 12. Data Migration Strategies

### 12.1 Zero-Downtime Migration Pattern

```
Phase 1: EXPAND
  ├── Add new columns/tables (backward compatible)
  ├── Deploy code that writes to BOTH old + new structures
  └── Verify dual-write is working

Phase 2: MIGRATE
  ├── Run backfill scripts during low-traffic window
  ├── Verify data consistency between old and new
  └── Switch reads to new structure

Phase 3: CONTRACT
  ├── Stop writing to old columns
  ├── Monitor for regressions (1-2 weeks)
  └── Drop old columns in final migration
```

### 12.2 Counter Migration (Critical)

The current `currentSendings`, `impressionCount`, and `clickCount` on the `advertisements` row are hot counters with write contention. The migration path:

```
Week 1: Deploy advertisement_events table + dual-write code
Week 2: Deploy advertisement_stats aggregation cron (every 10 minutes)
Week 3: Switch reads to advertisement_stats, verify consistency
Week 4: Remove old counter increment code
Week 5: Drop old counter columns (or mark deprecated)
```

### 12.3 Backfill Script Template

```sql
-- Safe backfill with batching (prevents table locks)
DELIMITER //
CREATE PROCEDURE backfill_ad_stats()
BEGIN
  DECLARE done INT DEFAULT 0;
  DECLARE ad_id VARCHAR(36);
  DECLARE cur CURSOR FOR SELECT id FROM advertisements;
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = 1;
  
  OPEN cur;
  read_loop: LOOP
    FETCH cur INTO ad_id;
    IF done THEN LEAVE read_loop; END IF;
    
    INSERT INTO advertisement_stats (advertisement_id, date, impressions, clicks, sendings)
    VALUES (ad_id, CURDATE(), 
      (SELECT impressionCount FROM advertisements WHERE id = ad_id),
      (SELECT clickCount FROM advertisements WHERE id = ad_id),
      (SELECT currentSendings FROM advertisements WHERE id = ad_id)
    )
    ON DUPLICATE KEY UPDATE 
      impressions = VALUES(impressions),
      clicks = VALUES(clicks),
      sendings = VALUES(sendings);
    
    -- Prevent lock escalation
    DO SLEEP(0.01);
  END LOOP;
  CLOSE cur;
END //
DELIMITER ;
```

---

## 13. Rollback Playbook

### Per-Migration Rollback Commands

| Migration | Rollback Command | Risk |
|-----------|-----------------|------|
| #1 Baseline | Skip — documents existing state | None |
| #2 Indexes | `typeorm migration:revert` | LOW — just recreates old indexes |
| #3 Frequency Cap | `DROP TABLE advertisement_user_impressions` + `ALTER TABLE DROP COLUMN` | LOW — new table only |
| #4 Event Ledger | `DROP TABLE advertisement_stats, advertisement_events` | LOW — data loss of events |
| #5 A/B Testing | `ALTER TABLE DROP COLUMN` × 3 | LOW |
| #6 Billing | `DROP TABLE advertisement_billing` + `ALTER TABLE DROP COLUMN` | LOW |
| #7 Soft Delete | `ALTER TABLE DROP COLUMN deleted_at, archived_at` | LOW — but undeleted rows become visible |
| #8 Hierarchy | `DROP TABLE` + `ALTER TABLE DROP FK/COLUMN` | MEDIUM — need to ensure FK cleanup |
| #9 Targeting | `DROP TABLE` junction tables | MEDIUM — need to ensure JSON data intact |
| #10 Partitioning | `ALTER TABLE REMOVE PARTITIONING` | HIGH — table rebuild required |

### Emergency Rollback Procedure:
```bash
# 1. Stop application
pm2 stop lms-api

# 2. Run TypeORM revert (reverts last migration)
npx typeorm migration:revert -d src/data-source.ts

# 3. Restart with previous code version
git checkout <previous-tag>
npm ci && npm run build
pm2 restart lms-api

# 4. Verify
curl -s http://localhost:3000/health | jq .
```

---

## 14. Pre-Flight Checklist

### Before Running ANY Migration:

- [ ] **Backup the database** — `mysqldump --single-transaction --routines --triggers lms_db > backup_$(date +%Y%m%d_%H%M%S).sql`
- [ ] **Check replication lag** — All replicas must be caught up
- [ ] **Low-traffic window** — Run during off-peak hours (2-5 AM SLT)
- [ ] **Test on staging** — Run the exact migration on staging first
- [ ] **Verify rollback** — Test the `down()` method on staging
- [ ] **Monitor disk space** — `ALTER TABLE` operations need 2× table size free
- [ ] **Set lock timeout** — `SET SESSION lock_wait_timeout = 10;` to fail fast
- [ ] **Notify team** — Post in #deployments channel

### MySQL Online DDL Settings:
```sql
-- For non-blocking ALTER TABLE operations
SET SESSION sql_mode = 'STRICT_TRANS_TABLES';
ALTER TABLE advertisements ADD COLUMN x INT, ALGORITHM=INPLACE, LOCK=NONE;
```

---

## 15. Post-Migration Verification

### Automated Verification Script:

```sql
-- 1. Verify table structure matches entity
DESCRIBE advertisements;

-- 2. Verify all indexes exist  
SHOW INDEX FROM advertisements;

-- 3. Verify data integrity
SELECT 
  COUNT(*) as total_ads,
  SUM(CASE WHEN isActive = 1 THEN 1 ELSE 0 END) as active_ads,
  SUM(CASE WHEN startDate <= NOW() AND endDate >= NOW() AND isActive = 1 THEN 1 ELSE 0 END) as currently_active,
  SUM(impressionCount) as total_impressions,
  SUM(clickCount) as total_clicks
FROM advertisements;

-- 4. Verify the hot-path query still uses the index
EXPLAIN SELECT * FROM advertisements 
WHERE isActive = 1 AND startDate <= NOW() AND endDate >= NOW() AND currentSendings < maxSendings
ORDER BY priority DESC, created_at DESC;

-- 5. Verify new tables (if applicable)
SELECT COUNT(*) FROM advertisement_events;
SELECT COUNT(*) FROM advertisement_user_impressions;
SELECT COUNT(*) FROM advertisement_stats;
```

### Application Verification:
```bash
# Health check
curl -s http://localhost:3000/health

# Test ad delivery endpoint
curl -s http://localhost:3000/api/v1/advertisements/active | jq '.data | length'

# Verify cache is warming
curl -s http://localhost:3000/api/v1/advertisements/delivery/statistics | jq .
```

---

## Summary — Recommended Execution Order

| Phase | Migration | Priority | Risk | Est. Time |
|-------|-----------|----------|------|-----------|
| **Phase 1** | #1 Baseline | REQUIRED | LOW | 5 min |
| **Phase 1** | #2 Index Optimization | HIGH | LOW | 10 min |
| **Phase 2** | #3 Frequency Capping | HIGH | LOW | 15 min |
| **Phase 2** | #4 Impression Ledger | HIGH | LOW | 15 min |
| **Phase 3** | #5 A/B Testing | MEDIUM | LOW | 5 min |
| **Phase 3** | #6 Budget Normalization | MEDIUM | LOW | 10 min |
| **Phase 3** | #7 Soft Delete | MEDIUM | LOW | 5 min |
| **Phase 4** | #8 Advertiser Hierarchy | LOW | LOW | 20 min |
| **Phase 4** | #9 Targeting Normalization | LOW | MEDIUM | 30 min + code refactor |
| **Phase 5** | #10 Partitioning | LOW | HIGH | 1 hour + maintenance window |

> **Phase 1** should be deployed immediately. Phase 2 within the current sprint. Phases 3-5 as the ad system scales.
