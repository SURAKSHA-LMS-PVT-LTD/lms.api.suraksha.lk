# Institute Calendar + Attendance Reporting Architecture

## Problem Statement

The current attendance system only records **what DID happen** (someone was marked present/absent). It has **zero knowledge of what SHOULD have happened**:

| Scenario | Current System | Result |
|---|---|---|
| Saturday (no school) | No attendance records | ✅ Correct by accident |
| Working day, teacher forgot to mark | No attendance records | ❌ Invisible — looks like Saturday |
| Working day, 30/50 students show up, only PRESENT marked | 30 records | ❌ Rate = 100% (30/30 instead of 30/50) |
| Public holiday (Vesak Poya) | No records | ❌ Indistinguishable from "forgot to mark" |
| Institute open, but Class 10-A on field trip | No records for 10-A | ❌ No way to know why |
| Parents meeting held | No tracking at all | ❌ Can't report parent engagement |

**For year-end reports, the system must know:**
1. Which days were working days? (per institute AND per class)
2. Who was expected to attend on each day?
3. What events happened (exams, ceremonies, parent meetings)?
4. What actually happened (attendance records)?

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                    CONFIGURATION LAYER (Set once)                   │
│                                                                     │
│  institute_operating_config     Default weekly pattern              │
│  (Mon=working, Tue=working,     defines which days institute runs   │
│   ..., Sat=off, Sun=off)        + default operating hours           │
│                                                                     │
│  institute_class_schedule       Which classes run on which days     │
│  (Class 10-A: Mon,Wed,Fri       of the week (recurring pattern)     │
│   Class 10-B: Tue,Thu,Sat)                                         │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ Auto-generates ↓
┌──────────────────────────▼──────────────────────────────────────────┐
│                    CALENDAR LAYER (Per day)                         │
│                                                                     │
│  institute_calendar_days        One row per institute per date      │
│  (2025-03-15 = WORKING_DAY,     defines what type of day it is     │
│   2025-03-16 = WEEKEND, ...)    ID used as FK in attendance         │
│                                                                     │
│  institute_calendar_events      Zero or more events per day        │
│  (Parents Meeting 2pm,          ceremonies, exams, sports days,     │
│   Prize Giving all day, ...)    field trips, workshops              │
│                                                                     │
│  institute_class_calendar       Class-level day overrides           │
│  (Class 10-A: 2025-03-15       when a class differs from           │
│   = FIELD_TRIP instead of       the institute calendar              │
│   WORKING_DAY)                                                      │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ Links to ↓ (calendar_day_id / event_id)
┌──────────────────────────▼──────────────────────────────────────────┐
│                    ATTENDANCE LAYER (Per person per day)            │
│                                                                     │
│  DynamoDB attendance_events     Hot storage (2-3 months TTL)        │
│  (now includes calendar_day_id  fast marking & real-time queries    │
│   and optional event_id)                                            │
│                                                                     │
│  MySQL attendance_records       Permanent storage (7+ years)        │
│  (synced from DynamoDB,          for reporting & analytics          │
│   includes calendar_day_id)                                         │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ Queries ↓
┌──────────────────────────▼──────────────────────────────────────────┐
│                    REPORTING LAYER                                   │
│                                                                     │
│  JOIN calendar_days + attendance_records + enrollment               │
│  → Per-day breakdown: eligible vs present vs absent vs unmarked     │
│  → Monthly/term/yearly summaries                                    │
│  → Event attendance reports (who came to parents meeting?)          │
│  → Unmarked day alerts (working day but no records)                 │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Database Schema Design

### Table 1: `institute_operating_config`

**Purpose:** Default weekly template — "This institute runs Mon–Fri, 8am–3pm"

Used to **auto-generate** the yearly calendar. Set once, rarely changed.

```sql
CREATE TABLE institute_operating_config (
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  institute_id    BIGINT NOT NULL,
  day_of_week     TINYINT NOT NULL COMMENT '1=Monday, 2=Tuesday, ..., 7=Sunday (ISO 8601)',
  is_operating    BOOLEAN NOT NULL DEFAULT TRUE,
  start_time      TIME NULL COMMENT 'Default operating start, e.g. 08:00:00',
  end_time        TIME NULL COMMENT 'Default operating end, e.g. 15:00:00',
  academic_year   VARCHAR(20) NOT NULL COMMENT 'e.g. 2025 or 2025/2026',
  
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_by      BIGINT NULL,

  UNIQUE KEY uq_inst_dow_year (institute_id, day_of_week, academic_year),
  FOREIGN KEY (institute_id) REFERENCES institutes(id) ON DELETE CASCADE,
  INDEX idx_inst_year (institute_id, academic_year)
) ENGINE=InnoDB;
```

**Example data:**
| institute_id | day_of_week | is_operating | start_time | end_time | academic_year |
|---|---|---|---|---|---|
| 1 | 1 (Mon) | true | 08:00 | 15:00 | 2025 |
| 1 | 2 (Tue) | true | 08:00 | 15:00 | 2025 |
| 1 | 6 (Sat) | false | NULL | NULL | 2025 |
| 1 | 7 (Sun) | false | NULL | NULL | 2025 |
| 2 | 6 (Sat) | true | 08:00 | 12:00 | 2025 |

> Institute 2 runs on Saturdays (half-day) — like some tuition/dhamma schools.

---

### Table 2: `institute_calendar_days`

**Purpose:** One row per institute per date. THE source of truth for "was this a working day?"

**This is the KEY table.** Its `id` is referenced by every attendance record.

```sql
CREATE TABLE institute_calendar_days (
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  institute_id    BIGINT NOT NULL,
  calendar_date   DATE NOT NULL,
  academic_year   VARCHAR(20) NOT NULL,
  
  -- Day classification
  day_type        ENUM(
    'REGULAR',           -- Normal working day
    'WEEKEND',           -- Saturday/Sunday (non-operating)
    'PUBLIC_HOLIDAY',    -- Government/national holiday (Vesak, Christmas, etc.)
    'INSTITUTE_HOLIDAY', -- Institute-specific closure (annual vacation, term break)
    'HALF_DAY',          -- Shortened operating hours
    'EXAM_DAY',          -- Dedicated exam day (different attendance expectations)
    'STAFF_ONLY',        -- Teachers/staff report, students don't (planning days)
    'SPECIAL_EVENT',     -- Ceremony, sports day, etc. (see calendar_events for details)
    'CANCELLED'          -- Was supposed to be working but cancelled (weather, emergency)
  ) NOT NULL DEFAULT 'REGULAR',
  
  -- Day metadata
  title           VARCHAR(255) NULL COMMENT 'e.g. "Vesak Poya Day", "Term 1 Break"',
  description     TEXT NULL,
  
  -- Operating hours override (NULL = use institute_operating_config defaults)
  start_time      TIME NULL COMMENT 'Override start time for this specific day',
  end_time        TIME NULL COMMENT 'Override end time for this specific day',
  
  -- Attendance expectations
  is_attendance_expected BOOLEAN NOT NULL DEFAULT TRUE 
    COMMENT 'FALSE for holidays/weekends. TRUE for working days. Controls reporting.',
  
  -- Auto-generation tracking
  source          ENUM('AUTO_GENERATED', 'MANUAL', 'BULK_IMPORT') DEFAULT 'AUTO_GENERATED'
    COMMENT 'How this row was created',
  
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_by      BIGINT NULL,

  UNIQUE KEY uq_inst_date (institute_id, calendar_date),
  FOREIGN KEY (institute_id) REFERENCES institutes(id) ON DELETE CASCADE,
  INDEX idx_inst_year_type (institute_id, academic_year, day_type),
  INDEX idx_inst_date_range (institute_id, calendar_date),
  INDEX idx_inst_attendance_expected (institute_id, is_attendance_expected, calendar_date)
) ENGINE=InnoDB;
```

**Example data:**
| id | institute_id | calendar_date | day_type | title | is_attendance_expected |
|---|---|---|---|---|---|
| 1001 | 1 | 2025-01-06 | REGULAR | NULL | TRUE |
| 1002 | 1 | 2025-01-07 | REGULAR | NULL | TRUE |
| 1003 | 1 | 2025-01-08 | REGULAR | NULL | TRUE |
| 1004 | 1 | 2025-01-09 | PUBLIC_HOLIDAY | Poya Day | FALSE |
| 1005 | 1 | 2025-01-10 | REGULAR | NULL | TRUE |
| 1006 | 1 | 2025-01-11 | WEEKEND | Saturday | FALSE |
| 1007 | 1 | 2025-01-12 | WEEKEND | Sunday | FALSE |
| 1050 | 1 | 2025-02-14 | SPECIAL_EVENT | Annual Prize Giving | TRUE |
| 1051 | 1 | 2025-03-20 | STAFF_ONLY | Teacher Planning Day | TRUE |

