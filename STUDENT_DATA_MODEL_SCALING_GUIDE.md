# Student Data Model & Large-Scale Data Handling Guide

## System Overview

This document explains how the Suraksha LMS handles millions of student records, marks, preferences, parent data, and time management — and how existing entities integrate with new data at scale.

---

## 1. Current Data Architecture Summary

### Database Stack
| Layer | Technology | Purpose |
|-------|-----------|---------|
| Primary DB | **MySQL 8.0** (TypeORM) | All relational data — users, classes, marks, payments |
| Real-time Store | **AWS DynamoDB** | Attendance writes (high throughput, low latency) |
| Sync Layer | Cron/Batch | DynamoDB → MySQL `attendance_records` for reporting |
| File Storage | **Google Drive + S3** | Homework submissions, profile images, documents |
| Push Delivery | **Firebase FCM** | Real-time notifications to devices |

### Entity Count
- **67 entities** across **26 modules**
- **100+ foreign key relationships**
- Multi-tenant by institute (subdomain isolation)

---

## 2. Core Student Data Model (What Already Exists)

### 2.1 User → Student → Parent Chain

```
┌─────────────────────────────────────────────────────────┐
│                      UserEntity                         │
│  id, firstName, lastName, nameWithInitials, email,      │
│  password, phoneNumber, userType (STUDENT/TEACHER/...),│
│  dateOfBirth, gender, nic, birthCertificateNo,          │
│  address*, city, district, province, country,           │
│  isActive, imageUrl, language, rfid, cardId,            │
│  subscriptionPlan, userSettings (JSON), telegramId      │
└──────────────────────┬──────────────────────────────────┘
                       │ 1:1 (userId = PK)
                       ▼
┌─────────────────────────────────────────────────────────┐
│                    StudentEntity                        │
│  userId (PK=FK), fatherId (FK→Parent), motherId (FK),  │
│  guardianId (FK), studentId (school-specific),          │
│  emergencyContact, medicalConditions, allergies,        │
│  bloodGroup, cardDeliveryRecipient                      │
└──────────────────────┬──────────────────────────────────┘
                       │ *:1 (fatherId/motherId/guardianId)
                       ▼
┌─────────────────────────────────────────────────────────┐
│                    ParentEntity                         │
│  id, userId (FK→User, unique), occupation, workplace,   │
│  workPhone, educationLevel                              │
│  ── REVERSE: childrenAsFather[], childrenAsMother[],    │
│              childrenAsGuardian[]                        │
└─────────────────────────────────────────────────────────┘
```

### 2.2 Student in Institute Context

```
Student (UserEntity)
  │
  ├── InstituteUserEntity (per institute)
  │     instituteId + userId (composite PK)
  │     userIdByInstitute, status (PENDING/ACTIVE/FORMER)
  │     instituteUserType, instituteCardId, imageVerificationStatus
  │
  ├── InstituteClassStudentEntity (per class enrollment)
  │     instituteId + classId + studentUserId (composite PK)
  │     isActive, isVerified, enrollmentMethod, verifiedBy
  │
  ├── InstituteClassSubjectStudent (per subject enrollment)
  │     instituteId + classId + subjectId + studentId (composite PK)
  │     verificationStatus (verified/pending/rejected/pending_payment)
  │     enrollmentMethod (teacher_assigned/self_enrolled)
  │
  └── InstituteHouseMemberEntity (house assignment)
        houseId + userId
```

### 2.3 Academic Data Per Student

```
Student
  ├── Exams Taken     → InstituteClassSubjectExam (exam definitions)
  ├── Results/Marks   → InstituteClassSubjectResault (score, grade, remarks per exam)
  ├── Homework        → InstituteClassSubjectHomework (assignments)
  ├── Submissions     → InstituteClassSubjectHomeworksSubmission (student work)
  ├── Lectures        → InstituteClassSubjectLecture (attended)
  ├── Attendance      → AttendanceRecordEntity (PRESENT/ABSENT/LEAVE per day)
  └── Payments        → InstituteClassSubjectPaymentSubmission (fees per subject)
```

