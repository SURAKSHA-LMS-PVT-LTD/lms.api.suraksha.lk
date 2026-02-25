# User Frontend Implementation Guide — Part 1

## Attendance Marking, Student Dashboard & Calendar Views

> **For:** Frontend developers building the user-facing attendance & calendar UI  
> **Backend:** NestJS + DynamoDB + MySQL | **Timezone:** Asia/Colombo (UTC+5:30)  
> **Auth:** JWT Bearer token in `Authorization` header for all API calls  
> **Base URL:** `/api/attendance` (attendance) | `/institutes/:instituteId/calendar` (calendar)

---

## Table of Contents

1. [System Overview — What Changed (Before vs After)](#1-system-overview)
2. [Step 1: Authentication & Role Detection](#step-1)
3. [Step 2: Today's Dashboard — Calendar Day + Quick Attendance](#step-2)
4. [Step 3: Mark Single Attendance (QR / Manual / Card)](#step-3)
5. [Step 4: Mark Bulk Attendance (Classroom Roll Call)](#step-4)
6. [Step 5: Student Attendance History Page](#step-5)
7. [Step 6: Calendar Month View](#step-6)
8. [Appendix A: All Enum Values](#appendix-a)
9. [Appendix B: Error Handling Guide](#appendix-b)

---

## 1. System Overview — What Changed (Before vs After) <a name="1-system-overview"></a>

### Before (Old System)

```
┌──────────────┐       ┌───────────────┐
│   Frontend    │──────▶│  DynamoDB     │
│  Mark / View  │       │  (flat keys)  │
└──────────────┘       └───────────────┘

- Attendance was only "date + student + institute"
- No concept of calendar days, events, or day types
- No way to know if today is a holiday, exam day, or regular day
- Bulk attendance had no calendar linkage
- Student history query was BROKEN (empty instituteId)
- No filtering by day type, academic year, or attendance expectation
```

### After (Current System)

```
┌──────────────┐       ┌───────────────┐       ┌───────────────┐
│   Frontend    │──────▶│  NestJS API   │──────▶│  DynamoDB     │
│  Mark / View  │       │  (calendar-   │       │  (with event  │
│  + Calendar   │       │   aware)      │       │   + day IDs)  │
│  + Events     │       └───────┬───────┘       └───────────────┘
│  + Charts     │               │
└──────────────┘       ┌───────▼───────┐
                       │  MySQL        │
                       │  (calendar    │
                       │   days +      │
                       │   events)     │
                       └───────────────┘

- Every calendar day has a TYPE: REGULAR, WEEKEND, PUBLIC_HOLIDAY, HALF_DAY, etc.
- Each day can have MULTIPLE EVENTS: Regular Class + Parents Meeting + Sports Day
- Attendance records are now LINKED to calendar day ID + event ID
- New query endpoints: by event, by calendar day, by user type
- Calendar generation: auto-creates 365 days with holidays & term breaks
- Bulk attendance now correctly links to today's calendar day + default event
- Student history query WORKS (instituteId is required and passed correctly)
- Proper pagination on all queries (no more silent data truncation)
```

### What This Means for Frontend

| Feature | Before | After |
|---------|--------|-------|
| Mark attendance | Just date + student | Same API, backend auto-links to calendar day/event |
| View "today" info | Not available | `GET /calendar/today` — day type, events, operating hours |
| Calendar view | Not available | `GET /calendar/days` with filters + pagination |
| Event attendance | Not available | `GET /calendar/event/:eventId` — who attended an exam, meeting, etc. |
| Student history | **Broken** (empty instituteId) | **Fixed** — requires `instituteId` query param |
| Bulk marking | No calendar link | Auto-links to today's calendar day + default event |
| Day type info | Not available | Each day has dayType, isAttendanceExpected, title |

---

## Step 1: Authentication & Role Detection <a name="step-1"></a>

### 1.1 What Happens Behind the Scenes

Every API call requires a JWT token. The backend's `FlexibleAccessGuard` reads the token and checks:
- **Global role** (SUPERADMIN) — can access everything
- **Institute role** (INSTITUTE_ADMIN, TEACHER, ATTENDANCE_MARKER, STUDENT, PARENT) — scoped to specific institute
- **Class/Subject role** — teachers may be restricted to their own classes

The frontend should store the decoded JWT to know which role the user has, then show/hide UI accordingly.

### 1.2 Role-Based UI Visibility

| UI Element | SUPERADMIN | INST_ADMIN | TEACHER | ATT_MARKER | STUDENT | PARENT |
|------------|:----------:|:----------:|:-------:|:----------:|:-------:|:------:|
| Mark attendance (single) | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Mark attendance (bulk) | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| View own attendance | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| View child's attendance | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| View class attendance | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Calendar day view | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Event details | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Calendar management | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |

### 1.3 Implementation

```typescript
// Store after login
interface UserSession {
  token: string;
  userId: string;
  globalRole: 'SUPER_ADMIN' | 'USER' | 'USER_WITHOUT_PARENT' | 'USER_WITHOUT_STUDENT';
  institutes: Array<{
    instituteId: string;
    instituteName: string;
    roles: string[];  // ['TEACHER', 'INSTITUTE_ADMIN', etc.]
    classes?: Array<{ classId: string; className: string }>;
    subjects?: Array<{ subjectId: string; subjectName: string }>;
  }>;
}

// Helper to check permissions
function canMarkAttendance(session: UserSession, instituteId: string): boolean {
  if (session.globalRole === 'SUPER_ADMIN') return true;
  const inst = session.institutes.find(i => i.instituteId === instituteId);
  if (!inst) return false;
  return inst.roles.some(r => ['INSTITUTE_ADMIN', 'TEACHER', 'ATTENDANCE_MARKER'].includes(r));
}

// API helper with auth header
async function apiCall(method: string, url: string, body?: any) {
  const res = await fetch(url, {
    method,
    headers: {
      'Authorization': `Bearer ${session.token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  
  const data = await res.json();
  
  if (!data.success) {
    // Handle specific error codes
    if (res.status === 401) redirectToLogin();
    if (res.status === 403) showToast('You do not have permission for this action');
    if (res.status === 404) showToast(data.message || 'Not found');
    if (res.status === 409) showToast(data.message || 'Conflict — resource already exists');
    throw new Error(data.message);
  }
  
  return data;
}
```

---

## Step 2: Today's Dashboard — Calendar Day + Quick Attendance <a name="step-2"></a>

### 2.1 What This Screen Shows

This is the **main landing page** after login. It shows:
- Today's date and day type (REGULAR / HOLIDAY / WEEKEND / EXAM_DAY / etc.)
- Whether attendance is expected today
- List of today's events (Regular Class, any special events)
- Quick action buttons for marking attendance

### 2.2 API Call — Get Today's Calendar Day

```
GET /institutes/{instituteId}/calendar/today
Authorization: Bearer {token}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "4521",
    "instituteId": "101",
    "calendarDate": "2026-02-25",
    "academicYear": "2026",
    "dayType": "REGULAR",
    "title": null,
    "description": null,
    "startTime": "08:00:00",
    "endTime": "15:00:00",
    "isAttendanceExpected": true,
    "source": "AUTO_GENERATED",
    "events": [
      {
        "id": "8901",
        "eventType": "REGULAR_CLASS",
        "title": "Regular Class Day",
        "eventDate": "2026-02-25",
        "startTime": "08:00:00",
        "endTime": "15:00:00",
        "isAllDay": false,
        "isAttendanceTracked": true,
        "isDefault": true,
        "status": "SCHEDULED",
        "isMandatory": true
      }
    ],
    "defaultEventId": "8901"
  }
}
```

**If no calendar exists (not generated yet):**
```json
{
  "success": false,
  "message": "No calendar day found for today. Calendar may need to be generated.",
  "data": null
}
```

### 2.3 Suggested UI — Today's Dashboard

```
┌─────────────────────────────────────────────────────────────┐
│  📅 Today — Wednesday, February 25, 2026                    │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Day Type: 🟢 REGULAR                               │    │
│  │  Operating Hours: 08:00 — 15:00                     │    │
│  │  Attendance Expected: ✅ Yes                         │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  Today's Events:                                            │
│  ┌─────────────────────────────────────┐                    │
│  │ 📖 Regular Class Day                │  ⭐ Default       │
│  │    08:00 — 15:00 | Mandatory        │                    │
│  │    Status: SCHEDULED                │                    │
│  │    [View Attendance] [Mark Now]     │                    │
│  └─────────────────────────────────────┘                    │
│                                                             │
│  Quick Actions:                                             │
│  [📱 Scan QR]  [📋 Bulk Mark]  [🔍 Search Student]         │
│                                                             │
│  ─── Today's Summary ────────────────────────────────────   │
│  Present: 142  │  Absent: 23  │  Late: 8  │  Total: 173    │
│  ████████████████████░░░░░░ 82.1% attendance rate           │
└─────────────────────────────────────────────────────────────┘
```

### 2.4 Day Type Color Coding (Use Throughout All Calendar Views)

| Day Type | Color | Icon | Meaning |
|----------|-------|------|---------|
| `REGULAR` | 🟢 Green | 📖 | Normal working day, attendance expected |
| `WEEKEND` | 🔵 Blue | 🏖️ | Saturday/Sunday, no attendance |
| `PUBLIC_HOLIDAY` | 🔴 Red | 🎌 | Government/national holiday |
| `INSTITUTE_HOLIDAY` | 🟠 Orange | 🏫 | Institute-specific holiday |
| `HALF_DAY` | 🟡 Yellow | ⏰ | Short day, attendance expected |
| `EXAM_DAY` | 🟣 Purple | 📝 | Exam day, attendance expected |
| `STAFF_ONLY` | ⚪ Gray | 👨‍🏫 | Only staff expected |
| `SPECIAL_EVENT` | 🩵 Cyan | 🎪 | Sports day, cultural event, etc. |
| `CANCELLED` | ⚫ Dark | ❌ | Day cancelled (emergency, weather) |

### 2.5 Implementation Code

```typescript
// types.ts
interface CalendarDay {
  id: string;
  instituteId: string;
  calendarDate: string;      // "2026-02-25"
  academicYear: string;
  dayType: 'REGULAR' | 'WEEKEND' | 'PUBLIC_HOLIDAY' | 'INSTITUTE_HOLIDAY' | 
           'HALF_DAY' | 'EXAM_DAY' | 'STAFF_ONLY' | 'SPECIAL_EVENT' | 'CANCELLED';
  title: string | null;
  startTime: string | null;  // "08:00:00"
  endTime: string | null;    // "15:00:00"
  isAttendanceExpected: boolean;
  source: 'AUTO_GENERATED' | 'MANUAL' | 'BULK_IMPORT';
  events: CalendarEvent[];
  defaultEventId: string | null;
}

interface CalendarEvent {
  id: string;
  eventType: string;         // See CalendarEventType enum below
  title: string;
  description: string | null;
  eventDate: string;
  startTime: string | null;
  endTime: string | null;
  isAllDay: boolean;
  isAttendanceTracked: boolean;
  isDefault: boolean;
  status: 'SCHEDULED' | 'ONGOING' | 'COMPLETED' | 'CANCELLED' | 'POSTPONED';
  isMandatory: boolean;
  targetUserTypes: string[] | null;
  attendanceOpenTo: 'TARGET_ONLY' | 'ALL_ENROLLED' | 'ANYONE';
  targetScope: 'INSTITUTE' | 'CLASS' | 'SUBJECT';
  venue: string | null;
  meetingLink: string | null;
  maxParticipants: number | null;
}

// TodayDashboard.tsx (React example)
function TodayDashboard({ instituteId }: { instituteId: string }) {
  const [today, setToday] = useState<CalendarDay | null>(null);
  const [loading, setLoading] = useState(true);
  const [noCalendar, setNoCalendar] = useState(false);

  useEffect(() => {
    fetchToday();
  }, [instituteId]);

  async function fetchToday() {
    setLoading(true);
    try {
      const res = await apiCall('GET', `/institutes/${instituteId}/calendar/today`);
      if (res.data) {
        setToday(res.data);
        setNoCalendar(false);
      } else {
        setNoCalendar(true);
      }
    } catch (err) {
      setNoCalendar(true);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <Spinner />;
  
  if (noCalendar) {
    return (
      <Alert type="warning">
        No calendar has been generated for this institute yet. 
        Contact your institute admin to generate the academic calendar.
      </Alert>
    );
  }

  const dayColor = DAY_TYPE_COLORS[today.dayType]; // Map from table above
  const defaultEvent = today.events.find(e => e.isDefault);

  return (
    <div>
      <DayTypeCard 
        date={today.calendarDate} 
        dayType={today.dayType}
        title={today.title}
        startTime={today.startTime}
        endTime={today.endTime}
        isAttendanceExpected={today.isAttendanceExpected}
        color={dayColor}
      />
      
      <EventList events={today.events} defaultEventId={today.defaultEventId} />
      
      {today.isAttendanceExpected && canMarkAttendance(session, instituteId) && (
        <QuickActions instituteId={instituteId} />
      )}
      
      {today.isAttendanceExpected && (
        <TodaySummaryChart instituteId={instituteId} date={today.calendarDate} />
      )}
    </div>
  );
}
```

---

## Step 3: Mark Single Attendance (QR / Manual / Card) <a name="step-3"></a>

### 3.1 What Happens Behind the Scenes

When you mark attendance:
1. Frontend sends `studentId`, `instituteId`, `date`, `status` to `POST /api/attendance/mark`
2. Backend auto-resolves: student name, user type (STUDENT/TEACHER/PARENT), today's calendar day, default event
3. Backend writes to DynamoDB with calendar linkage: `calendarDayId` + `eventId`
4. Backend sends push notification to student's device
5. Returns `attendanceId` for the new record

**You do NOT need to send:** `userType`, `calendarDayId`, `eventId` — the backend handles all of these automatically.

### 3.2 API Call — Mark Single Attendance

```
POST /api/attendance/mark
Authorization: Bearer {token}
Content-Type: application/json

{
  "studentId": "456",
  "instituteId": "101",
  "instituteName": "Suraksha Learning Academy",
  "date": "2026-02-25",
  "status": "present",
  "markingMethod": "qr",
  "classId": "201",
  "className": "Grade 10A",
  "subjectId": "301",
  "subjectName": "Mathematics"
}
```

**Minimal request (only required fields):**
```json
{
  "studentId": "456",
  "instituteId": "101",
  "instituteName": "Suraksha Learning Academy",
  "date": "2026-02-25",
  "status": "present"
}
```

**Success response (201):**
```json
{
  "success": true,
  "message": "Attendance marked successfully",
  "attendanceId": "att_2026-02-25_456_101_1740468600000"
}
```

### 3.3 Mark by Card ID (RFID/NFC)

If your institute uses RFID/NFC cards:

```
POST /api/attendance/mark-by-institute-card
Authorization: Bearer {token}

{
  "instituteCardId": "CARD001",
  "instituteId": "101",
  "instituteName": "Suraksha Learning Academy",
  "address": "Main Hall",
  "markingMethod": "rfid/nfc",
  "status": "present"
}
```

**Response includes student info (auto-resolved from card):**
```json
{
  "success": true,
  "data": {
    "studentId": "456",
    "studentName": "Kasun Perera",
    "instituteCardId": "CARD001",
    "imageUrl": "https://storage.googleapis.com/...",
    "isInstituteImage": true,
    "imageVerificationStatus": "VERIFIED",
    "status": "PRESENT",
    "markedAt": "2026-02-25T10:30:00.000Z"
  }
}
```

### 3.4 Suggested UI — Attendance Marking Screen

```
┌─────────────────────────────────────────────────────────────┐
│  Mark Attendance                     📅 2026-02-25          │
│                                                             │
│  ┌── Marking Method ──────────────────────────────────┐     │
│  │  [📱 QR Code]  [💳 Card Scan]  [✏️ Manual]        │     │
│  └────────────────────────────────────────────────────┘     │
│                                                             │
│  ┌── QR Scanner Active ───────────────────────────────┐     │
│  │                                                    │     │
│  │        ┌─────────────┐                             │     │
│  │        │  📷 Camera  │                             │     │
│  │        │   Preview   │                             │     │
│  │        └─────────────┘                             │     │
│  │                                                    │     │
│  │  Scan student's QR code to mark attendance         │     │
│  └────────────────────────────────────────────────────┘     │
│                                                             │
│  ┌── Context ─────────────────────────────────────────┐     │
│  │  Institute: Suraksha Learning Academy               │     │
│  │  Class:     Grade 10A (optional)                    │     │
│  │  Subject:   Mathematics (optional)                  │     │
│  │  Status:    [Present ▼]                             │     │
│  └────────────────────────────────────────────────────┘     │
│                                                             │
│  ┌── Last Marked ─────────────────────────────────────┐     │
│  │  ✅ Kasun Perera — Present — 10:30 AM               │     │
│  │  ✅ Nimali Silva — Present — 10:29 AM               │     │
│  │  ⏰ Sahan Fernando — Late — 10:28 AM                │     │
│  └────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

### 3.5 Optional: Link Attendance to a Specific Event

By default, the backend links attendance to the day's **default event** (usually REGULAR_CLASS). To link to a specific event (like an exam or parents meeting):

```json
{
  "studentId": "456",
  "instituteId": "101",
  "instituteName": "Suraksha Learning Academy",
  "date": "2026-02-25",
  "status": "present",
  "eventId": "8905"  // 👈 Links to a specific Parents Meeting event
}
```

---

## Step 4: Mark Bulk Attendance (Classroom Roll Call) <a name="step-4"></a>

### 4.1 What Happens Behind the Scenes

1. Teacher opens bulk marking screen → selects class
2. Frontend fetches student list for that class (from your existing user/class API)
3. Teacher marks each student: present / absent / late
4. Frontend sends ONE API call with all students
5. Backend: resolves each student's name + user type, looks up today's calendar day, writes all to DynamoDB in a batch
6. Returns per-student success/failure results

### 4.2 API Call — Bulk Mark

```
POST /api/attendance/mark-bulk
Authorization: Bearer {token}

{
  "instituteId": "101",
  "instituteName": "Suraksha Learning Academy",
  "classId": "201",
  "className": "Grade 10A",
  "subjectId": "301",
  "subjectName": "Mathematics",
  "markingMethod": "manual",
  "location": "Classroom 5A",
  "students": [
    { "studentId": "456", "status": "present" },
    { "studentId": "457", "status": "present" },
    { "studentId": "458", "status": "absent", "remarks": "Sick leave" },
    { "studentId": "459", "status": "late", "remarks": "Arrived at 8:45" },
    { "studentId": "460", "status": "present" }
  ]
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "Bulk attendance processed",
  "summary": { "successful": 5, "failed": 0, "total": 5 },
  "results": [
    { "studentId": "456", "success": true, "attendanceId": "att_..." },
    { "studentId": "457", "success": true, "attendanceId": "att_..." },
    { "studentId": "458", "success": true, "attendanceId": "att_..." },
    { "studentId": "459", "success": true, "attendanceId": "att_..." },
    { "studentId": "460", "success": true, "attendanceId": "att_..." }
  ]
}
```

### 4.3 Suggested UI — Bulk Attendance

```
┌─────────────────────────────────────────────────────────────┐
│  📋 Bulk Attendance — Grade 10A — Mathematics               │
│  📅 2026-02-25 | 👨‍🏫 Mr. Bandara                           │
│                                                             │
│  Quick Actions: [✅ All Present] [❌ All Absent] [↩ Reset]  │
│                                                             │
│  ┌─────┬────────────────────┬──────────────┬────────────┐   │
│  │  #  │  Student Name      │  Status      │  Remarks   │   │
│  ├─────┼────────────────────┼──────────────┼────────────┤   │
│  │  1  │  Kasun Perera      │ [✅ Present] │            │   │
│  │  2  │  Nimali Silva      │ [✅ Present] │            │   │
│  │  3  │  Sahan Fernando    │ [❌ Absent]  │ [Sick...]  │   │
│  │  4  │  Amaya Jayasinghe  │ [⏰ Late]    │ [8:45..]   │   │
│  │  5  │  Dinesh Kumara     │ [✅ Present] │            │   │
│  │ ... │  ...               │              │            │   │
│  └─────┴────────────────────┴──────────────┴────────────┘   │
│                                                             │
│  Summary: 28 Present | 3 Absent | 2 Late | Total: 33       │
│                                                             │
│  ████████████████████████████░░░░░░ 84.8% present           │
│                                                             │
│                              [Submit Attendance]            │
└─────────────────────────────────────────────────────────────┘
```

### 4.4 Implementation Tips

```typescript
// State for bulk marking
interface BulkMarkState {
  instituteId: string;
  instituteName: string;
  classId: string;
  className: string;
  subjectId?: string;
  subjectName?: string;
  students: Array<{
    studentId: string;
    studentName: string;
    status: 'present' | 'absent' | 'late' | 'left' | 'left_early' | 'left_lately';
    remarks: string;
  }>;
}

// "All Present" button
function markAllPresent(state: BulkMarkState) {
  return {
    ...state,
    students: state.students.map(s => ({ ...s, status: 'present' as const }))
  };
}

// Submit
async function submitBulkAttendance(state: BulkMarkState) {
  const res = await apiCall('POST', '/api/attendance/mark-bulk', {
    instituteId: state.instituteId,
    instituteName: state.instituteName,
    classId: state.classId,
    className: state.className,
    subjectId: state.subjectId,
    subjectName: state.subjectName,
    markingMethod: 'manual',
    students: state.students.map(s => ({
      studentId: s.studentId,
      studentName: s.studentName,
      status: s.status,
      remarks: s.remarks || undefined,
    })),
  });

  // Check for partial failures
  const failed = res.results.filter(r => !r.success);
  if (failed.length > 0) {
    showToast(`${failed.length} students failed to mark. Retrying...`);
    // Auto-retry failed ones or show retry button
  }
  
  return res;
}
```

---

## Step 5: Student Attendance History Page <a name="step-5"></a>

### 5.1 What This Screen Shows

A paginated list of a student's attendance records with:
- Date range filter
- Status filter (present/absent/late)
- Summary statistics (attendance rate, counts)
- Timeline/list view

### 5.2 API Call — Get Student Attendance

**IMPORTANT:** The `instituteId` query parameter is **required**. This was previously broken (BUG-003) and is now fixed.

```
GET /api/attendance/student/{studentId}?instituteId=101&startDate=2026-01-01&endDate=2026-02-25&page=1&limit=20
Authorization: Bearer {token}
```

**Required query params:**

| Param | Type | Required | Note |
|-------|------|----------|------|
| `instituteId` | string | **YES** | Must match student's institute |
| `startDate` | YYYY-MM-DD | **YES** | Max 365-day range |
| `endDate` | YYYY-MM-DD | **YES** | |
| `page` | number | no | Default: 1 |
| `limit` | number | no | Default: 20, max: 100 |
| `status` | string | no | Filter: `present`, `absent`, `late`, etc. |

**Response:**
```json
{
  "success": true,
  "pagination": {
    "currentPage": 1,
    "totalPages": 3,
    "totalRecords": 45,
    "recordsPerPage": 20,
    "hasNextPage": true,
    "hasPrevPage": false
  },
  "data": [
    {
      "attendanceId": "att_2026-02-25_456_101_...",
      "studentId": "456",
      "studentName": "Kasun Perera",
      "instituteName": "Suraksha Learning Academy",
      "className": "Grade 10A",
      "subjectName": "Mathematics",
      "address": "Classroom 5A",
      "markedBy": "teacher_789",
      "markedAt": "2026-02-25T03:00:00.000Z",
      "markingMethod": "manual",
      "status": "present",
      "userType": "STUDENT"
    }
  ],
  "summary": {
    "totalPresent": 30,
    "totalAbsent": 5,
    "totalLate": 3,
    "totalLeft": 2,
    "totalLeftEarly": 1,
    "totalLeftLately": 1,
    "attendanceRate": 85.7
  }
}
```

### 5.3 Suggested UI — Student Attendance History

```
┌─────────────────────────────────────────────────────────────┐
│  📊 Attendance History — Kasun Perera                       │
│                                                             │
│  ┌── Filters ─────────────────────────────────────────┐     │
│  │  From: [2026-01-01]  To: [2026-02-25]              │     │
│  │  Status: [All ▼]                 [🔍 Search]       │     │
│  └────────────────────────────────────────────────────┘     │
│                                                             │
│  ┌── Summary Card ────────────────────────────────────┐     │
│  │                                                    │     │
│  │   ┌──────────┐  ┌──────────┐  ┌──────────┐        │     │
│  │   │ Present  │  │ Absent   │  │  Late    │        │     │
│  │   │   30     │  │    5     │  │    3     │        │     │
│  │   │  71.4%   │  │  11.9%   │  │   7.1%   │        │     │
│  │   └──────────┘  └──────────┘  └──────────┘        │     │
│  │                                                    │     │
│  │   Attendance Rate: ████████████████░░░░ 85.7%      │     │
│  │                                                    │     │
│  └────────────────────────────────────────────────────┘     │
│                                                             │
│  ┌── Suggested: Pie Chart or Donut Chart ─────────────┐     │
│  │  Show breakdown of Present / Absent / Late / Left  │     │
│  │  Use libraries like Chart.js, Recharts, or         │     │
│  │  ApexCharts.                                       │     │
│  │                                                    │     │
│  │  🟢 Present: 30 (71.4%)                            │     │
│  │  🔴 Absent:  5  (11.9%)                            │     │
│  │  🟡 Late:    3  (7.1%)                             │     │
│  │  🔵 Left:    2  (4.8%)                             │     │
│  │  🟣 Left Early: 1 (2.4%)                           │     │
│  │  ⚪ Left Lately: 1 (2.4%)                          │     │
│  └────────────────────────────────────────────────────┘     │
│                                                             │
│  ┌── Records ─────────────────────────────────────────┐     │
│  │  Feb 25  │ ✅ Present │ Mathematics │ 08:30 AM       │     │
│  │  Feb 24  │ ✅ Present │ Science     │ 08:25 AM       │     │
│  │  Feb 23  │ ❌ Absent  │ English     │ —               │     │
│  │  Feb 22  │ 🔵 Weekend │ —           │ —               │     │
│  │  Feb 21  │ ⏰ Late    │ Mathematics │ 09:15 AM       │     │
│  │  ...                                                │     │
│  └────────────────────────────────────────────────────┘     │
│                                                             │
│  Page 1 of 3  [ < Previous ]  [ Next > ]                    │
└─────────────────────────────────────────────────────────────┘
```

### 5.4 Chart Suggestions for Student History

**1. Donut/Pie Chart — Status Breakdown**
- Show the percentage of each attendance status
- Use colors from the status table below
- Library: Recharts `<PieChart>`, Chart.js `doughnut`, or ApexCharts `donut`

**2. Line/Bar Chart — Weekly/Monthly Trend**
- X-axis: Weeks or Months
- Y-axis: Attendance percentage
- Shows if the student's attendance is improving or declining
- Combine calendar days API data with attendance data for accurate "expected vs actual"

**3. Calendar Heatmap — GitHub-style**
- Each cell = one day
- Color intensity = attendance status
- At a glance, see patterns (always absent on Fridays, etc.)
- Library: `react-calendar-heatmap` or custom SVG grid

**Status Color Mapping for Charts:**

| Status | Color | Hex |
|--------|-------|-----|
| `present` | Green | `#22C55E` |
| `absent` | Red | `#EF4444` |
| `late` | Yellow/Amber | `#F59E0B` |
| `left` | Blue | `#3B82F6` |
| `left_early` | Purple | `#8B5CF6` |
| `left_lately` | Gray | `#6B7280` |

---

## Step 6: Calendar Month View <a name="step-6"></a>

### 6.1 API Call — Get Calendar Days for a Month

```
GET /institutes/{instituteId}/calendar/days?startDate=2026-02-01&endDate=2026-02-28&page=1&limit=400
Authorization: Bearer {token}
```

**Available filters:**

| Param | Type | Description |
|-------|------|-------------|
| `startDate` | YYYY-MM-DD | Start of date range |
| `endDate` | YYYY-MM-DD | End of date range |
| `academicYear` | string | Filter by year (e.g., "2026") |
| `dayType` | enum | Filter by day type (REGULAR, WEEKEND, etc.) |
| `isAttendanceExpected` | true/false | Only working days, or only holidays |
| `page` | number | Default: 1 |
| `limit` | number | Default: 400 (enough for a full year) |

**Response:**
```json
{
  "success": true,
  "count": 28,
  "total": 28,
  "data": [
    {
      "id": "4500",
      "calendarDate": "2026-02-01",
      "dayType": "REGULAR",
      "title": null,
      "isAttendanceExpected": true,
      "startTime": "08:00:00",
      "endTime": "15:00:00"
    },
    {
      "id": "4501",
      "calendarDate": "2026-02-02",
      "dayType": "REGULAR",
      "title": null,
      "isAttendanceExpected": true
    },
    {
      "id": "4506",
      "calendarDate": "2026-02-07",
      "dayType": "WEEKEND",
      "title": null,
      "isAttendanceExpected": false
    },
    {
      "id": "4514",
      "calendarDate": "2026-02-15",
      "dayType": "PUBLIC_HOLIDAY",
      "title": "National Day",
      "isAttendanceExpected": false
    }
  ]
}
```

### 6.2 Suggested UI — Calendar Month View

```
┌─────────────────────────────────────────────────────────────┐
│  📅 Institute Calendar — February 2026                      │
│  [< Jan]                                      [Mar >]       │
│                                                             │
│  Legend: 🟢 Regular  🔵 Weekend  🔴 Holiday  🟡 Half Day   │
│          🟣 Exam     ⚪ Staff Only  🩵 Special Event         │
│                                                             │
│  ┌──────┬──────┬──────┬──────┬──────┬──────┬──────┐        │
│  │ Mon  │ Tue  │ Wed  │ Thu  │ Fri  │ Sat  │ Sun  │        │
│  ├──────┼──────┼──────┼──────┼──────┼──────┼──────┤        │
│  │      │      │      │      │      │      │  1   │        │
│  │      │      │      │      │      │      │ 🔵   │        │
│  ├──────┼──────┼──────┼──────┼──────┼──────┼──────┤        │
│  │  2   │  3   │  4   │  5   │  6   │  7   │  8   │        │
│  │ 🟢   │ 🟢   │ 🔴   │ 🟢   │ 🟢   │ 🔵   │ 🔵   │        │
│  │      │      │Indep.│      │      │      │      │        │
│  ├──────┼──────┼──────┼──────┼──────┼──────┼──────┤        │
│  │  9   │ 10   │ 11   │ 12   │ 13   │ 14   │ 15   │        │
│  │ 🟢   │ 🟢   │ 🟣   │ 🟣   │ 🟢   │ 🔵   │ 🔴   │        │
│  │      │      │Exam  │Exam  │      │      │Nat'l │        │
│  ├──────┼──────┼──────┼──────┼──────┼──────┼──────┤        │
│  │ 16   │ 17   │ 18   │ 19   │ 20   │ 21   │ 22   │        │
│  │ 🟢   │ 🟢   │ 🟢   │ 🟢   │ 🟢   │ 🔵   │ 🔵   │        │
│  ├──────┼──────┼──────┼──────┼──────┼──────┼──────┤        │
│  │ 23   │ 24   │ 25   │ 26   │ 27   │ 28   │      │        │
│  │ 🟢   │ 🟢   │ 🩵   │ 🟢   │ 🟢   │ 🔵   │      │        │
│  │      │      │Sport │      │      │      │      │        │
│  └──────┴──────┴──────┴──────┴──────┴──────┴──────┘        │
│                                                             │
│  📊 Month Summary:                                          │
│  Working Days: 19  │  Holidays: 2  │  Weekends: 7           │
│  Exam Days: 2  │  Special Events: 1                         │
└─────────────────────────────────────────────────────────────┘
```

### 6.3 Click Day → Show Day Detail + Events

When a user clicks a day cell, show a side panel or modal with full day details:

```
GET /institutes/{instituteId}/calendar/days/{calendarDayId}/events
```

```
┌── Day Detail: February 11, 2026 ──────────────────────┐
│                                                        │
│  Day Type: 🟣 EXAM_DAY                                 │
│  Attendance Expected: ✅ Yes                            │
│  Operating Hours: 08:00 — 12:00                        │
│                                                        │
│  Events:                                               │
│  ┌────────────────────────────────────────────────┐    │
│  │ 📝 Term 1 Mathematics Exam                      │    │
│  │    08:00 — 10:00 | Mandatory                    │    │
│  │    Scope: CLASS (Grade 10A, 10B)                │    │
│  │    Status: SCHEDULED                            │    │
│  │    Venue: Main Hall                             │    │
│  │    [View Attendance →]                          │    │
│  └────────────────────────────────────────────────┘    │
│  ┌────────────────────────────────────────────────┐    │
│  │ 📝 Term 1 Science Exam                          │    │
│  │    10:30 — 12:00 | Mandatory                    │    │
│  │    Scope: CLASS (Grade 10A, 10B)                │    │
│  │    Status: SCHEDULED                            │    │
│  └────────────────────────────────────────────────┘    │
│                                                        │
│  [Close]                                               │
└────────────────────────────────────────────────────────┘
```

### 6.4 Implementation — Calendar Grid

```typescript
// Fetch one month of calendar days
async function fetchMonthDays(instituteId: string, year: number, month: number) {
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;

  const res = await apiCall('GET', 
    `/institutes/${instituteId}/calendar/days?startDate=${startDate}&endDate=${endDate}&limit=400`
  );

  // Build a map for quick lookup
  const dayMap = new Map<string, CalendarDay>();
  for (const day of res.data) {
    dayMap.set(day.calendarDate, day);
  }
  
  return dayMap;
}

// Render calendar grid
function CalendarMonthView({ instituteId, year, month }) {
  const [dayMap, setDayMap] = useState(new Map());
  
  useEffect(() => {
    fetchMonthDays(instituteId, year, month).then(setDayMap);
  }, [instituteId, year, month]);

  // Generate 6-week grid
  const firstDay = new Date(year, month - 1, 1);
  const startOffset = (firstDay.getDay() + 6) % 7; // Monday = 0
  const daysInMonth = new Date(year, month, 0).getDate();
  
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const dayNum = i - startOffset + 1;
    if (dayNum < 1 || dayNum > daysInMonth) {
      cells.push(null);
    } else {
      const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(dayNum).padStart(2,'0')}`;
      cells.push(dayMap.get(dateStr) || { calendarDate: dateStr, dayType: 'REGULAR' });
    }
  }

  return (
    <div className="calendar-grid">
      {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => (
        <div key={d} className="calendar-header">{d}</div>
      ))}
      {cells.map((day, i) => (
        <CalendarCell key={i} day={day} onClick={() => day && openDayDetail(day)} />
      ))}
    </div>
  );
}
```

---

## Appendix A: All Enum Values <a name="appendix-a"></a>

### Attendance Status
| Value | Display |
|-------|---------|
| `present` | ✅ Present |
| `absent` | ❌ Absent |
| `late` | ⏰ Late |
| `left` | 🚪 Left |
| `left_early` | 🚪 Left Early |
| `left_lately` | 🚪 Left (Late Departure) |

### Marking Method
| Value | Display |
|-------|---------|
| `qr` | 📱 QR Code |
| `barcode` | 📊 Barcode |
| `rfid/nfc` | 💳 RFID/NFC Card |
| `manual` | ✏️ Manual |
| `system` | 🤖 System (auto) |

### Calendar Day Type
| Value | Attendance Expected |
|-------|:-------------------:|
| `REGULAR` | ✅ Yes |
| `WEEKEND` | ❌ No |
| `PUBLIC_HOLIDAY` | ❌ No |
| `INSTITUTE_HOLIDAY` | ❌ No |
| `HALF_DAY` | ✅ Yes |
| `EXAM_DAY` | ✅ Yes |
| `STAFF_ONLY` | ✅ (staff only) |
| `SPECIAL_EVENT` | ✅ Yes |
| `CANCELLED` | ❌ No |

### Calendar Event Type
| Value | Use Case |
|-------|----------|
| `REGULAR_CLASS` | Default daily class (auto-generated) |
| `EXAM` | Term/final exams |
| `PARENTS_MEETING` | Parent-teacher conference |
| `PRIZE_GIVING` | Awards ceremony |
| `SPORTS_DAY` | Annual sports day |
| `CULTURAL_EVENT` | Drama, music, cultural show |
| `FIELD_TRIP` | Educational trip |
| `WORKSHOP` | Student/teacher workshop |
| `ORIENTATION` | New student/parent orientation |
| `OPEN_DAY` | Public open day |
| `RELIGIOUS_EVENT` | Vesak, Christmas, etc. |
| `EXTRACURRICULAR` | Club activities |
| `STAFF_MEETING` | Staff-only meeting |
| `TRAINING` | Teacher training |
| `GRADUATION` | Graduation ceremony |
| `ADMISSION` | Admission event |
| `MAINTENANCE` | Maintenance/no access |
| `CUSTOM` | Anything else |

### Calendar Event Status
| Value | Meaning |
|-------|---------|
| `SCHEDULED` | Upcoming, not yet started |
| `ONGOING` | Currently happening |
| `COMPLETED` | Finished |
| `CANCELLED` | Cancelled (won't happen) |
| `POSTPONED` | Rescheduled to another date |

### User Type (for attendance context)
| Value | Who |
|-------|-----|
| `STUDENT` | Enrolled student |
| `TEACHER` | Teacher at institute |
| `INSTITUTE_ADMIN` | Institute administrator |
| `ATTENDANCE_MARKER` | Dedicated attendance staff |
| `PARENT` | Student's parent |
| `NOT_ENROLLED` | User exists but not enrolled |

---

## Appendix B: Error Handling Guide <a name="appendix-b"></a>

The API now returns **proper HTTP status codes** (previously everything was 500). Handle these in your frontend:

| Status | Meaning | Frontend Action |
|--------|---------|-----------------|
| `200` | Success | Process response |
| `201` | Created | Show success toast |
| `400` | Bad Request | Show validation error to user |
| `401` | Unauthorized | Redirect to login |
| `403` | Forbidden | Show "no permission" message |
| `404` | Not Found | Show "not found" message |
| `409` | Conflict | Show "already exists" message (e.g., calendar already generated) |
| `429` | Rate Limited | Show "too many requests, slow down" |
| `500` | Server Error | Show generic error, suggest retry |

```typescript
// Global error handler
function handleApiError(status: number, message: string) {
  switch (status) {
    case 400:
      showToast({ type: 'error', message: message || 'Invalid request' });
      break;
    case 401:
      clearSession();
      router.push('/login');
      break;
    case 403:
      showToast({ type: 'warning', message: 'You do not have permission for this action' });
      break;
    case 404:
      showToast({ type: 'info', message: message || 'Resource not found' });
      break;
    case 409:
      showToast({ type: 'warning', message: message || 'Resource already exists' });
      break;
    case 429:
      showToast({ type: 'warning', message: 'Too many requests. Please wait a moment.' });
      break;
    default:
      showToast({ type: 'error', message: 'Something went wrong. Please try again.' });
  }
}
```

---

> **Continue to Part 2:** [FRONTEND_USER_GUIDE_PART2.md](FRONTEND_USER_GUIDE_PART2.md) — Event Attendance Views, Institute/Class/Subject Reports, Charts & Analytics, Parent Portal