---

### Table 3: `institute_calendar_events`

**Purpose:** Specific events that happen on calendar days. A day can have ZERO or MULTIPLE events.

This is what makes the calendar system **event-aware** — not just "working/holiday" but rich contextual events like parent meetings, ceremonies, workshops.

```sql
CREATE TABLE institute_calendar_events (
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  institute_id    BIGINT NOT NULL,
  calendar_day_id BIGINT NULL COMMENT 'FK to institute_calendar_days. NULL if event spans concepts beyond a single day',
  
  -- Event identity
  event_type      ENUM(
    'REGULAR_CLASS',       -- Normal daily classes (auto-generated for working days)
    'EXAM',                -- Examination
    'PARENTS_MEETING',     -- Parent-teacher meeting
    'PRIZE_GIVING',        -- Annual prize giving ceremony
    'SPORTS_DAY',          -- Sports meet / athletics day
    'CULTURAL_EVENT',      -- Cultural show, concert, drama
    'FIELD_TRIP',          -- Educational excursion
    'WORKSHOP',            -- Special workshop or seminar
    'ORIENTATION',         -- New student/parent orientation
    'OPEN_DAY',            -- School open day for public
    'RELIGIOUS_EVENT',     -- Religious ceremony (Bodhi Puja, etc.)
    'EXTRACURRICULAR',     -- Club activities, competitions
    'STAFF_MEETING',       -- Staff/teacher meetings
    'TRAINING',            -- Teacher training / professional development
    'GRADUATION',          -- Graduation ceremony
    'ADMISSION',           -- Admission/enrollment event
    'MAINTENANCE',         -- Building/facility maintenance
    'CUSTOM'               -- Any other event type
  ) NOT NULL,
  
  title           VARCHAR(255) NOT NULL,
  description     TEXT NULL,
  
  -- Timing  
  event_date      DATE NOT NULL,
  start_time      TIME NULL COMMENT 'NULL = all day event',
  end_time        TIME NULL,
  is_all_day      BOOLEAN DEFAULT FALSE,
  
  -- Attendance tracking for this event
  is_attendance_tracked BOOLEAN DEFAULT FALSE 
    COMMENT 'TRUE = system should track who attended this event',
  
  -- Default event for this day (only ONE per calendar_day can be true)
  is_default BOOLEAN DEFAULT FALSE
    COMMENT 'When TRUE, attendance marked without explicit event_id goes to this event. Only ONE per day.',
  
  -- Who is EXPECTED at this event? (for reporting denominator only — does NOT block anyone)
  target_user_types JSON NULL 
    COMMENT '["STUDENT","TEACHER","PARENT","INSTITUTE_ADMIN"] — NULL means all. Reporting only, never enforced.',
  
  -- Who is ALLOWED to mark attendance? (SOFT — never blocks, only logs mismatch)
  attendance_open_to ENUM('TARGET_ONLY', 'ALL_ENROLLED', 'ANYONE') DEFAULT 'ANYONE'
    COMMENT 'ANYONE = any user can mark. TARGET_ONLY/ALL_ENROLLED are soft labels for reporting, NOT enforced.',
  
  -- Scope: which classes does this event apply to?
  target_scope    ENUM('INSTITUTE', 'CLASS', 'SUBJECT') DEFAULT 'INSTITUTE'
    COMMENT 'INSTITUTE = whole institute, CLASS = specific classes, SUBJECT = specific subjects',
  target_class_ids JSON NULL 
    COMMENT '[1, 5, 12] — specific class IDs. NULL = all classes (when scope is INSTITUTE)',
  target_subject_ids JSON NULL 
    COMMENT '[3, 7] — specific subject IDs. NULL = all subjects',
  
  -- Venue & logistics
  venue           VARCHAR(255) NULL,
  meeting_link    TEXT NULL COMMENT 'For virtual events',
  
  -- Status
  status          ENUM('SCHEDULED', 'ONGOING', 'COMPLETED', 'CANCELLED', 'POSTPONED') DEFAULT 'SCHEDULED',
  
  -- Metadata
  max_participants INT NULL,
  is_mandatory    BOOLEAN DEFAULT FALSE COMMENT 'If TRUE, absence counts against attendance record',
  notes           TEXT NULL,
  
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_by      BIGINT NULL,

  FOREIGN KEY (institute_id) REFERENCES institutes(id) ON DELETE CASCADE,
  FOREIGN KEY (calendar_day_id) REFERENCES institute_calendar_days(id) ON DELETE SET NULL,
  INDEX idx_inst_date (institute_id, event_date),
  INDEX idx_inst_type (institute_id, event_type),
  INDEX idx_inst_date_type (institute_id, event_date, event_type),
  INDEX idx_calendar_day (calendar_day_id),
  INDEX idx_inst_tracked (institute_id, is_attendance_tracked, event_date)
) ENGINE=InnoDB;
```

**Example data:**
| id | calendar_day_id | event_type | title | is_default | target_user_types | target_scope | target_class_ids | is_attendance_tracked | attendance_open_to |
|---|---|---|---|---|---|---|---|---|---|
| 501 | 1050 | PRIZE_GIVING | Annual Prize Giving 2025 | TRUE | ["STUDENT","TEACHER","PARENT"] | INSTITUTE | NULL | TRUE | ANYONE |
| 502 | 1051 | STAFF_MEETING | Term 1 Planning Meeting | TRUE | ["TEACHER","INSTITUTE_ADMIN"] | INSTITUTE | NULL | TRUE | ANYONE |
| 503 | 1020 | PARENTS_MEETING | Grade 10 Parent Meeting | FALSE | ["PARENT","TEACHER"] | CLASS | [10] | TRUE | ANYONE |
| 504 | 1035 | FIELD_TRIP | Science Museum Visit | FALSE | ["STUDENT","TEACHER"] | CLASS | [8, 9] | TRUE | ANYONE |
| 505 | 1001 | REGULAR_CLASS | Regular Classes | TRUE | NULL | INSTITUTE | NULL | TRUE | ANYONE |
| 506 | 1040 | EXAM | Term 1 Science Exam | FALSE | ["STUDENT"] | SUBJECT | NULL | TRUE | ANYONE |

> **Notes:**
> - `REGULAR_CLASS` events are auto-generated for every REGULAR day with `is_default = TRUE`
> - Every attendance record links to an event — even normal days have an event_id
> - `attendance_open_to = ANYONE` means all users can mark attendance regardless of type/enrollment
> - `target_user_types` is for **reporting only** — "98 of 120 expected students attended" — never blocks marking

---

### Table 4: `institute_class_calendar`

**Purpose:** Class-level overrides when a class differs from the institute calendar for a specific date.

```sql
CREATE TABLE institute_class_calendar (
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  institute_id    BIGINT NOT NULL,
  class_id        BIGINT NOT NULL,
  calendar_day_id BIGINT NOT NULL COMMENT 'FK to institute_calendar_days',
  calendar_date   DATE NOT NULL COMMENT 'Denormalized for query perf',
  
  -- Override the institute-level day_type for THIS class
  class_day_type  ENUM(
    'REGULAR',            -- Class runs normally (override if institute has SPECIAL_EVENT but class still has regular)
    'CLASS_HOLIDAY',      -- Class cancelled but institute open
    'FIELD_TRIP',         -- Class on excursion
    'EXAM_DAY',           -- Class has exam
    'EXTRA_CLASS',        -- Extra class on what would normally be a day off
    'CANCELLED',          -- Class cancelled (teacher absent, etc.)
    'MERGED',             -- Class merged with another class for the day
    'CUSTOM'              -- Other override
  ) NOT NULL,
  
  title           VARCHAR(255) NULL,
  description     TEXT NULL,
  
  -- Override attendance expectation
  is_attendance_expected BOOLEAN NOT NULL DEFAULT TRUE,
  
  -- If merged, reference which class it merged into
  merged_with_class_id BIGINT NULL,
  
  -- If substitute teacher
  substitute_teacher_id BIGINT NULL,
  
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_by      BIGINT NULL,

  UNIQUE KEY uq_inst_class_date (institute_id, class_id, calendar_date),
  FOREIGN KEY (institute_id) REFERENCES institutes(id) ON DELETE CASCADE,
  FOREIGN KEY (class_id) REFERENCES institute_classes(id) ON DELETE CASCADE,
  FOREIGN KEY (calendar_day_id) REFERENCES institute_calendar_days(id) ON DELETE CASCADE,
  INDEX idx_class_date_range (institute_id, class_id, calendar_date),
  INDEX idx_calendar_day (calendar_day_id)
) ENGINE=InnoDB;
```