---

## 3. Handling Millions of Records — Strategy by Data Type

### 3.1 Student Marks (OL/AL + Internal Exams)

**Current state:** `InstituteClassSubjectResault` stores per-exam, per-student scores.

**Scale problem:** A single institute with 2,000 students × 8 subjects × 4 terms = **64,000 result rows/year**. Across 500 institutes = **32 million rows/year**.

#### Recommended Storage Strategy

```
┌─────────────────────────────────────────────────────────────┐
│                EXISTING: institute_class_subject_results     │
│  For internal exams (term tests, class tests, quizzes)      │
│  Stays in MySQL — partitioned by (instituteId, academicYear)│
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│         NEW: student_national_exam_results                   │
│  For OL/AL national exam results                             │
│  Fields:                                                     │
│    id (PK), studentUserId (FK→users),                        │
│    examType ENUM('OL','AL','SCHOLARSHIP_GRADE5'),            │
│    examYear INT (e.g. 2025),                                 │
│    indexNumber VARCHAR(20),                                   │
│    subjectCode VARCHAR(10),                                   │
│    subjectName VARCHAR(100),                                  │
│    grade ENUM('A','B','C','S','W','F','Ab'),                 │
│    marks DECIMAL(5,2) NULL,                                   │
│    islandRank INT NULL,                                       │
│    districtRank INT NULL,                                     │
│    zScore DECIMAL(6,4) NULL,                                  │
│    stream VARCHAR(50) NULL (for AL: Science/Commerce/Arts),   │
│    createdAt, updatedAt                                       │
│                                                               │
│  INDEX: idx_student_exam (studentUserId, examType, examYear) │
│  INDEX: idx_subject_year (subjectCode, examYear)             │
│  INDEX: idx_index_number (indexNumber, examYear)              │
│  PARTITION BY RANGE (examYear)                                │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│         NEW: student_marks_summary                           │
│  Aggregated view per student per term (denormalized)         │
│  Fields:                                                     │
│    id, studentUserId (FK), instituteId (FK), classId (FK),   │
│    academicYear, term ENUM('TERM1','TERM2','TERM3','ANNUAL'),│
│    totalMarks DECIMAL, averageMarks DECIMAL,                 │
│    classRank INT, gradeRank INT,                             │
│    subjectCount INT, passedCount INT, failedCount INT,       │
│    highestMark DECIMAL, lowestMark DECIMAL,                  │
│    gpa DECIMAL(3,2),                                          │
│    createdAt, updatedAt                                       │
│                                                               │
│  Built by: scheduled aggregation job (not real-time)          │
│  Purpose: Dashboard queries without scanning millions of rows │
└─────────────────────────────────────────────────────────────┘
```

#### Why This Design Works

| Concern | Solution |
|---------|----------|
| Internal exams | Already handled by `institute_class_subject_results` — keep it |
| National OL/AL exams | New `student_national_exam_results` — separate concern, separate table |
| Dashboard queries | `student_marks_summary` — pre-aggregated, fast reads |
| Yearly data growth | Partition by `examYear` — old years archived, queries stay fast |
| Matching student to national results | Match by `indexNumber` + `examYear` OR `studentUserId` FK |

---

### 3.2 Student Preferences (Millions of Preference Records)

**Current state:** `UserEntity.userSettings` stores preferences as a JSON column per user.

**Scale problem:** JSON column works for simple prefs (theme, notification toggles). But if you have **millions of granular preferences** (subject interests, learning pace, content difficulty, schedule preferences, notification granularity per subject, per teacher, per time slot) — JSON becomes unqueryable and unmaintainable.

#### Recommended Storage Strategy