**Example: Institute working day but Class 10-A is on a field trip:**
| institute_id | class_id | calendar_day_id | calendar_date | class_day_type | title |
|---|---|---|---|---|---|
| 1 | 10 | 1035 | 2025-02-20 | FIELD_TRIP | Science Museum Visit |
| 1 | 12 | 1001 | 2025-01-06 | CANCELLED | Teacher sick — class cancelled |
| 1 | 8 | 1006 | 2025-01-11 | EXTRA_CLASS | Saturday extra revision class |

---

## How Attendance Links to Calendar

### The Key: `calendar_day_id` + `event_id`

Every attendance record now carries:

| Field | Purpose |
|---|---|
| `calendar_day_id` | Links to `institute_calendar_days.id` — "which day is this?" |
| `event_id` | Links to `institute_calendar_events.id` — "for which event?" (NULL = regular day attendance) |

### DynamoDB Record Changes

**V1 (`dynamodb-attendance.service.ts`):**
```
AttendanceRecord {
  ...existing fields...
  calendarDayId: string    // NEW — institute_calendar_days.id
  eventId?: string         // NEW — institute_calendar_events.id (optional)
}
```

**V2 (`dynamodb-attendance.service.v2.ts`) — shortened fields:**
```
AttendanceRecordV2 {
  ...existing fields...
  cdid: string    // calendar_day_id
  eid?: string    // event_id (optional)
}
```

### Attendance Marking Flow (Updated)

```
                       ┌─────────────────────────────┐
                       │ markAttendance() called      │
                       └──────────┬──────────────────┘
                                  │
                       ┌──────────▼──────────────────┐
                       │ 1. Look up today's           │
                       │    calendar_day for this     │
                       │    institute                 │
                       │                             │
                       │    SELECT id, day_type,     │
                       │    is_attendance_expected    │
                       │    FROM institute_calendar_  │
                       │    days WHERE institute_id=? │
                       │    AND calendar_date=TODAY   │
                       └──────────┬──────────────────┘
                                  │
                    ┌─────────────┼─────────────────┐
                    │             │                   │
             ┌──────▼──────┐  ┌──▼────────────┐  ┌──▼──────────┐
             │ day_type =   │  │ day_type =     │  │ No calendar │
             │ REGULAR /    │  │ WEEKEND /      │  │ day found   │
             │ EXAM_DAY /   │  │ HOLIDAY        │  │             │
             │ SPECIAL_EVENT│  │                │  │ Auto-create │
             │              │  │ Warn but allow │  │ as REGULAR  │
             │ Normal flow  │  │ with override  │  │ (lazy init) │
             └──────┬───────┘  └──┬────────────┘  └──┬──────────┘
                    │             │                   │
                    └─────────────┼───────────────────┘
                                  │
                    ┌─────────────▼─────────────────┐
                    │ 2. Check class-level override  │
                    │                               │
                    │ SELECT class_day_type          │
                    │ FROM institute_class_calendar  │
                    │ WHERE class_id=? AND date=?   │
                    │                               │
                    │ If exists, use class override  │
                    │ If not, use institute-level    │
                    └─────────────┬─────────────────┘
                                  │
                    ┌─────────────▼─────────────────┐
                    │ 3. Store attendance in DynamoDB│
                    │    WITH calendar_day_id        │
                    │    AND optional event_id       │
                    └───────────────────────────────┘
```

### Lazy Calendar Day Creation

If an institute hasn't generated their calendar yet, the system should NOT block attendance marking. Instead:

```typescript
// In markAttendance(), before storing:
let calendarDay = await this.calendarDayRepo.findOne({
  where: { instituteId, calendarDate: today }
});

if (!calendarDay) {
  // Auto-create: assume it's a regular working day (they're marking attendance, so clearly it's a working day)
  calendarDay = await this.calendarDayRepo.save({
    instituteId,
    calendarDate: today,
    academicYear: this.getCurrentAcademicYear(instituteId),
    dayType: 'REGULAR',
    isAttendanceExpected: true,
    source: 'AUTO_GENERATED'
  });
}

// Attach to DTO for DynamoDB storage
markAttendanceDto.calendarDayId = calendarDay.id;
```

This ensures **backward compatibility** — institutes that never configure their calendar still work, and the system auto-creates calendar days as attendance is marked.

---

## Calendar Day Generation

### Auto-Generation API

When an institute admin sets up their academic year:

```
POST /api/institutes/:instituteId/calendar/generate
Body: {
  "academicYear": "2025",
  "startDate": "2025-01-06",    // First day of academic year
  "endDate": "2025-12-19",      // Last day of academic year
  "publicHolidays": [            // Known public holidays (can bulk import Sri Lanka calendar)
    { "date": "2025-01-14", "title": "Tamil Thai Pongal" },
    { "date": "2025-02-04", "title": "Independence Day" },
    { "date": "2025-02-12", "title": "Navam Full Moon Poya" },
    { "date": "2025-03-14", "title": "Madin Full Moon Poya" },
    { "date": "2025-04-13", "title": "Sinhala & Tamil New Year Eve" },
    { "date": "2025-04-14", "title": "Sinhala & Tamil New Year" },
    { "date": "2025-05-01", "title": "May Day" },
    { "date": "2025-05-12", "title": "Vesak Full Moon Poya" },
    { "date": "2025-05-13", "title": "Day after Vesak" },
    ...
  ],
  "termBreaks": [                // Institute-specific closures
    { "startDate": "2025-04-07", "endDate": "2025-04-20", "title": "Term 1 Break" },
    { "startDate": "2025-08-04", "endDate": "2025-08-17", "title": "Term 2 Break" }
  ]
}
```

**Generation algorithm:**
```
For each date from startDate to endDate:
  1. Check operating_config → if day_of_week is non-operating → WEEKEND
  2. Check publicHolidays list → if match → PUBLIC_HOLIDAY
  3. Check termBreaks → if within range → INSTITUTE_HOLIDAY
  4. Otherwise → REGULAR (with is_attendance_expected = true)
  
  Also auto-create a REGULAR_CLASS event for each REGULAR day.
```

**Result:** ~365 rows in `institute_calendar_days` + ~200 rows in `institute_calendar_events` (for working days).

### Sri Lanka Public Holidays Seed Data

A utility to bulk-load known Sri Lanka public holidays:

```typescript
// Common Sri Lanka holidays (Poya days change yearly — need calculation or manual input)
const SRI_LANKA_FIXED_HOLIDAYS = [
  { month: 1, day: 14, title: 'Tamil Thai Pongal' },
  { month: 2, day: 4, title: 'Independence Day' },
  { month: 5, day: 1, title: 'May Day' },
  { month: 12, day: 25, title: 'Christmas Day' },
];

// Poya days vary by year — need a lookup or admin input
// All 12 Poya full moon days are public holidays in Sri Lanka
```

---

## Reporting Architecture

### Report 1: Year Report (Per Institute)

```sql
-- Total working days in 2025
SELECT 
  COUNT(*) as total_days,
  SUM(CASE WHEN day_type = 'REGULAR' THEN 1 ELSE 0 END) as working_days,
  SUM(CASE WHEN day_type = 'WEEKEND' THEN 1 ELSE 0 END) as weekends,
  SUM(CASE WHEN day_type = 'PUBLIC_HOLIDAY' THEN 1 ELSE 0 END) as public_holidays,
  SUM(CASE WHEN day_type = 'INSTITUTE_HOLIDAY' THEN 1 ELSE 0 END) as institute_holidays,
  SUM(CASE WHEN day_type = 'SPECIAL_EVENT' THEN 1 ELSE 0 END) as special_events,
  SUM(CASE WHEN day_type = 'EXAM_DAY' THEN 1 ELSE 0 END) as exam_days,
  SUM(CASE WHEN day_type = 'STAFF_ONLY' THEN 1 ELSE 0 END) as staff_only_days
FROM institute_calendar_days
WHERE institute_id = ? AND academic_year = '2025';
```

### Report 2: Per-Day Attendance Breakdown

```sql
-- For each working day: how many eligible, present, absent, unmarked?
SELECT 
  cd.calendar_date,
  cd.day_type,
  cd.title as day_title,
  
  -- Eligible count (active students in institute on that date)
  (SELECT COUNT(*) FROM institute_user iu 
   WHERE iu.institute_id = cd.institute_id 
   AND iu.status = 'ACTIVE' 
   AND iu.institute_user_type = 'STUDENT'
   AND iu.created_at <= cd.calendar_date) as eligible_students,
  
  -- Actual attendance counts (from MySQL attendance_records)
  COUNT(DISTINCT CASE WHEN ar.status = 'PRESENT' THEN ar.user_id END) as present_count,
  COUNT(DISTINCT CASE WHEN ar.status = 'ABSENT' THEN ar.user_id END) as absent_count,
  COUNT(DISTINCT CASE WHEN ar.status = 'LATE' THEN ar.user_id END) as late_count,
  COUNT(DISTINCT CASE WHEN ar.status = 'LEFT' THEN ar.user_id END) as left_count,
  
  -- Unmarked = eligible - (present + absent + late + left)
  -- Calculated in application layer
  
  -- Was attendance marked at all on this day?
  CASE WHEN COUNT(ar.id) = 0 AND cd.is_attendance_expected = TRUE 
       THEN 'NOT_MARKED' 
       ELSE 'MARKED' END as marking_status

FROM institute_calendar_days cd
LEFT JOIN attendance_records ar 
  ON ar.calendar_day_id = cd.id
WHERE cd.institute_id = ?
  AND cd.academic_year = '2025'
  AND cd.is_attendance_expected = TRUE
GROUP BY cd.id, cd.calendar_date, cd.day_type, cd.title
ORDER BY cd.calendar_date;
```

**Output:**
| calendar_date | day_type | eligible_students | present | absent | late | marking_status |
|---|---|---|---|---|---|---|
| 2025-01-06 | REGULAR | 450 | 420 | 25 | 5 | MARKED |
| 2025-01-07 | REGULAR | 450 | 415 | 30 | 5 | MARKED |
| 2025-01-08 | REGULAR | 450 | 0 | 0 | 0 | **NOT_MARKED** |
| 2025-01-10 | REGULAR | 450 | 430 | 17 | 3 | MARKED |
| 2025-02-14 | SPECIAL_EVENT | 450 | 380 | 70 | 0 | MARKED |

### Report 3: Per-Student Year Report

```sql
-- Student X's attendance for the year
SELECT 
  iu.user_id,
  u.first_name,
  u.last_name,
  
  -- Total working days they should have attended
  (SELECT COUNT(*) FROM institute_calendar_days cd2 
   WHERE cd2.institute_id = ? AND cd2.academic_year = '2025'
   AND cd2.is_attendance_expected = TRUE
   AND cd2.calendar_date >= iu.created_at) as expected_days,
  
  -- Actual attendance
  SUM(CASE WHEN ar.status = 'PRESENT' THEN 1 ELSE 0 END) as days_present,
  SUM(CASE WHEN ar.status = 'ABSENT' THEN 1 ELSE 0 END) as days_absent,
  SUM(CASE WHEN ar.status = 'LATE' THEN 1 ELSE 0 END) as days_late,
  
  -- Real attendance rate
  ROUND(
    SUM(CASE WHEN ar.status IN ('PRESENT','LATE') THEN 1 ELSE 0 END) * 100.0
    / NULLIF((SELECT COUNT(*) FROM institute_calendar_days cd3 
              WHERE cd3.institute_id = ? AND cd3.academic_year = '2025'
              AND cd3.is_attendance_expected = TRUE
              AND cd3.calendar_date >= iu.created_at), 0),
    2
  ) as real_attendance_rate

FROM institute_user iu
JOIN users u ON u.id = iu.user_id
LEFT JOIN attendance_records ar 
  ON ar.user_id = iu.user_id 
  AND ar.institute_id = iu.institute_id
  AND ar.calendar_day_id IN (
    SELECT id FROM institute_calendar_days 
    WHERE institute_id = ? AND academic_year = '2025' AND is_attendance_expected = TRUE
  )
WHERE iu.institute_id = ? 
  AND iu.institute_user_type = 'STUDENT'
  AND iu.status = 'ACTIVE'
GROUP BY iu.user_id, u.first_name, u.last_name;
```

### Report 4: Class-Aware Attendance (Handles Class Overrides)

```sql
-- For Class 10-A, considering class-level overrides
SELECT 
  cd.calendar_date,
  cd.day_type as institute_day_type,
  COALESCE(cc.class_day_type, cd.day_type) as effective_day_type,
  COALESCE(cc.is_attendance_expected, cd.is_attendance_expected) as class_attendance_expected,
  cc.title as class_override_reason,
  
  COUNT(DISTINCT ar.user_id) as attended

FROM institute_calendar_days cd
LEFT JOIN institute_class_calendar cc 
  ON cc.calendar_day_id = cd.id AND cc.class_id = ?
LEFT JOIN attendance_records ar 
  ON ar.calendar_day_id = cd.id 
  AND ar.class_id = ?::varchar
WHERE cd.institute_id = ? AND cd.academic_year = '2025'
GROUP BY cd.id, cd.calendar_date, cd.day_type, cc.class_day_type, 
         cc.is_attendance_expected, cc.title
ORDER BY cd.calendar_date;
```

**Output (Class 10-A has a field trip on Feb 20):**
| calendar_date | institute_day_type | effective_day_type | class_attendance_expected | override_reason | attended |
|---|---|---|---|---|---|
| 2025-02-19 | REGULAR | REGULAR | TRUE | NULL | 42 |
| 2025-02-20 | REGULAR | **FIELD_TRIP** | TRUE | Science Museum Visit | 38 |
| 2025-02-21 | REGULAR | REGULAR | TRUE | NULL | 40 |

### Report 5: Event Attendance Report

```sql
-- Who attended the Parents Meeting?
SELECT 
  ce.title as event_title,
  ce.event_type,
  ce.event_date,
  ce.target_user_types,
  
  COUNT(DISTINCT ar.user_id) as total_attended,
  COUNT(DISTINCT CASE WHEN ar.user_type = 'PARENT' THEN ar.user_id END) as parents_attended,
  COUNT(DISTINCT CASE WHEN ar.user_type = 'TEACHER' THEN ar.user_id END) as teachers_attended,
  COUNT(DISTINCT CASE WHEN ar.user_type = 'STUDENT' THEN ar.user_id END) as students_attended

FROM institute_calendar_events ce
LEFT JOIN attendance_records ar ON ar.event_id = ce.id
WHERE ce.institute_id = ? AND ce.event_type = 'PARENTS_MEETING'
  AND ce.event_date BETWEEN '2025-01-01' AND '2025-12-31'
GROUP BY ce.id;
```

---

## Entity Design (TypeORM)

### 1. InstituteOperatingConfigEntity

```typescript
@Entity('institute_operating_config')
@Unique(['instituteId', 'dayOfWeek', 'academicYear'])
export class InstituteOperatingConfigEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'institute_id', type: 'bigint' })
  instituteId: string;

  @ManyToOne(() => InstituteEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'institute_id' })
  institute: InstituteEntity;

  @Column({ name: 'day_of_week', type: 'tinyint', comment: '1=Mon..7=Sun ISO 8601' })
  dayOfWeek: number;

  @Column({ name: 'is_operating', type: 'boolean', default: true })
  isOperating: boolean;

  @Column({ name: 'start_time', type: 'time', nullable: true })
  startTime: string | null;

  @Column({ name: 'end_time', type: 'time', nullable: true })
  endTime: string | null;

  @Column({ name: 'academic_year', type: 'varchar', length: 20 })
  academicYear: string;

  @Column({ name: 'created_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  updatedAt: Date;

  @Column({ name: 'created_by', type: 'bigint', nullable: true })
  createdBy: string | null;
}
```

### 2. InstituteCalendarDayEntity