```
┌─────────────────────────────────────────────────────────────┐
│  KEEP: UserEntity.userSettings (JSON)                        │
│  For: theme, language, basic notification toggles            │
│  This is fine for simple user-level preferences              │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  NEW: user_preferences                                       │
│  For queryable, granular preferences at scale                │
│  Fields:                                                     │
│    id BIGINT (PK),                                           │
│    userId BIGINT (FK→users),                                 │
│    scope ENUM('GLOBAL','INSTITUTE','CLASS','SUBJECT'),        │
│    scopeId BIGINT NULL (instituteId/classId/subjectId),      │
│    category VARCHAR(50),                                      │
│      -- e.g. 'LEARNING', 'NOTIFICATION', 'SCHEDULE',         │
│      --      'CONTENT', 'PRIVACY', 'ACCESSIBILITY'           │
│    prefKey VARCHAR(100),                                      │
│      -- e.g. 'preferred_difficulty', 'study_time_start',      │
│      --      'notify_homework', 'content_language'            │
│    prefValue TEXT,                                            │
│    valueType ENUM('STRING','NUMBER','BOOLEAN','JSON','ENUM'), │
│    isActive BOOLEAN DEFAULT true,                             │
│    createdAt TIMESTAMP,                                       │
│    updatedAt TIMESTAMP,                                       │
│                                                               │
│  UNIQUE: idx_user_scope_key (userId, scope, scopeId, prefKey)│
│  INDEX: idx_category (category, prefKey)                     │
│  INDEX: idx_scope_lookup (scope, scopeId, category)          │
└─────────────────────────────────────────────────────────────┘
```

#### Example Preference Records

| userId | scope | scopeId | category | prefKey | prefValue |
|--------|-------|---------|----------|---------|-----------|
| 1001 | GLOBAL | NULL | LEARNING | preferred_difficulty | intermediate |
| 1001 | SUBJECT | 45 | NOTIFICATION | notify_homework | true |
| 1001 | SUBJECT | 45 | LEARNING | study_pace | slow |
| 1001 | INSTITUTE | 3 | SCHEDULE | preferred_start_time | 08:00 |
| 1001 | CLASS | 12 | CONTENT | content_language | SINHALA |
| 2050 | GLOBAL | NULL | ACCESSIBILITY | font_size | large |
| 2050 | GLOBAL | NULL | PRIVACY | show_marks_to_parents | false |

#### Querying at Scale

```sql
-- Get all preferences for a student in a subject
SELECT * FROM user_preferences 
WHERE userId = 1001 AND scope = 'SUBJECT' AND scopeId = 45;

-- Find all students who prefer Sinhala content
SELECT userId FROM user_preferences 
WHERE prefKey = 'content_language' AND prefValue = 'SINHALA';

-- Get merged preferences (global + institute + class + subject)
-- Application code cascades: SUBJECT overrides CLASS overrides INSTITUTE overrides GLOBAL
```

---

### 3.3 Parent Preferences & Multi-Role Preferences

Parents already exist as `ParentEntity` linked to users. Parents may have preferences about:
- Which child's data they want notifications for
- Preferred communication channel (SMS/Push/WhatsApp)
- Report card delivery preferences
- Meeting time preferences

**These also go into `user_preferences`** — the `scope` system handles it:

| userId (parent) | scope | scopeId | category | prefKey | prefValue |
|-----------------|-------|---------|----------|---------|-----------|
| 5001 | GLOBAL | NULL | NOTIFICATION | preferred_channel | SMS |
| 5001 | INSTITUTE | 3 | NOTIFICATION | report_delivery | EMAIL |
| 5001 | GLOBAL | NULL | SCHEDULE | meeting_preference | AFTER_3PM |

---

### 3.4 Time Management & Schedule Preferences

**Current state:** `InstituteOperatingConfigEntity` handles institute-level operating hours (per day of week). `InstituteCalendarDayEntity` + `InstituteCalendarEventEntity` handle specific date events.

#### Recommended Extension for Student Time Management