```typescript
export enum CalendarDayType {
  REGULAR = 'REGULAR',
  WEEKEND = 'WEEKEND',
  PUBLIC_HOLIDAY = 'PUBLIC_HOLIDAY',
  INSTITUTE_HOLIDAY = 'INSTITUTE_HOLIDAY',
  HALF_DAY = 'HALF_DAY',
  EXAM_DAY = 'EXAM_DAY',
  STAFF_ONLY = 'STAFF_ONLY',
  SPECIAL_EVENT = 'SPECIAL_EVENT',
  CANCELLED = 'CANCELLED',
}

export enum CalendarDaySource {
  AUTO_GENERATED = 'AUTO_GENERATED',
  MANUAL = 'MANUAL',
  BULK_IMPORT = 'BULK_IMPORT',
}

@Entity('institute_calendar_days')
@Unique(['instituteId', 'calendarDate'])
export class InstituteCalendarDayEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'institute_id', type: 'bigint' })
  instituteId: string;

  @ManyToOne(() => InstituteEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'institute_id' })
  institute: InstituteEntity;

  @Column({ name: 'calendar_date', type: 'date' })
  calendarDate: Date;

  @Column({ name: 'academic_year', type: 'varchar', length: 20 })
  academicYear: string;

  @Column({ name: 'day_type', type: 'enum', enum: CalendarDayType, default: CalendarDayType.REGULAR })
  dayType: CalendarDayType;

  @Column({ type: 'varchar', length: 255, nullable: true })
  title: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'start_time', type: 'time', nullable: true })
  startTime: string | null;

  @Column({ name: 'end_time', type: 'time', nullable: true })
  endTime: string | null;

  @Column({ name: 'is_attendance_expected', type: 'boolean', default: true })
  isAttendanceExpected: boolean;

  @Column({ name: 'source', type: 'enum', enum: CalendarDaySource, default: CalendarDaySource.AUTO_GENERATED })
  source: CalendarDaySource;

  @Column({ name: 'created_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  updatedAt: Date;

  @Column({ name: 'created_by', type: 'bigint', nullable: true })
  createdBy: string | null;

  // Relations
  @OneToMany(() => InstituteCalendarEventEntity, event => event.calendarDay)
  events: InstituteCalendarEventEntity[];

  @OneToMany(() => InstituteClassCalendarEntity, override => override.calendarDay)
  classOverrides: InstituteClassCalendarEntity[];
}
```

### 3. InstituteCalendarEventEntity

```typescript
export enum CalendarEventType {
  REGULAR_CLASS = 'REGULAR_CLASS',
  EXAM = 'EXAM',
  PARENTS_MEETING = 'PARENTS_MEETING',
  PRIZE_GIVING = 'PRIZE_GIVING',
  SPORTS_DAY = 'SPORTS_DAY',
  CULTURAL_EVENT = 'CULTURAL_EVENT',
  FIELD_TRIP = 'FIELD_TRIP',
  WORKSHOP = 'WORKSHOP',
  ORIENTATION = 'ORIENTATION',
  OPEN_DAY = 'OPEN_DAY',
  RELIGIOUS_EVENT = 'RELIGIOUS_EVENT',
  EXTRACURRICULAR = 'EXTRACURRICULAR',
  STAFF_MEETING = 'STAFF_MEETING',
  TRAINING = 'TRAINING',
  GRADUATION = 'GRADUATION',
  ADMISSION = 'ADMISSION',
  MAINTENANCE = 'MAINTENANCE',
  CUSTOM = 'CUSTOM',
}

export enum CalendarEventStatus {
  SCHEDULED = 'SCHEDULED',
  ONGOING = 'ONGOING',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  POSTPONED = 'POSTPONED',
}

export enum CalendarEventScope {
  INSTITUTE = 'INSTITUTE',
  CLASS = 'CLASS',
  SUBJECT = 'SUBJECT',
}

export enum AttendanceOpenTo {
  TARGET_ONLY = 'TARGET_ONLY',   // Soft label: expected user types only (never enforced)
  ALL_ENROLLED = 'ALL_ENROLLED', // Soft label: all enrolled users (never enforced)
  ANYONE = 'ANYONE',             // Default: anyone can mark attendance
}

@Entity('institute_calendar_events')
export class InstituteCalendarEventEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'institute_id', type: 'bigint' })
  instituteId: string;

  @ManyToOne(() => InstituteEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'institute_id' })
  institute: InstituteEntity;

  @Column({ name: 'calendar_day_id', type: 'bigint', nullable: true })
  calendarDayId: string | null;

  @ManyToOne(() => InstituteCalendarDayEntity, day => day.events, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'calendar_day_id' })
  calendarDay: InstituteCalendarDayEntity;

  @Column({ name: 'event_type', type: 'enum', enum: CalendarEventType })
  eventType: CalendarEventType;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'event_date', type: 'date' })
  eventDate: Date;

  @Column({ name: 'start_time', type: 'time', nullable: true })
  startTime: string | null;

  @Column({ name: 'end_time', type: 'time', nullable: true })
  endTime: string | null;

  @Column({ name: 'is_all_day', type: 'boolean', default: false })
  isAllDay: boolean;

  @Column({ name: 'is_attendance_tracked', type: 'boolean', default: false })
  isAttendanceTracked: boolean;

  @Column({ name: 'is_default', type: 'boolean', default: false,
    comment: 'Default event for this day. Only ONE per calendar_day. Attendance without explicit event_id goes here.' })
  isDefault: boolean;

  @Column({ name: 'target_user_types', type: 'json', nullable: true,
    comment: 'Reporting only — who is EXPECTED. Never enforced at marking time.' })
  targetUserTypes: string[] | null;

  @Column({ name: 'attendance_open_to', type: 'enum', enum: AttendanceOpenTo, default: AttendanceOpenTo.ANYONE,
    comment: 'Soft label. ANYONE = no restrictions. Never blocks attendance marking.' })
  attendanceOpenTo: AttendanceOpenTo;

  @Column({ name: 'target_scope', type: 'enum', enum: CalendarEventScope, default: CalendarEventScope.INSTITUTE })
  targetScope: CalendarEventScope;

  @Column({ name: 'target_class_ids', type: 'json', nullable: true })
  targetClassIds: string[] | null;

  @Column({ name: 'target_subject_ids', type: 'json', nullable: true })
  targetSubjectIds: string[] | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  venue: string | null;

  @Column({ name: 'meeting_link', type: 'text', nullable: true })
  meetingLink: string | null;

  @Column({ type: 'enum', enum: CalendarEventStatus, default: CalendarEventStatus.SCHEDULED })
  status: CalendarEventStatus;

  @Column({ name: 'max_participants', type: 'int', nullable: true })
  maxParticipants: number | null;

  @Column({ name: 'is_mandatory', type: 'boolean', default: false })
  isMandatory: boolean;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'created_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  updatedAt: Date;

  @Column({ name: 'created_by', type: 'bigint', nullable: true })
  createdBy: string | null;
}
```

### 4. InstituteClassCalendarEntity

```typescript
export enum ClassDayType {
  REGULAR = 'REGULAR',
  CLASS_HOLIDAY = 'CLASS_HOLIDAY',
  FIELD_TRIP = 'FIELD_TRIP',
  EXAM_DAY = 'EXAM_DAY',
  EXTRA_CLASS = 'EXTRA_CLASS',
  CANCELLED = 'CANCELLED',
  MERGED = 'MERGED',
  CUSTOM = 'CUSTOM',
}

@Entity('institute_class_calendar')
@Unique(['instituteId', 'classId', 'calendarDate'])
export class InstituteClassCalendarEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'institute_id', type: 'bigint' })
  instituteId: string;

  @ManyToOne(() => InstituteEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'institute_id' })
  institute: InstituteEntity;

  @Column({ name: 'class_id', type: 'bigint' })
  classId: string;

  @ManyToOne(() => InstituteClassEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'class_id' })
  class: InstituteClassEntity;

  @Column({ name: 'calendar_day_id', type: 'bigint' })
  calendarDayId: string;

  @ManyToOne(() => InstituteCalendarDayEntity, day => day.classOverrides, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'calendar_day_id' })
  calendarDay: InstituteCalendarDayEntity;

  @Column({ name: 'calendar_date', type: 'date', comment: 'Denormalized for query performance' })
  calendarDate: Date;

  @Column({ name: 'class_day_type', type: 'enum', enum: ClassDayType })
  classDayType: ClassDayType;

  @Column({ type: 'varchar', length: 255, nullable: true })
  title: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'is_attendance_expected', type: 'boolean', default: true })
  isAttendanceExpected: boolean;

  @Column({ name: 'merged_with_class_id', type: 'bigint', nullable: true })
  mergedWithClassId: string | null;

  @Column({ name: 'substitute_teacher_id', type: 'bigint', nullable: true })
  substituteTeacherId: string | null;

  @Column({ name: 'created_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  updatedAt: Date;

  @Column({ name: 'created_by', type: 'bigint', nullable: true })
  createdBy: string | null;
}
```