```
┌─────────────────────────────────────────────────────────────┐
│  NEW: student_schedules                                      │
│  Personal study schedule / timetable per student             │
│  Fields:                                                     │
│    id BIGINT (PK),                                           │
│    studentUserId BIGINT (FK→users),                          │
│    instituteId BIGINT (FK→institutes),                       │
│    classId BIGINT (FK→institute_classes) NULL,               │
│    subjectId BIGINT (FK→subjects) NULL,                      │
│    dayOfWeek TINYINT (1-7 ISO),                              │
│    startTime TIME,                                            │
│    endTime TIME,                                              │
│    scheduleType ENUM('CLASS','STUDY','EXTRA_CURRICULAR',     │
│                      'TUITION','PERSONAL'),                   │
│    title VARCHAR(200),                                        │
│    location VARCHAR(200) NULL,                                │
│    isRecurring BOOLEAN DEFAULT true,                          │
│    effectiveFrom DATE,                                        │
│    effectiveTo DATE NULL,                                     │
│    isActive BOOLEAN DEFAULT true,                             │
│    createdAt, updatedAt                                       │
│                                                               │
│  INDEX: idx_student_day (studentUserId, dayOfWeek)           │
│  INDEX: idx_institute_class (instituteId, classId)           │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  NEW: student_study_logs                                     │
│  Track actual study/activity time (for analytics)            │
│  Fields:                                                     │
│    id BIGINT (PK),                                           │
│    studentUserId BIGINT (FK),                                │
│    subjectId BIGINT NULL,                                    │
│    activityType ENUM('STUDY','HOMEWORK','EXAM_PREP',         │
│                      'LECTURE_VIEW','REVISION'),              │
│    startedAt DATETIME,                                        │
│    endedAt DATETIME NULL,                                     │
│    durationMinutes INT,                                       │
│    source ENUM('MANUAL','APP_TRACKED','DEVICE'),             │
│    notes TEXT NULL,                                            │
│    createdAt TIMESTAMP                                        │
│                                                               │
│  INDEX: idx_student_date (studentUserId, startedAt)          │
│  INDEX: idx_subject_activity (subjectId, activityType)       │
│  PARTITION BY RANGE (YEAR(startedAt))                        │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. Student Matching — How to Handle Incoming Data Against Existing Records

### 4.1 Current Matching Logic

The system currently matches students using this cascade:

```
MATCH ATTEMPT ORDER:
1. EMAIL (unique constraint) → definitive match
2. PHONE NUMBER → soft match (not unique in DB)
3. NIC → soft match (not unique in DB)  
4. BIRTH CERTIFICATE NO → soft match (not unique in DB)

Parent matching:
1. EMAIL → find existing user, reuse
2. PHONE → find existing user, reuse
3. Neither found → create new user + parent record
```

### 4.2 Expanded Matching Strategy for Large-Scale Data Import

When importing millions of student records (e.g., national exam data, transfers between institutes), you need a robust matching pipeline:

```
┌─────────────────────────────────────────────────────────┐
│             STUDENT MATCHING PIPELINE                    │
│                                                          │
│  INPUT: Raw student record from external source          │
│  (name, DOB, NIC, email, phone, school, indexNo, etc.)   │
│                                                          │
│  STEP 1: EXACT MATCH (High Confidence)                   │
│  ├── Match by email (case-insensitive) → FOUND? → LINK  │
│  ├── Match by NIC (normalized) → FOUND 1? → LINK        │
│  └── Match by indexNumber + examYear → FOUND? → LINK     │
│                                                          │
│  STEP 2: COMPOSITE MATCH (Medium Confidence)             │
│  ├── firstName + lastName + DOB + gender → candidates    │
│  ├── nameWithInitials + DOB + district → candidates      │
│  └── phone + lastName + DOB → candidates                 │
│                                                          │
│  STEP 3: FUZZY MATCH (Low Confidence — needs review)     │
│  ├── Levenshtein on name (< 2 edits) + DOB match        │
│  ├── Soundex/Metaphone on name + district match          │
│  └── Phone number partial (last 7 digits) + name         │
│                                                          │
│  STEP 4: RESOLUTION                                      │
│  ├── SINGLE match with high confidence → auto-link       │
│  ├── MULTIPLE matches → flag for manual review           │
│  ├── ZERO matches → create new student record            │
│  └── LOW confidence → queue for admin approval           │
└─────────────────────────────────────────────────────────┘
```

### 4.3 Implementation: Matching Service

```typescript
// Conceptual structure — integrate into existing UserService/StudentService