---

## API Endpoints Design

### Calendar Management

```
# Operating Config (weekly template)
POST   /api/institutes/:instituteId/calendar/operating-config     Set weekly operating config
GET    /api/institutes/:instituteId/calendar/operating-config     Get current config
PUT    /api/institutes/:instituteId/calendar/operating-config/:id Update a day's config

# Calendar Generation
POST   /api/institutes/:instituteId/calendar/generate             Auto-generate year calendar
POST   /api/institutes/:instituteId/calendar/import-holidays      Bulk import public holidays

# Calendar Days CRUD
GET    /api/institutes/:instituteId/calendar/days                 List days (with filters)
GET    /api/institutes/:instituteId/calendar/days/:id             Get single day details
PUT    /api/institutes/:instituteId/calendar/days/:id             Update day type/details
PATCH  /api/institutes/:instituteId/calendar/days/bulk            Bulk update (e.g., mark term break)

# Calendar Events CRUD  
POST   /api/institutes/:instituteId/calendar/events               Create event
GET    /api/institutes/:instituteId/calendar/events                List events (with date range, type filters)
GET    /api/institutes/:instituteId/calendar/events/:id            Get event details
PUT    /api/institutes/:instituteId/calendar/events/:id            Update event
DELETE /api/institutes/:instituteId/calendar/events/:id            Cancel/delete event

# Class Calendar Overrides
POST   /api/institutes/:instituteId/classes/:classId/calendar     Add class override
GET    /api/institutes/:instituteId/classes/:classId/calendar     Get class calendar (merged view)
PUT    /api/institutes/:instituteId/classes/:classId/calendar/:id Update override
DELETE /api/institutes/:instituteId/classes/:classId/calendar/:id Remove override

# Reporting
GET    /api/institutes/:instituteId/calendar/report/year-summary  Year overview stats
GET    /api/institutes/:instituteId/calendar/report/daily         Per-day breakdown with attendance
GET    /api/institutes/:instituteId/calendar/report/unmarked-days Days where attendance wasn't marked
GET    /api/institutes/:instituteId/calendar/report/student/:userId  Per-student year report
GET    /api/institutes/:instituteId/calendar/report/event/:eventId   Event attendance report
```

### Calendar Day Filters

```
GET /api/institutes/:instituteId/calendar/days
  ?academicYear=2025
  &month=3                          // Optional: specific month
  &dayType=REGULAR,SPECIAL_EVENT    // Optional: filter by type
  &startDate=2025-03-01             // Optional: date range
  &endDate=2025-03-31
  &isAttendanceExpected=true        // Optional: only attendance-expected days
```

---

## Data Flow Summary

```
┌──────────────────────────────────────────────────────────────────────┐
│                        SETUP FLOW (Once per year)                    │
│                                                                      │
│  Admin sets operating_config → Admin triggers calendar generate      │
│  → 365 calendar_days created → REGULAR_CLASS events auto-created    │
│  → Admin marks public holidays → Admin marks term breaks            │
│  → Admin adds special events (prize giving, sports day, etc.)       │
│  → Teachers add class overrides (field trips, cancelled classes)    │
└──────────────────────────────────┬───────────────────────────────────┘
                                   │
┌──────────────────────────────────▼───────────────────────────────────┐
│                      DAILY FLOW (Every school day)                   │
│                                                                      │
│  Teacher opens attendance → System looks up today's calendar_day    │
│  → If WEEKEND/HOLIDAY: warns "Today is {title}. Mark anyway?"      │
│  → If REGULAR: proceeds normally                                    │
│  → calendar_day_id + event_id attached to each attendance record    │
│  → Stored in DynamoDB with cdid/eid fields                         │
│  → Synced to MySQL attendance_records periodically                 │
└──────────────────────────────────┬───────────────────────────────────┘
                                   │
┌──────────────────────────────────▼───────────────────────────────────┐
│                      REPORTING FLOW (Anytime)                        │
│                                                                      │
│  calendar_days (expected) + attendance_records (actual)              │
│  + enrollment data (eligible) = COMPLETE PICTURE                    │
│                                                                      │
│  Expected = working_days × eligible_students                        │
│  Actual = present + absent + late records                           │
│  Unmarked = expected - actual (flag for admin attention)            │
│  Real Rate = (present + late) / expected × 100                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Scalability Considerations

### Data Volume Estimates

| Table | Rows per institute per year | 100 institutes | 1000 institutes |
|---|---|---|---|
| `institute_calendar_days` | ~365 | 36,500 | 365,000 |
| `institute_calendar_events` | ~250 (200 regular + 50 special) | 25,000 | 250,000 |
| `institute_class_calendar` | ~50 overrides avg | 5,000 | 50,000 |
| `institute_operating_config` | 7 (one per day-of-week) | 700 | 7,000 |

All very manageable sizes. With proper indexes, queries will be sub-millisecond.

### DynamoDB Impact

Adding `cdid` (calendar_day_id) to each attendance record:
- 1 extra attribute per record — negligible storage increase
- No new GSI needed — `cdid` is used for MySQL JOIN, not DynamoDB queries
- Calendar_day lookup is MySQL only (one query per attendance mark, cached)

### Calendar Day Caching

```typescript
// Cache today's calendar_day per institute (changes once per day at midnight)
@Injectable()
export class CalendarDayCache {
  private cache = new Map<string, { day: InstituteCalendarDayEntity; expiresAt: number }>();

  async getTodayCalendarDay(instituteId: string): Promise<InstituteCalendarDayEntity> {
    const key = `${instituteId}_${getCurrentSriLankaDate()}`;
    const cached = this.cache.get(key);
    
    if (cached && cached.expiresAt > Date.now()) {
      return cached.day;
    }
    
    // Fetch from DB, cache until midnight
    const day = await this.calendarDayRepo.findOne({ ... });
    const midnightExpiry = /* next midnight timestamp */;
    this.cache.set(key, { day, expiresAt: midnightExpiry });
    return day;
  }
}
```

### Multi-Year Scalability

- Each year's data is isolated by `academic_year` — queries never scan across years
- Old years can be archived: `CREATE TABLE institute_calendar_days_2024 LIKE institute_calendar_days`
- Calendar generation is idempotent — re-running won't duplicate rows (UNIQUE constraint protects)

---

## Implementation Priority

| Phase | Tables | Effort | Value |
|---|---|---|---|
| **Phase 1** | `institute_calendar_days` + `institute_operating_config` | 3–4 days | Core foundation — working day tracking |
| **Phase 2** | Lazy calendar_day creation in `markAttendance()` | 1 day | Backward compatible — no breaking changes |
| **Phase 3** | `institute_calendar_events` | 2–3 days | Event tracking (parents meetings, ceremonies) |
| **Phase 4** | `institute_class_calendar` | 2 days | Class-level override support |
| **Phase 5** | Year report APIs | 3–4 days | Full reporting with expected vs actual |
| **Phase 6** | MySQL `attendance_records` sync + reporting queries | 3–4 days | Permanent storage + analytics |

**Total estimate: ~15–18 days for complete implementation**

---

## Relationship to Existing Entities

```
institutes
  ├── institute_operating_config (7 rows per year — weekly template)
  ├── institute_calendar_days (365 rows per year — actual day status)
  │     ├── institute_calendar_events (N events per day)
  │     ├── institute_class_calendar (class overrides)
  │     └── attendance_records.calendar_day_id → FK (links attendance to day)
  ├── institute_classes
  │     ├── institute_class_students (enrollment — who SHOULD attend)
  │     ├── institute_class_subjects
  │     │     └── institute_class_subject_students (subject-level enrollment)
  │     └── institute_class_calendar (class-specific day overrides)
  └── institute_user (all users — type, status, enrollment date)
        └── attendance_records.user_id → FK (who DID attend)
```

This design integrates cleanly with ALL existing entities without modifying them.

---

## Addendum A: Event Attendance Rules — Soft Targeting, Not Hard Enforcement

### The Requirement

When creating an event, the admin selects `target_user_types` (e.g., `["STUDENT", "TEACHER"]`). However, this is **informational/reporting only** — it does NOT block attendance marking.

| Scenario | Should it block? | Why |
|---|---|---|
| Teacher marks attendance at a "Students Only" event | **NO** | Teacher was physically there, record it |
| Inactive user scans card at Sports Day | **NO** | They attended, capture the data |
| Non-enrolled person scans at Parents Meeting | **NO** | Parent of student from another class, still valid |
| Student marks attendance at Staff Meeting | **NO** | Maybe they were helping — record truthfully |

### How It Works

```
target_user_types on event = WHO WE EXPECT (for reporting denominators)
actual attendance records  = WHO ACTUALLY CAME (reality)
```

The `target_user_types` field controls:
- **Report eligibility denominator** — "120 students were expected, 98 came = 81.7%"
- **Calendar UI display** — show "Students & Teachers" badge on event
- **Notification targeting** — send reminders to expected user types only

It does NOT control:
- Who CAN mark attendance (anyone can)
- Validation at marking time (no blocking)
- Whether records are stored (always stored)

### Implementation In markAttendance

```typescript
// When marking attendance for an event:
// 1. Look up the event
const event = await this.calendarEventRepo.findOne({ where: { id: eventId } });

// 2. Check if user type matches target — LOG but DON'T BLOCK
if (event.targetUserTypes && !event.targetUserTypes.includes(detectedUserType)) {
  this.logger.info(
    `User ${userId} (type: ${detectedUserType}) marking attendance at event "${event.title}" ` +
    `which targets ${event.targetUserTypes.join(', ')}. Allowing anyway.`
  );
}

// 3. Store attendance with a mismatch flag for reporting
record.ut = detectedUserType;
record.eid = eventId;
record.targetMatch = event.targetUserTypes?.includes(detectedUserType) ?? true;
// ^ This "targetMatch" field is useful for reports:
//   "5 non-target users also attended this event"
```

### Report Impact

```sql
-- Event attendance report with target matching
SELECT 
  ce.title,
  ce.target_user_types,
  
  -- Expected attendees (matching target types)
  COUNT(DISTINCT CASE WHEN ar.target_match = TRUE THEN ar.user_id END) as target_attended,
  
  -- Unexpected attendees (non-target types who showed up anyway)
  COUNT(DISTINCT CASE WHEN ar.target_match = FALSE THEN ar.user_id END) as non_target_attended,
  
  -- Total actual attendance
  COUNT(DISTINCT ar.user_id) as total_attended

FROM institute_calendar_events ce
LEFT JOIN attendance_records ar ON ar.event_id = ce.id
WHERE ce.institute_id = ? AND ce.id = ?
GROUP BY ce.id;
```

---

## Addendum B: Multiple Events Per Day + Default Event

### The Requirement

A single calendar day can have MULTIPLE events. Example:

| Day | Events |
|---|---|
| 2025-06-15 (Regular) | Event 1: `REGULAR_CLASS` (default) — morning classes |
| | Event 2: `PARENTS_MEETING` (Grade 10) — 2pm–4pm |
| | Event 3: `EXTRACURRICULAR` (Science Club) — 4pm–5pm |

When a user marks attendance **without specifying an event_id**, it should go to the **default event** for that day.

### Schema Addition: `is_default` Column

```sql
ALTER TABLE institute_calendar_events 
  ADD COLUMN is_default BOOLEAN DEFAULT FALSE 
  COMMENT 'Only ONE event per calendar_day can be default. When attendance is marked without event_id, it goes to this event.';