interface MatchResult {
  matchType: 'EXACT' | 'COMPOSITE' | 'FUZZY' | 'NONE';
  confidence: number; // 0.0 - 1.0
  matchedUserId: bigint | null;
  matchedBy: string; // e.g. 'email', 'nic+dob', 'name+dob+district'
  candidates: { userId: bigint; score: number }[];
}

async function matchStudent(input: IncomingStudentData): Promise<MatchResult> {
  // Step 1: Exact email
  if (input.email) {
    const user = await userRepo.findOne({ where: { email: input.email.toLowerCase() } });
    if (user) return { matchType: 'EXACT', confidence: 1.0, matchedUserId: user.id, matchedBy: 'email', candidates: [] };
  }

  // Step 2: Exact NIC (+ verify with DOB for safety)
  if (input.nic) {
    const users = await userRepo.find({ where: { nic: normalizeNic(input.nic) } });
    if (users.length === 1 && users[0].dateOfBirth === input.dob) {
      return { matchType: 'EXACT', confidence: 0.95, matchedUserId: users[0].id, matchedBy: 'nic+dob', candidates: [] };
    }
  }

  // Step 3: Composite name+DOB+gender
  if (input.firstName && input.lastName && input.dob) {
    const candidates = await userRepo.find({
      where: { firstName: input.firstName, lastName: input.lastName, dateOfBirth: input.dob, gender: input.gender }
    });
    if (candidates.length === 1) {
      return { matchType: 'COMPOSITE', confidence: 0.85, matchedUserId: candidates[0].id, matchedBy: 'name+dob+gender', candidates: [] };
    }
    if (candidates.length > 1) {
      return { matchType: 'COMPOSITE', confidence: 0.5, matchedUserId: null, matchedBy: 'name+dob+gender (ambiguous)',
        candidates: candidates.map(c => ({ userId: c.id, score: 0.5 })) };
    }
  }

  // Step 4: No match
  return { matchType: 'NONE', confidence: 0, matchedUserId: null, matchedBy: '', candidates: [] };
}
```

### 4.4 Matching Decision Table

| Match Type | Confidence | Action |
|-----------|-----------|--------|
| Email exact | 1.0 | Auto-link to existing user |
| NIC + DOB | 0.95 | Auto-link |
| Name + DOB + Gender (1 result) | 0.85 | Auto-link |
| Phone + Name (1 result) | 0.80 | Auto-link |
| Name + DOB (multiple results) | 0.50 | Queue for manual review |
| Fuzzy name + DOB | 0.30–0.60 | Queue for manual review |
| No match | 0.00 | Create new student record |

---

## 5. Data Volume Projections & Scaling Plan

### 5.1 Growth Projections

| Data Type | Per Student/Year | 1K Students | 100K Students | 1M Students |
|-----------|-----------------|-------------|---------------|-------------|
| Internal exam results | ~32 rows | 32K | 3.2M | 32M |
| National exam results | ~8-16 rows (OL/AL) | 16K | 1.6M | 16M |
| Attendance records | ~200 rows | 200K | 20M | 200M |
| Preferences | ~20-50 rows | 50K | 5M | 50M |
| Study logs | ~100-300 rows | 300K | 30M | 300M |
| Homework submissions | ~40 rows | 40K | 4M | 40M |
| Notifications received | ~100 rows | 100K | 10M | 100M |
| **TOTAL** | **~500-700 rows** | **~700K** | **~74M** | **~740M** |

### 5.2 Scaling Strategy by Volume Tier

#### Tier 1: Up to 100K Students (~74M rows total)
- **MySQL with proper indexing is sufficient**
- Partition large tables by `academicYear` or `examYear`
- Use read replicas for reporting queries
- Keep DynamoDB for attendance (already in place)

#### Tier 2: 100K–1M Students (~740M rows)
- **Add table partitioning** to `attendance_records`, `student_study_logs`, `user_preferences`
- **Implement materialized summary tables** (`student_marks_summary`)
- **Move heavy read queries to read replicas**
- **Archive old academic years** (partition swapping)
- Consider **Redis caching** for:
  - Student preference lookups (TTL: 1 hour)
  - Marks summary for current term (TTL: 15 min)
  - Active schedule lookups (TTL: 30 min)

#### Tier 3: 1M+ Students
- **Shard by institute** — each institute's data can live independently
- **Move analytics to columnar store** (BigQuery/ClickHouse) for cross-institute reporting
- **Event-driven architecture** — emit events for marks/attendance, consume async
- **CQRS pattern** — separate write models from read models for dashboards

---

## 6. New Entity Relationship Diagram (Full Picture)

```
                                 ┌─────────────┐
                                 │   STUDENT    │
                                 │   (User)     │
                                 └──────┬───────┘
                    ┌───────────────────┼───────────────────────┐
                    │                   │                       │
              ┌─────▼─────┐     ┌──────▼──────┐        ┌──────▼──────┐
              │ INSTITUTE  │     │   PARENT    │        │ PREFERENCES │
              │ ENROLLMENT │     │  (Father/   │        │ (Scoped)    │
              └─────┬──────┘     │  Mother/    │        └─────────────┘
                    │            │  Guardian)  │
         ┌─────────┼─────────┐  └─────────────┘
         │         │         │
    ┌────▼───┐ ┌───▼───┐ ┌──▼────┐
    │ CLASS  │ │SUBJECT│ │ HOUSE │
    │ENROLLED│ │ENROLLED│ │MEMBER│
    └────┬───┘ └───┬───┘ └──────┘
         │         │
    ┌────┼─────────┼──────────────────────┐
    │    │         │                      │