-- Ensure only one default per day
-- Enforced in application layer (not DB constraint, because MySQL doesn't support conditional unique)
```

**Updated `InstituteCalendarEventEntity`:**
```typescript
@Column({ name: 'is_default', type: 'boolean', default: false, 
  comment: 'Default event for this day. Attendance without explicit event_id goes here.' })
isDefault: boolean;
```

### Auto-Generated Default Events

When calendar days are generated, each `REGULAR` day gets a `REGULAR_CLASS` event with `is_default = true`:

```
institute_calendar_days:  { id: 1001, date: 2025-01-06, day_type: REGULAR }
                              │
                              ▼
institute_calendar_events: { id: 5001, calendar_day_id: 1001, event_type: REGULAR_CLASS, 
                             title: "Regular Classes", is_default: TRUE, 
                             is_attendance_tracked: TRUE, target_user_types: NULL }
```

When a special event is added later (e.g., Parents Meeting at 2pm), it's added as a NON-default:

```
institute_calendar_events: { id: 5002, calendar_day_id: 1001, event_type: PARENTS_MEETING, 
                             title: "Grade 10 Parents Meeting", is_default: FALSE,
                             is_attendance_tracked: TRUE, target_user_types: ["PARENT","TEACHER"],
                             start_time: "14:00", end_time: "16:00" }
```

### Attendance Marking With Events

```
SCENARIO 1: Teacher marks normal morning attendance (no event_id in request)
  → System looks up default event for today → REGULAR_CLASS (id: 5001)
  → Stores: { cdid: "1001", eid: "5001", ... }

SCENARIO 2: Admin marks attendance at Parents Meeting (event_id: 5002 in request)
  → Stores: { cdid: "1001", eid: "5002", ... }

SCENARIO 3: Both events on same day → student has TWO attendance records for the day
  → Record 1: { cdid: "1001", eid: "5001", status: PRESENT, time: 07:45 }  -- morning class
  → Record 2: { cdid: "1001", eid: "5002", status: PRESENT, time: 14:10 }  -- parents meeting
```

### Querying Day Events

```typescript
// Get all events for a specific day
const events = await this.calendarEventRepo.find({
  where: { calendarDayId: calendarDay.id },
  order: { isDefault: 'DESC', startTime: 'ASC' }  // Default first, then by time
});

// Response: frontend shows event picker with default pre-selected
// [
//   { id: 5001, title: "Regular Classes", isDefault: true },   ← pre-selected
//   { id: 5002, title: "Grade 10 Parents Meeting", isDefault: false },
//   { id: 5003, title: "Science Club", isDefault: false }
// ]
```

### Validation: Only One Default Per Day

```typescript
async createEvent(dto: CreateCalendarEventDto): Promise<InstituteCalendarEventEntity> {
  // If this event is marked as default, unset any existing default for same day
  if (dto.isDefault) {
    await this.calendarEventRepo.update(
      { calendarDayId: dto.calendarDayId, isDefault: true },
      { isDefault: false }
    );
  }
  
  // If no events exist for this day yet, auto-set as default
  const existingCount = await this.calendarEventRepo.count({
    where: { calendarDayId: dto.calendarDayId }
  });
  if (existingCount === 0) {
    dto.isDefault = true;
  }
  
  return this.calendarEventRepo.save(dto);
}
```

---

## Addendum C: Performance Analysis — 1 Million Active Users

### Assumptions

| Parameter | Value |
|---|---|
| Active users | 1,000,000 |
| Attendance marks per user per day | 1 (minimum) — some mark 2–3 for different events |
| Total daily writes | ~1,200,000 (accounting for bulk and multi-event) |
| Peak marking window | 2 hours (7am–9am Sri Lanka time) |
| Number of institutes | ~2,000 (avg 500 users/institute) |
| DynamoDB region | `ap-south-1` (Mumbai — closest to Sri Lanka) |

### Current Attendance Marking Latency Breakdown

Each `markAttendance()` call currently executes:

| Step | Operation | Type | Latency |
|---|---|---|---|
| 1 | `detectInstituteUserType()` | MySQL SELECT (institute_user) | ~5ms |
| 2 | `validateUserEnrollment()` | MySQL SELECT (institute_user) — can be skipped | ~5ms |
| 3a | `fetchStudentWithParentData()` (students) | MySQL SELECT with 7 JOINs | ~15ms |
| 3b | `userRepository.findOne()` (non-students) | MySQL SELECT | ~5ms |
| 4 | **NEW: Calendar day lookup** | MySQL SELECT (institute_calendar_days) | ~3ms |
| 5 | `dynamoAttendanceService.markAttendance()` | DynamoDB PutItem | ~10ms |
| 6 | `resolveImageUrl()` | In-memory (no I/O) | ~0ms |
| 7 | Notifications (fire-and-forget) | Async — not blocking | 0ms |
| | **Total (student path)** | | **~38ms** |
| | **Total (non-student path)** | | **~23ms** |

### Calendar Day Lookup Cost

**With caching (recommended):** The calendar day for today changes once per day per institute. With an in-memory cache:

```
Cache key: "{instituteId}_{date}" → CalendarDayEntity
Cache TTL: Until midnight
Cache hit rate: ~99.9% (only 1 miss per institute per day)
Effective cost: ~0.01ms (memory lookup)
```

**Without caching:** ~3ms MySQL SELECT per call (indexed on `institute_id, calendar_date` — UNIQUE constraint = instant lookup).

**Net impact of adding calendar system to markAttendance(): +0.01ms (cached) or +3ms (uncached)**

### DynamoDB Write Capacity Analysis

**Record size calculation (V2 format):**

| Field | Size (bytes) |
|---|---|
| PK (`I#1234`) | ~8 |
| SK (`D#2025-03-15#S#56789#C#10#SU#NONE#1710500000000`) | ~55 |
| GSI_PK (`S#56789`) | ~9 |
| GSI_SK (`I#1234#D#2025-03-15#C#10#SU#NONE`) | ~40 |
| sid, dt, st, ts, v, ttl | ~50 |
| cid, suid, loc, meth, ut | ~40 |
| **NEW:** cdid, eid | ~15 |
| **Total** | **~217 bytes** → rounds to **1 WCU** (items ≤1KB = 1 WCU) |

Each write = **1 WCU** (Write Capacity Unit). Each write also creates 1 GSI write = **1 additional WCU**.

**Total WCUs per write = 2** (1 base table + 1 GSI).

### Peak Load Calculation

```
1,200,000 daily writes
Peak window: 2 hours (7am–9am) = 7,200 seconds
Assume 80% of writes happen in peak = 960,000 writes in 7,200 seconds
Peak WCU = 960,000 × 2 / 7,200 = 267 WCUs sustained

With burst: 
  In the busiest minute (8:00–8:01), maybe 5% of daily writes:
  = 60,000 × 2 / 60 = 2,000 WCUs for 1 minute
  DynamoDB On-Demand handles bursts up to 40,000 WCU — no problem.
```

### DynamoDB Cost Calculation (On-Demand Mode)

| Item | Calculation | Monthly Cost |
|---|---|---|
| **Writes** | 1.2M/day × 2 WCUs × 30 days = 72M WCUs/month | 72M × $1.25/million = **$90.00** |
| **Reads** (queries) | ~500K reads/day × 30 = 15M RCUs/month | 15M × $0.25/million = **$3.75** |
| **Storage** | 1.2M × 217 bytes × 365 days = ~92 GB/year | 92 GB × $0.25/GB = **$23.00/month** |
| **GSI Storage** | ~same as base = ~92 GB | **$23.00/month** |
| **Data Transfer** | Negligible within same region | **~$0** |
| | **TOTAL** | **~$140/month** |

**With TTL of 3 months (hot cache strategy):**

| Item | Calculation | Monthly Cost |
|---|---|---|
| **Storage** | 1.2M × 217 bytes × 90 days = ~23 GB | ~23 GB × $0.25 = **$5.75** |
| **GSI Storage** | ~23 GB | **$5.75** |
| | **TOTAL** | **~$105/month** |

### DynamoDB Cost (Provisioned Mode — Cheaper if Predictable)

If traffic is predictable, provisioned mode with auto-scaling is ~5× cheaper:

| Item | Calculation | Monthly Cost |
|---|---|---|
| **Base WCU** (sustained) | 300 WCUs × $0.00065/WCU/hr × 730 hrs | **$142.35** |
| **BUT with Reserved Capacity** (1-year) | 300 WCUs × ~60% discount | **~$57/month** |
| **Reads** | 100 RCUs | **~$9.50/month** |
| **Storage** (3-month TTL) | ~23 GB | **$5.75** |
| | **TOTAL (provisioned + reserved)** | **~$72/month** |

### MySQL Performance Impact

**Calendar day lookup:** ~3ms per attendance mark (eliminated by caching). For 1.2M marks in peak 2 hours:
- With cache: 2,000 unique lookups (1 per institute per day) → negligible
- Without cache: 1.2M × 3ms = 3,600 seconds of MySQL time → **must cache**

**MySQL attendance_records sync (for reporting):**
- DynamoDB Streams → Lambda → MySQL batch inserts
- 1.2M rows/day at ~200 bytes each = ~240 MB/day
- Batch INSERT (1000 rows at a time): 1,200 batches × ~50ms = ~60 seconds total
- MySQL storage: ~240 MB/day × 365 = ~87 GB/year → trivial for MySQL

### Comparison Table: Full Cost at Scale

| Component | 10K users | 100K users | 1M users |
|---|---|---|---|
| DynamoDB (On-Demand, 3mo TTL) | ~$2/mo | ~$12/mo | **~$105/mo** |
| DynamoDB (Provisioned+Reserved) | ~$5/mo | ~$15/mo | **~$72/mo** |
| MySQL (Cloud SQL) | Already running | Already running | Already running |
| Calendar tables MySQL | ~0.1 GB | ~1 GB | ~10 GB |
| Attendance MySQL (permanent) | ~1 GB/yr | ~10 GB/yr | **~87 GB/yr** |
| Lambda (DynamoDB Streams) | ~$0.50/mo | ~$5/mo | **~$30/mo** |
| **Total Monthly** | **~$8** | **~$32** | **~$207** |

### Latency Summary at 1M Scale

| Operation | Current (no calendar) | With Calendar (cached) | With Calendar (uncached) |
|---|---|---|---|
| markAttendance (student) | ~35ms | **~35ms** (+0.01ms cache) | ~38ms (+3ms MySQL) |
| markAttendance (non-student) | ~20ms | **~20ms** (+0.01ms cache) | ~23ms (+3ms MySQL) |
| markBulkAttendance (25 users) | ~80ms | **~80ms** (+1 cache lookup) | ~83ms |
| markAttendanceByCard (RFID) | ~45ms | **~45ms** (+0.01ms) | ~48ms |
| getStudentAttendance | ~30ms | ~30ms (no change) | ~30ms |
| getAttendanceSummary | ~50ms | ~50ms (no change) | ~50ms |

**Verdict: Adding the calendar system adds effectively ZERO latency to attendance marking** when cached. Even uncached, it's a 3ms increase on a ~35ms operation — imperceptible to users.

### Hot Partition Analysis

DynamoDB partitions by PK. With PK = `I#{instituteId}`:
- Largest institute: ~5,000 users → 5,000 writes in peak 2hrs = ~1.4 WCU → no hot partition
- Even 50,000 users in one institute = 14 WCU → far below DynamoDB's 1,000 WCU/partition limit

**No partition key sharding needed at 1M users.**

### When Would You Need to Shard?

| Scale | Writes/sec (peak) | Action needed |
|---|---|---|
| 1M users | ~267 WCU | On-Demand, no sharding |
| 5M users | ~1,335 WCU | On-Demand still fine |
| 10M users | ~2,670 WCU | On-Demand still fine |
| 50M users | ~13,350 WCU | Consider provisioned + auto-scaling |
| 100M users | ~26,700 WCU | Add PK sharding: `I#{id}#S#{shard}` |

**The system comfortably handles 10M+ users without any architectural changes.**

### Storage Growth Projection

| Year | DynamoDB (3mo TTL) | MySQL (permanent) | Total |
|---|---|---|---|
| Year 1 | ~23 GB | ~87 GB | ~110 GB |
| Year 2 | ~23 GB (same, TTL) | ~174 GB | ~197 GB |
| Year 3 | ~23 GB | ~261 GB | ~284 GB |
| Year 5 | ~23 GB | ~435 GB | ~458 GB |
| Year 7 | ~23 GB | ~609 GB | ~632 GB |

MySQL at 600 GB after 7 years is easily manageable. Can partition by `academic_year` for older data.

### Recommendations

1. **Use DynamoDB On-Demand** until you hit $200/month, then evaluate provisioned + reserved
2. **Cache calendar_day lookups** — in-memory Map with midnight expiry (zero-dependency, no Redis needed)
3. **DynamoDB TTL = 3 months** — keeps hot cache small, MySQL is permanent store
4. **Batch the MySQL sync** — DynamoDB Streams + Lambda + batch INSERT (not row-by-row)
5. **No PK sharding needed** until 50M+ users — the current `I#{instituteId}` partitioning is perfect