┌───▼──┐│   ┌─────▼─────┐  ┌────────────▼────────────┐
│ATTEND││   │   EXAMS    │  │      HOMEWORK            │
│ANCE  ││   │   taken    │  │  assignments + submit    │
└──────┘│   └─────┬──────┘  └─────────────────────────┘
        │         │
        │   ┌─────▼──────┐    ┌──────────────────────┐
        │   │  RESULTS   │    │    STUDENT SCHEDULE   │
        │   │ (marks,    │    │  (timetable, study    │
        │   │  grade)    │    │   time management)    │
        │   └────────────┘    └──────────────────────┘
        │
  ┌─────▼────────────┐    ┌──────────────────────┐
  │ NATIONAL EXAM    │    │   STUDY LOGS          │
  │ RESULTS          │    │  (tracked time)       │
  │ (OL/AL/Grade5)   │    └──────────────────────┘
  └──────────────────┘
        │
  ┌─────▼────────────┐
  │  MARKS SUMMARY   │
  │ (pre-aggregated) │
  └──────────────────┘
```

---

## 7. Mapping Incoming Data to Existing Students

### 7.1 Bulk Import Flow

```
 CSV/API Import (e.g., national exam results)
        │
        ▼
 ┌──────────────────┐
 │  PARSE & VALIDATE │ ← Validate format, required fields, data types
 │  (batch of 1000)  │
 └────────┬─────────┘
          │
          ▼
 ┌──────────────────┐
 │  MATCH PIPELINE   │ ← Run matchStudent() for each record
 │  (parallel, 10    │    Group results by confidence level
 │   concurrent)     │
 └────────┬─────────┘
          │
     ┌────┴─────────────────────────┐
     │              │               │
     ▼              ▼               ▼
 ┌────────┐  ┌───────────┐  ┌─────────────┐
 │ MATCHED│  │ AMBIGUOUS │  │ NO MATCH    │
 │ (auto) │  │ (review   │  │ (create new │
 │        │  │  queue)   │  │  or skip)   │
 └───┬────┘  └─────┬─────┘  └──────┬──────┘
     │              │               │
     ▼              ▼               ▼
 ┌────────┐  ┌───────────┐  ┌─────────────┐
 │ Link   │  │ Admin     │  │ Create User │
 │ result │  │ resolves  │  │ + Student   │
 │ to     │  │ manually  │  │ + link data │
 │ student│  │ via UI    │  │             │
 └────────┘  └───────────┘  └─────────────┘
```

### 7.2 Example: Importing OL Results for Existing Students

```typescript
// Pseudocode for bulk OL result import
async function importNationalResults(records: OLResultRecord[]) {
  const results = { linked: 0, created: 0, review: 0, failed: 0 };
  
  for (const batch of chunk(records, 500)) {
    await dataSource.transaction(async (manager) => {
      for (const record of batch) {
        // Try to match
        const match = await matchStudent({
          firstName: record.studentName,
          nic: record.nic,
          dob: record.dob,
          indexNumber: record.indexNumber,
        });

        if (match.confidence >= 0.80) {
          // Auto-link
          await manager.save(StudentNationalExamResult, {
            studentUserId: match.matchedUserId,
            examType: 'OL',
            examYear: record.year,
            indexNumber: record.indexNumber,
            subjectCode: record.subjectCode,
            subjectName: record.subjectName,
            grade: record.grade,
          });
          results.linked++;
        } else if (match.candidates.length > 0) {
          // Queue for review
          await manager.save(ImportReviewQueue, {
            rawData: JSON.stringify(record),
            candidates: JSON.stringify(match.candidates),
            status: 'PENDING_REVIEW',
          });
          results.review++;
        } else {
          // No match — depending on policy, create or skip
          results.created++;
        }
      }
    });
  }
  return results;
}
```

---

## 8. Caching Strategy for Frequently Accessed Data

### What to Cache (Redis/In-Memory)

| Data | Cache Key Pattern | TTL | Invalidation |
|------|------------------|-----|-------------|
| Student preferences | `prefs:user:{userId}:{scope}` | 1 hour | On preference update |
| Current term marks summary | `marks:summary:{userId}:{term}` | 15 min | On result save |
| Today's schedule | `schedule:{userId}:{dayOfWeek}` | Until midnight | On schedule update |
| Class roster | `roster:{instituteId}:{classId}` | 30 min | On enrollment change |
| Parent's children list | `children:{parentUserId}` | 1 hour | On student-parent link change |

### Cache Layer Integration

```typescript
// Add to existing service pattern
async getStudentPreferences(userId: bigint, scope: string, scopeId?: bigint): Promise<UserPreference[]> {
  const cacheKey = `prefs:user:${userId}:${scope}:${scopeId || 'global'}`;
  
  const cached = await this.cacheManager.get<UserPreference[]>(cacheKey);
  if (cached) return cached;

  const prefs = await this.prefRepo.find({
    where: { userId, scope, scopeId, isActive: true }
  });
  
  await this.cacheManager.set(cacheKey, prefs, 3600); // 1 hour
  return prefs;
}
```

---

## 9. Migration Path — Adding New Tables to Existing System

### Step 1: Create Entities (TypeORM)

New entities to add under existing module structure:

| Entity | Module Location | Purpose |
|--------|----------------|---------|
| `StudentNationalExamResultEntity` | `src/modules/student/entities/` | OL/AL result storage |
| `StudentMarksSummaryEntity` | `src/modules/institute_class_subject_modules/` | Aggregated marks per term |
| `UserPreferenceEntity` | `src/modules/user/entities/` | Scoped preferences |
| `StudentScheduleEntity` | `src/modules/student/entities/` | Personal timetable |
| `StudentStudyLogEntity` | `src/modules/student/entities/` | Study time tracking |
| `ImportReviewQueueEntity` | `src/modules/student/entities/` | Bulk import review queue |

### Step 2: Generate Migrations

```bash
npx typeorm migration:generate src/database/migrations/AddStudentDataScaling -d src/data-source.ts
```

### Step 3: Integration Points

| New Feature | Integrates With |
|-------------|----------------|
| National exam results | `StudentEntity` (FK), marks summary aggregation job |
| Student preferences | `UserEntity` (FK), notification service (channel prefs), advertisement targeting |
| Student schedules | `InstituteCalendarDay` (conflicts), attendance (expected presence) |
| Study logs | Homework submissions (auto-track), lecture views (auto-track) |
| Import queue | Admin dashboard, notification on resolution |

---

## 10. Summary: Complete Data Storage Map

```
Student-Centric Data Universe
═══════════════════════════════

IDENTITY (exists)
├── UserEntity           → name, email, phone, NIC, DOB, gender, address
├── StudentEntity        → medical, emergency, parent links
├── ParentEntity         → occupation, education
└── InstituteUserEntity  → per-institute role, status, card

ACADEMIC (exists + new)
├── [EXISTS] InstituteClassSubjectResault  → internal exam marks
├── [EXISTS] InstituteClassSubjectExam     → exam definitions
├── [NEW]    StudentNationalExamResult     → OL/AL/Scholarship
├── [NEW]    StudentMarksSummary           → aggregated per term
├── [EXISTS] InstituteClassSubjectHomework → assignments
└── [EXISTS] HomeworksSubmission           → student work

ENROLLMENT (exists)
├── InstituteClassStudentEntity            → class enrollment
├── InstituteClassSubjectStudent           → subject enrollment
├── OrganizationUserEntity                 → org membership
└── InstituteHouseMemberEntity             → house assignment

ATTENDANCE (exists)
├── DynamoDB                               → real-time writes
├── AttendanceRecordEntity (MySQL)         → synced for reporting
└── AttendanceDeviceEntity                 → device management

PREFERENCES (exists + new)
├── [EXISTS] UserEntity.userSettings JSON  → simple prefs
└── [NEW]    UserPreferenceEntity          → scoped, queryable prefs

TIME MANAGEMENT (new)  
├── [NEW]    StudentScheduleEntity         → personal timetable
├── [NEW]    StudentStudyLogEntity         → activity tracking
└── [EXISTS] InstituteCalendarEntity       → institute calendar

COMMUNICATION (exists)
├── PushNotificationEntity                 → FCM push
├── InstituteSmsMessageEntity              → SMS campaigns
├── AdvertisementEntity                    → multi-channel ads
└── UserFcmTokenEntity                     → device tokens

FINANCIAL (exists)
├── PaymentEntity                          → user payments
├── InstituteClassSubjectPaymentEntity     → fee config
└── MonthlyBillingSummaryEntity            → billing

FILES & MEDIA (exists)
├── UserDriveTokenEntity                   → Google OAuth
├── UserDriveFileEntity                    → Drive file cache
├── HomeworkReferenceEntity                → attachments
└── UserImageEntity                        → profile images
```

---

## 11. Key Decisions & Trade-offs

| Decision | Why |
|----------|-----|
| Separate table for national exams vs expanding existing results table | National exams have different fields (island rank, z-score, stream) and are imported in bulk — different access pattern |
| EAV (Entity-Attribute-Value) for preferences | Avoids schema changes for every new preference type; queryable unlike JSON |
| Pre-aggregated marks summary | Dashboard queries scan millions of result rows without this; summary table makes it O(1) per student |
| Partition by year | Old data rarely queried; partitions enable fast archive and prune |
| DynamoDB stays for attendance | Already proven for high-throughput writes; MySQL sync for reporting is working |
| Match by cascade (email → NIC → composite → fuzzy) | Balances automation with accuracy; admin review queue catches edge cases |

---

## 12. Next Steps

1. **Create the new TypeORM entities** for `StudentNationalExamResult`, `UserPreference`, `StudentSchedule`, `StudentStudyLog`
2. **Generate and run migrations**
3. **Build the matching service** as a standalone injectable service
4. **Add bulk import endpoints** with CSV/JSON parsing
5. **Implement the marks aggregation job** (cron-based, populates `StudentMarksSummary`)
6. **Add Redis caching layer** for preference and summary lookups
7. **Build admin review UI** for ambiguous matches during bulk import
