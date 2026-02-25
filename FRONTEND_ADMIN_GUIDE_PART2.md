# System Admin Frontend Implementation Guide — Part 2

## Attendance Monitoring, Reports, Dashboard Analytics & Advanced Features

> **Continues from:** [FRONTEND_ADMIN_GUIDE_PART1.md](FRONTEND_ADMIN_GUIDE_PART1.md)  
> **For:** System admins and institute administrators  
> **Auth:** JWT Bearer token | Roles: `SUPERADMIN`, `instituteAdmin`

---

## Table of Contents

8. [Step 8: Admin Attendance Overview (Institute-Wide)](#step-8)
9. [Step 9: Attendance by User Type (Teachers, Staff, etc.)](#step-9)
10. [Step 10: Admin — Class & Subject Drill-Down](#step-10)
11. [Step 11: Admin Dashboard Charts & Analytics](#step-11)
12. [Step 12: Calendar + Attendance Overlay View](#step-12)
13. [Step 13: Admin — Student Search & Individual History](#step-13)
14. [Step 14: Admin — Card Management & Lookup](#step-14)
15. [Step 15: Admin — Export, Print & Reporting](#step-15)
16. [Step 16: Admin — Notification & Alert Settings](#step-16)
17. [Appendix F: Complete Admin Workflow Checklist](#appendix-f)
18. [Appendix G: Troubleshooting Common Issues](#appendix-g)
19. [Appendix H: Full API Endpoint Reference for Admin](#appendix-h)

---

## Step 8: Admin Attendance Overview (Institute-Wide) <a name="step-8"></a>

### 8.1 What This Screen Shows

The admin needs a bird's-eye view of attendance across the ENTIRE institute. This combines data from the institute-wide attendance endpoint with calendar data to give context.

### 8.2 API Call

```
GET /api/attendance/institute/{instituteId}?startDate=2026-02-20&endDate=2026-02-25&page=1&limit=100
Authorization: Bearer {token}
```

**Backend Constraint:** Maximum 5-day range per API call. For weekly or monthly views, you must make multiple calls.

### 8.3 Building the Admin Overview (Combining Calendar + Attendance)

```typescript
interface AdminDayOverview {
  date: string;
  dayType: string;
  isAttendanceExpected: boolean;
  events: CalendarEvent[];
  attendance: {
    present: number;
    absent: number;
    late: number;
    left: number;
    total: number;
    rate: number;
  };
}

async function buildAdminWeeklyOverview(
  instituteId: string, 
  startDate: string, 
  endDate: string
): Promise<AdminDayOverview[]> {
  
  // Parallel fetch: calendar days + attendance
  const [calendarRes, attendanceRecords] = await Promise.all([
    apiCall('GET', `/institutes/${instituteId}/calendar/days?startDate=${startDate}&endDate=${endDate}&limit=400`),
    apiCall('GET', `/api/attendance/institute/${instituteId}?startDate=${startDate}&endDate=${endDate}&limit=500`),
  ]);

  // Group attendance by date
  const attendanceByDate = new Map<string, any[]>();
  for (const rec of attendanceRecords.data) {
    const date = rec.date || rec.markedAt?.split('T')[0];
    if (!attendanceByDate.has(date)) attendanceByDate.set(date, []);
    attendanceByDate.get(date)!.push(rec);
  }

  // Combine
  return calendarRes.data.map(day => {
    const dayRecords = attendanceByDate.get(day.calendarDate) || [];
    const present = dayRecords.filter(r => r.status === 'present').length;
    const absent = dayRecords.filter(r => r.status === 'absent').length;
    const late = dayRecords.filter(r => r.status === 'late').length;
    const left = dayRecords.filter(r => ['left', 'left_early', 'left_lately'].includes(r.status)).length;
    const total = dayRecords.length;

    return {
      date: day.calendarDate,
      dayType: day.dayType,
      isAttendanceExpected: day.isAttendanceExpected,
      events: day.events || [],
      attendance: {
        present,
        absent,
        late,
        left,
        total,
        rate: total > 0 ? (present / total) * 100 : 0,
      },
    };
  });
}
```

### 8.4 Suggested UI — Admin Weekly Overview

```
┌─────────────────────────────────────────────────────────────┐
│  🏫 Institute Attendance — Week of Feb 20, 2026            │
│  [< Previous Week]                    [Next Week >]         │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Date        │ Type       │ Present│ Absent│ Rate    │    │
│  ├─────────────┼────────────┼────────┼───────┼─────────┤    │
│  │ Mon, Feb 20 │ 🟢 REGULAR │  145   │  18   │  88.9%  │    │
│  │ Tue, Feb 21 │ 🟢 REGULAR │  150   │  12   │  92.6%  │    │
│  │ Wed, Feb 22 │ 🟢 REGULAR │  138   │  25   │  84.7%  │    │
│  │ Thu, Feb 23 │ 🟣 EXAM    │  155   │   8   │  95.1%  │    │
│  │ Fri, Feb 24 │ 🟢 REGULAR │  142   │  20   │  87.7%  │    │
│  │ Sat, Feb 25 │ 🔵 WEEKEND │   —    │   —   │   —     │    │
│  │ Sun, Feb 26 │ 🔵 WEEKEND │   —    │   —   │   —     │    │
│  └─────────────┴────────────┴────────┴───────┴─────────┘    │
│                                                             │
│  Week Average: 89.8% (Working days only)                    │
│  Best Day: Thu (Exam Day — 95.1%)                           │
│  Worst Day: Wed (84.7%)                                     │
│                                                             │
│  ┌── Stacked Bar Chart (Mon-Fri) ─────────────────────┐     │
│  │  200 ┤                                              │     │
│  │  150 ┤ ██ ██ ██ ██ ██                               │     │
│  │  100 ┤ ██ ██ ██ ██ ██                               │     │
│  │   50 ┤ ██ ██ ██ ██ ██                               │     │
│  │    0 ┤ ── ── ── ── ──                               │     │
│  │       Mon Tue Wed Thu Fri                           │     │
│  │  🟢 Present  🔴 Absent  🟡 Late                     │     │
│  └─────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

---

## Step 9: Attendance by User Type (Teachers, Staff, etc.) <a name="step-9"></a>

### 9.1 What This Shows

The system tracks attendance not just for students, but also teachers, admins, and markers. This endpoint lets admins see attendance grouped by user type.

### 9.2 API Call

```
GET /api/attendance/calendar/institute/{instituteId}/user-type/{userType}?page=1&limit=50
Authorization: Bearer {token}
```

**Available user types:**

| Value | Who |
|-------|-----|
| `STUDENT` | Students |
| `TEACHER` | Teachers |
| `INSTITUTE_ADMIN` | Admin staff |
| `ATTENDANCE_MARKER` | Attendance marking staff |
| `PARENT` | Parents (if tracked at events) |
| `NOT_ENROLLED` | Visitors or unenrolled users |

### 9.3 Suggested UI — User Type Tabs

```
┌─────────────────────────────────────────────────────────────┐
│  👥 Attendance by User Type                                  │
│                                                             │
│  [Students]  [Teachers]  [Admin Staff]  [Markers]           │
│  ══════════                                                 │
│                                                             │
│  Showing: STUDENT attendance                                │
│                                                             │
│  ┌── Summary ─────────────────────────────────────────┐     │
│  │  Total Students: 173                               │     │
│  │  Average Rate: 87.3%                               │     │
│  │  Most Absent Day: Wednesday                        │     │
│  └────────────────────────────────────────────────────┘     │
│                                                             │
│  ┌── Records ─────────────────────────────────────────┐     │
│  │  Student         │ Date     │ Status │ Event       │     │
│  │  Kasun Perera    │ Feb 25   │ ✅     │ Regular     │     │
│  │  Nimali Silva    │ Feb 25   │ ❌     │ Regular     │     │
│  │  Sahan Fernando  │ Feb 25   │ ⏰     │ Regular     │     │
│  │  ...                                               │     │
│  └────────────────────────────────────────────────────┘     │
│                                                             │
│  Page 1 of 4  [< Previous]  [Next >]                        │
└─────────────────────────────────────────────────────────────┘
```

---

## Step 10: Admin — Class & Subject Drill-Down <a name="step-10"></a>

### 10.1 API Calls

**Class attendance:**
```
GET /api/attendance/institute/{instituteId}/class/{classId}?startDate=2026-02-20&endDate=2026-02-25
```

**Subject attendance:**
```
GET /api/attendance/institute/{instituteId}/class/{classId}/subject/{subjectId}?startDate=2026-02-20&endDate=2026-02-25
```

### 10.2 Suggested UI — Hierarchical Drill-Down

```
┌─────────────────────────────────────────────────────────────┐
│  📊 Attendance Drill-Down                                    │
│                                                             │
│  Institute: Suraksha Learning Academy                       │
│  └─ Select Class: [Grade 10A ▼]                             │
│     └─ Select Subject: [All Subjects ▼]                     │
│                                                             │
│  ┌── Grade 10A — All Subjects ────────────────────────┐     │
│  │                                                    │     │
│  │  Subject      │ Rate  │ Present │ Absent │ Late    │     │
│  │  ──────────── │ ───── │ ─────── │ ────── │ ────    │     │
│  │  Mathematics  │ 92.1% │   35    │   2    │  1      │     │
│  │  Science      │ 87.3% │   33    │   4    │  1      │     │
│  │  English      │ 89.5% │   34    │   3    │  1      │     │
│  │  History      │ 78.2% │   30    │   6    │  2      │     │
│  │  Sinhala      │ 91.0% │   35    │   2    │  1      │     │
│  │                                                    │     │
│  │  Class Average: 87.6%                              │     │
│  └────────────────────────────────────────────────────┘     │
│                                                             │
│  Click a subject to see per-student breakdown               │
│                                                             │
│  ┌── Mathematics — Per Student ───────────────────────┐     │
│  │                                                    │     │
│  │  Student         │ Mon │ Tue │ Wed │ Thu │ Fri     │     │
│  │  Kasun Perera    │ ✅  │ ✅  │ ✅  │ ✅  │ ✅      │     │
│  │  Nimali Silva    │ ✅  │ ❌  │ ✅  │ ✅  │ ✅      │     │
│  │  Sahan Fernando  │ ⏰  │ ✅  │ ✅  │ ❌  │ ⏰      │     │
│  └────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

---

## Step 11: Admin Dashboard Charts & Analytics <a name="step-11"></a>

### 11.1 Chart 1: Monthly Attendance Trend (Entire Institute)

**What it shows:** Average daily attendance rate per month over the academic year.
**Why admins need it:** Spot seasonal trends (e.g., drops before holidays).

```typescript
async function getMonthlyTrend(instituteId: string, academicYear: string) {
  const months = [];
  for (let m = 1; m <= 12; m++) {
    const startDate = `${academicYear}-${String(m).padStart(2, '0')}-01`;
    const lastDay = new Date(parseInt(academicYear), m, 0).getDate();
    const endDate = `${academicYear}-${String(m).padStart(2, '0')}-${lastDay}`;

    // Get working days count from calendar
    const calRes = await apiCall('GET',
      `/institutes/${instituteId}/calendar/days?startDate=${startDate}&endDate=${endDate}&isAttendanceExpected=true&limit=400`
    );

    // Get attendance in 5-day windows
    const records = await fetchMultiWeek(instituteId, startDate, endDate);
    
    const present = records.filter(r => r.status === 'present').length;
    const total = records.length;

    months.push({
      month: new Date(parseInt(academicYear), m - 1).toLocaleString('en-LK', { month: 'short' }),
      workingDays: calRes.data.length,
      totalRecords: total,
      presentCount: present,
      rate: total > 0 ? Math.round((present / total) * 1000) / 10 : 0,
    });
  }
  return months;
}
```

**Recharts Implementation:**
```tsx
import { AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts';

function MonthlyTrendChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id="colorRate" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="month" />
        <YAxis domain={[60, 100]} />
        <Tooltip formatter={(v) => `${v}%`} />
        <ReferenceLine y={85} stroke="#EF4444" strokeDasharray="3 3" label="Min Target: 85%" />
        <Area type="monotone" dataKey="rate" stroke="#3B82F6" fill="url(#colorRate)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
```

### 11.2 Chart 2: Class Comparison Bar Chart (Horizontal)

**What it shows:** Which classes have the best/worst attendance.

```tsx
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

function ClassComparisonChart({ classData }) {
  // classData = [{ className: 'Grade 10A', rate: 92.1 }, ...]
  // Sort by rate
  const sorted = [...classData].sort((a, b) => b.rate - a.rate);
  
  return (
    <ResponsiveContainer width="100%" height={sorted.length * 45}>
      <BarChart data={sorted} layout="vertical">
        <XAxis type="number" domain={[0, 100]} />
        <YAxis type="category" dataKey="className" width={100} />
        <Tooltip formatter={(v) => `${v}%`} />
        <Bar dataKey="rate" radius={[0, 4, 4, 0]}>
          {sorted.map((entry, i) => (
            <Cell key={i} fill={entry.rate >= 85 ? '#22C55E' : entry.rate >= 75 ? '#F59E0B' : '#EF4444'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
```

### 11.3 Chart 3: Day-of-Week Heatmap

**What it shows:** Which day of the week consistently has the lowest attendance.

```tsx
function DayOfWeekAnalysis({ weeklyData }) {
  // weeklyData = [
  //   { day: 'Monday', avgRate: 89.2, totalRecords: 520 },
  //   { day: 'Tuesday', avgRate: 91.5, totalRecords: 534 },
  //   { day: 'Wednesday', avgRate: 85.1, totalRecords: 498 },
  //   { day: 'Thursday', avgRate: 88.7, totalRecords: 512 },
  //   { day: 'Friday', avgRate: 82.3, totalRecords: 480 },
  // ]
  return (
    <div className="day-heatmap">
      {weeklyData.map(d => (
        <div 
          key={d.day}
          className="day-cell"
          style={{ 
            backgroundColor: getHeatColor(d.avgRate),
            padding: '16px',
            textAlign: 'center',
            borderRadius: '8px',
          }}
        >
          <div style={{ fontWeight: 'bold' }}>{d.day}</div>
          <div style={{ fontSize: '24px' }}>{d.avgRate}%</div>
          <div style={{ fontSize: '12px', opacity: 0.7 }}>{d.totalRecords} records</div>
        </div>
      ))}
    </div>
  );
}

function getHeatColor(rate: number): string {
  if (rate >= 90) return '#DCFCE7'; // light green
  if (rate >= 85) return '#FEF9C3'; // light yellow
  if (rate >= 80) return '#FED7AA'; // light orange
  return '#FECACA'; // light red
}
```

### 11.4 Chart 4: Real-Time Today Status (Gauge/Progress)

```
┌── Today's Live Attendance ────────────────────────────┐
│                                                        │
│           ╭───────────────────╮                         │
│          ╱                     ╲                        │
│         ╱    142 / 173 (82.1%)  ╲                       │
│        ╱                         ╲                      │
│       ╱    ████████████████░░░░░  ╲                     │
│      ╱                             ╲                    │
│     ╰───────────────────────────────╯                   │
│                                                        │
│     🟢 Present: 142  🔴 Absent: 23  🟡 Late: 8         │
│                                                        │
│     ⏰ Last marked: 2 minutes ago                       │
│     [🔄 Refresh]                                        │
└────────────────────────────────────────────────────────┘
```

### 11.5 Chart 5: Attendance Rate Distribution (Histogram)

Show how students are distributed across attendance rate buckets:

```
Attendance Rate Distribution:
0-50%:    ██ 3 students (at risk)
50-70%:   ████ 8 students (warning)
70-80%:   ████████ 18 students (below average)
80-90%:   ████████████████████ 62 students (average)
90-100%:  ██████████████████████████ 82 students (excellent)
```

---

## Step 12: Calendar + Attendance Overlay View <a name="step-12"></a>

### 12.1 What This Is

The most powerful admin view: a **calendar month grid where each cell shows both the day type AND the attendance rate**.

### 12.2 How to Build It

```typescript
async function getCalendarWithAttendance(instituteId: string, year: number, month: number) {
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;

  // Fetch calendar days
  const calendarRes = await apiCall('GET',
    `/institutes/${instituteId}/calendar/days?startDate=${startDate}&endDate=${endDate}&limit=400`
  );

  // Fetch attendance in 5-day windows
  const allRecords = await fetchMultiWeek(instituteId, startDate, endDate);

  // Merge
  const overlay = calendarRes.data.map(day => {
    const dayRecords = allRecords.filter(r => {
      const recDate = r.date || r.markedAt?.split('T')[0];
      return recDate === day.calendarDate;
    });

    const present = dayRecords.filter(r => r.status === 'present').length;
    const total = dayRecords.length;

    return {
      ...day,
      attendanceCount: total,
      presentCount: present,
      attendanceRate: total > 0 ? Math.round((present / total) * 100) : null,
    };
  });

  return overlay;
}
```

### 12.3 Suggested UI — Calendar with Attendance Overlay

```
┌─────────────────────────────────────────────────────────────┐
│  📅 Calendar + Attendance — February 2026                   │
│                                                             │
│  ┌──────┬──────┬──────┬──────┬──────┬──────┬──────┐        │
│  │ Mon  │ Tue  │ Wed  │ Thu  │ Fri  │ Sat  │ Sun  │        │
│  ├──────┼──────┼──────┼──────┼──────┼──────┼──────┤        │
│  │  2   │  3   │  4   │  5   │  6   │  7   │  8   │        │
│  │ 🟢   │ 🟢   │ 🔴   │ 🟢   │ 🟢   │ 🔵   │ 🔵   │        │
│  │ 89%  │ 92%  │  —   │ 87%  │ 91%  │  —   │  —   │        │
│  ├──────┼──────┼──────┼──────┼──────┼──────┼──────┤        │
│  │  9   │ 10   │ 11   │ 12   │ 13   │ 14   │ 15   │        │
│  │ 🟢   │ 🟢   │ 🟣   │ 🟣   │ 🟢   │ 🔵   │ 🔴   │        │
│  │ 85%  │ 88%  │ 95%  │ 93%  │ 86%  │  —   │  —   │        │
│  ├──────┼──────┼──────┼──────┼──────┼──────┼──────┤        │
│  │ 16   │ 17   │ 18   │ 19   │ 20   │ 21   │ 22   │        │
│  │ 🟢   │ 🟢   │ 🟢   │ 🟢   │ 🟢   │ 🔵   │ 🔵   │        │
│  │ 87%  │ 91%  │ 82%  │ 90%  │ 88%  │  —   │  —   │        │
│  └──────┴──────┴──────┴──────┴──────┴──────┴──────┘        │
│                                                             │
│  Color Key: Rate cell background                            │
│  🟩 ≥90%  🟨 80-89%  🟧 70-79%  🟥 <70%                    │
│                                                             │
│  Click any day → see events + full attendance list          │
└─────────────────────────────────────────────────────────────┘
```

---

## Step 13: Admin — Student Search & Individual History <a name="step-13"></a>

### 13.1 Search and View Any Student's Attendance

Admins can search for any student and view their attendance:

```
GET /api/attendance/student/{studentId}?instituteId={instituteId}&startDate={start}&endDate={end}&page=1&limit=20
```

### 13.2 Suggested UI — Student Lookup

```
┌─────────────────────────────────────────────────────────────┐
│  🔍 Student Attendance Lookup                                │
│                                                             │
│  Search: [Kasun Per_________]  [🔍]                         │
│                                                             │
│  Results:                                                   │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  👦 Kasun Perera — ID: 456 — Grade 10A              │    │
│  │     This Term: 92.1% (142/154 days)                 │    │
│  │     [View Full History →]                           │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌── Student Detail ──────────────────────────────────┐     │
│  │                                                    │     │
│  │  📊 Kasun Perera — Grade 10A                        │     │
│  │                                                    │     │
│  │  ┌── Donut Chart ──┐  ┌── Stats ────────────────┐ │     │
│  │  │  🟢 92.1%        │  │  Present: 142           │ │     │
│  │  │  (present rate)  │  │  Absent:  7             │ │     │
│  │  │                  │  │  Late:    3             │ │     │
│  │  │  ╭──────╮       │  │  Left:    2             │ │     │
│  │  │ │ 92.1% │       │  │  Total:   154           │ │     │
│  │  │  ╰──────╯       │  │                         │ │     │
│  │  └──────────────────┘  └─────────────────────────┘ │     │
│  │                                                    │     │
│  │  ┌── Calendar Heatmap (GitHub style) ────────────┐ │     │
│  │  │  Jan   Feb   Mar   Apr   May   Jun            │ │     │
│  │  │  ▪▪▪▪  ▪▪▪▫  ▪▪▪▪  ——    ▪▪▪▪  ▪▪▪▪          │ │     │
│  │  └───────────────────────────────────────────────┘ │     │
│  │                                                    │     │
│  │  ┌── Monthly Trend Line Chart ───────────────────┐ │     │
│  │  │  100%│      ╱──╲   ╱──                        │ │     │
│  │  │   90%│  ╱──╱    ╲─╱                           │ │     │
│  │  │   80%│─╱                                      │ │     │
│  │  │      └───────────────────                     │ │     │
│  │  │       Jan Feb Mar Apr May                     │ │     │
│  │  └───────────────────────────────────────────────┘ │     │
│  └────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

---

## Step 14: Admin — Card Management & Lookup <a name="step-14"></a>

### 14.1 Look Up User by Card ID

```
GET /api/attendance/institute-card-user?instituteCardId=CARD001&instituteId=101
Authorization: Bearer {token}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "userId": "456",
    "userName": "Kasun Perera",
    "instituteCardId": "CARD001",
    "imageUrl": "https://storage.googleapis.com/...",
    "isActive": true,
    "roles": ["STUDENT"]
  }
}
```

### 14.2 Get Attendance by System Card ID

```
GET /api/attendance/by-cardId/{cardId}?page=1&limit=20
Authorization: Bearer {token}
```

### 14.3 Suggested UI — Card Management

```
┌─────────────────────────────────────────────────────────────┐
│  💳 Card Management                                          │
│                                                             │
│  Look Up Card:                                              │
│  Institute Card ID: [CARD001________]  [🔍 Look Up]         │
│                                                             │
│  ┌── Card Info ───────────────────────────────────────┐     │
│  │  Card ID: CARD001                                  │     │
│  │  User: Kasun Perera (Student)                      │     │
│  │  Status: ✅ Active                                  │     │
│  │  Photo: [👤 profile image]                          │     │
│  │                                                    │     │
│  │  Recent Scans:                                     │     │
│  │  • Feb 25, 08:05 AM — Present ✅                    │     │
│  │  • Feb 24, 08:12 AM — Present ✅                    │     │
│  │  • Feb 23, 08:45 AM — Late ⏰                       │     │
│  └────────────────────────────────────────────────────┘     │
│                                                             │
│  Mark by Card:                                              │
│  [💳 Single Card Scan]  [💳💳 Bulk Card Scan]                │
└─────────────────────────────────────────────────────────────┘
```

---

## Step 15: Admin — Export, Print & Reporting <a name="step-15"></a>

### 15.1 Client-Side CSV Export

The API returns JSON. Transform to CSV on the frontend:

```typescript
function exportToCSV(records: any[], filename: string) {
  const headers = ['Date', 'Student Name', 'Class', 'Subject', 'Status', 'Marked At', 'Marking Method'];
  
  const rows = records.map(r => [
    r.date || r.markedAt?.split('T')[0],
    r.studentName || r.studentId,
    r.className || '—',
    r.subjectName || '—',
    r.status,
    r.markedAt ? toSriLankaTime(r.markedAt) : '—',
    r.markingMethod || '—',
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
}

// Usage:
exportToCSV(attendanceRecords, 'attendance_grade10A_feb2026');
```

### 15.2 Print-Friendly View

```typescript
function printAttendanceReport() {
  const printContent = document.getElementById('attendance-report');
  const printWindow = window.open('', '_blank');
  printWindow.document.write(`
    <html>
    <head>
      <title>Attendance Report</title>
      <style>
        body { font-family: Arial, sans-serif; font-size: 12px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #ddd; padding: 6px; text-align: left; }
        th { background-color: #f4f4f4; font-weight: bold; }
        .present { color: green; }
        .absent { color: red; }
        .late { color: orange; }
        @media print { 
          .no-print { display: none; } 
          body { margin: 0; }
        }
      </style>
    </head>
    <body>
      <h2>Attendance Report — ${instituteName}</h2>
      <p>Date Range: ${startDate} — ${endDate}</p>
      ${printContent.innerHTML}
    </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.print();
}
```

---

## Step 16: Admin — Notification & Alert Settings <a name="step-16"></a>

### 16.1 Firebase Push Notifications (Already Integrated)

The backend already sends push notifications when attendance is marked (via Firebase). The admin doesn't need to configure this — it happens automatically.

**What the backend sends:**
- When `mark` or `mark-bulk` is called
- Notification goes to the student's registered device
- Message: "Your attendance has been marked: [status] at [institute]"

### 16.2 Suggested Admin Alert Settings (Frontend Logic Only)

Build these as frontend-only features that check attendance data:

```typescript
interface AlertConfig {
  lowAttendanceThreshold: number;  // e.g., 75%
  consecutiveAbsentAlert: number;  // e.g., 3 days
  dailyReportTime: string;         // e.g., "16:00"
}

function checkAlerts(records: any[], config: AlertConfig) {
  const alerts: string[] = [];

  // 1. Students below threshold
  const studentRates = calculateStudentRates(records);
  const lowAttendance = studentRates.filter(s => s.rate < config.lowAttendanceThreshold);
  if (lowAttendance.length > 0) {
    alerts.push(`${lowAttendance.length} students below ${config.lowAttendanceThreshold}% attendance`);
  }

  // 2. Consecutive absences
  const consecutiveAbsent = findConsecutiveAbsent(records, config.consecutiveAbsentAlert);
  if (consecutiveAbsent.length > 0) {
    alerts.push(`${consecutiveAbsent.length} students absent ${config.consecutiveAbsentAlert}+ consecutive days`);
  }

  return alerts;
}
```

```
┌─────────────────────────────────────────────────────────────┐
│  🔔 Attendance Alerts                                        │
│                                                             │
│  ⚠️ 5 students below 75% attendance this month              │
│     • Sahan Fernando (68.2%)                                │
│     • Dilshan Rajapaksa (71.5%)                             │
│     • [View All →]                                          │
│                                                             │
│  🔴 2 students absent 3+ consecutive days                    │
│     • Amaya Jayasinghe (3 days: Feb 22-24)                  │
│     • Priya Wijesinghe (4 days: Feb 20-24)                  │
│     • [View All →]                                          │
│                                                             │
│  📊 Today's attendance: 82.1% (below 85% target)            │
└─────────────────────────────────────────────────────────────┘
```

---

## Appendix F: Complete Admin Workflow Checklist <a name="appendix-f"></a>

### Initial Setup (One-time per Academic Year)

| # | Step | API Endpoint | Status |
|---|------|-------------|--------|
| 1 | Configure weekly operating schedule | `POST /calendar/operating-config/bulk` | ⬜ |
| 2 | Prepare public holidays list | (frontend data entry) | ⬜ |
| 3 | Prepare term breaks list | (frontend data entry) | ⬜ |
| 4 | Generate academic year calendar | `POST /calendar/generate` | ⬜ |
| 5 | Verify generated calendar | `GET /calendar/days` | ⬜ |
| 6 | Add special events (exams, meetings) | `POST /calendar/events` | ⬜ |

### Ongoing Management (Daily/Weekly)

| # | Task | Frequency | API |
|---|------|-----------|-----|
| 1 | Check today's dashboard | Daily | `GET /calendar/today` |
| 2 | Review daily attendance | Daily | `GET /attendance/institute/:id` |
| 3 | Handle day overrides (cancel, half-day) | As needed | `PATCH /calendar/days/:id` |
| 4 | Create events for upcoming activities | As needed | `POST /calendar/events` |
| 5 | Update event status | As needed | `PATCH /calendar/events/:id` |
| 6 | Review weekly class attendance | Weekly | `GET /attendance/institute/:id/class/:cid` |
| 7 | Check for low-attendance students | Weekly | `GET /attendance/student/:sid` |

### Monthly/Term Reporting

| # | Task | API Endpoints |
|---|------|--------------|
| 1 | Generate monthly attendance report | Combine institute + calendar endpoints |
| 2 | Per-class comparison | `GET /attendance/institute/:id/class/:cid` for each class |
| 3 | Per-subject analysis | `GET /attendance/institute/:id/class/:cid/subject/:sid` |
| 4 | Event attendance review | `GET /attendance/calendar/institute/:id/event/:eid` |
| 5 | Export CSV for records | Client-side export from any data |

---

## Appendix G: Troubleshooting Common Issues <a name="appendix-g"></a>

### Issue 1: "No calendar day found for today"

**Symptom:** `GET /calendar/today` returns null  
**Cause:** Calendar hasn't been generated for the current year  
**Fix:** Admin needs to generate the calendar (Step 3 of Admin Guide Part 1)  
**Frontend:** Show a setup wizard prompting the admin to generate the calendar

### Issue 2: "Calendar already exists for academic year"

**Symptom:** `POST /calendar/generate` returns 409 Conflict  
**Cause:** Calendar was already generated for this year  
**Fix:** Delete the existing calendar first, then regenerate  
**API:** `DELETE /institutes/:id/calendar/:academicYear` then `POST /calendar/generate`  
**Frontend:** Show option to "Delete & Regenerate" with confirmation

### Issue 3: Student attendance history returns empty

**Symptom:** `GET /attendance/student/:id` returns empty data array  
**Cause 1:** Missing `instituteId` query param (was a bug, now required)  
**Cause 2:** Date range doesn't contain any attendance records  
**Fix:** Always include `?instituteId=xxx` and check the date range  

### Issue 4: Institute attendance returns "Date range too large"

**Symptom:** API returns 400 error  
**Cause:** Date range exceeds 5 days  
**Fix:** Frontend must paginate in 5-day windows (see fetchMultiWeek function in User Guide Part 2)

### Issue 5: "Today's cache seems stale"

**Symptom:** Calendar shows yesterday's data even though it's past midnight  
**Cause:** Cache TTL hasn't expired yet  
**Fix:** `POST /calendar/cache/invalidate` — usually auto-resolves within minutes

### Issue 6: Bulk attendance partially fails

**Symptom:** Some students in bulk request succeed, others fail  
**Cause:** Individual student validation failures (invalid studentId, duplicate for same date)  
**Fix:** Check `results` array in response — retry only failed ones  
**Frontend:** Show green checkmarks for success, red X for failures, retry button for failed

### Issue 7: Event attendance returns no records

**Symptom:** `GET /attendance/calendar/institute/:id/event/:eid` returns empty  
**Cause:** Attendance was marked without `eventId` linkage  
**Fix:** When marking attendance, include `eventId` if you want event-specific tracking. For regular daily attendance, the backend auto-links to the default event.

---

## Appendix H: Full API Endpoint Reference for Admin <a name="appendix-h"></a>

### Calendar Management (Admin/SUPERADMIN Only)

| # | Method | Endpoint | Purpose |
|---|--------|----------|---------|
| 1 | `POST` | `/institutes/:id/calendar/operating-config` | Set single day operating config |
| 2 | `POST` | `/institutes/:id/calendar/operating-config/bulk` | Set all 7 days at once |
| 3 | `GET` | `/institutes/:id/calendar/operating-config` | Get current weekly schedule |
| 4 | `POST` | `/institutes/:id/calendar/generate` | Generate full year calendar |
| 5 | `DELETE` | `/institutes/:id/calendar/:academicYear` | Delete entire year's calendar |
| 6 | `GET` | `/institutes/:id/calendar/days` | List/filter calendar days |
| 7 | `GET` | `/institutes/:id/calendar/today` | Get today's calendar day |
| 8 | `PATCH` | `/institutes/:id/calendar/days/:dayId` | Update a calendar day |
| 9 | `DELETE` | `/institutes/:id/calendar/days/:dayId` | Delete a calendar day |
| 10 | `POST` | `/institutes/:id/calendar/events` | Create event |
| 11 | `PATCH` | `/institutes/:id/calendar/events/:eventId` | Update event |
| 12 | `DELETE` | `/institutes/:id/calendar/events/:eventId` | Delete event |
| 13 | `GET` | `/institutes/:id/calendar/days/:dayId/events` | List day's events |
| 14 | `GET` | `/institutes/:id/calendar/days/:dayId/default-event` | Get default event |
| 15 | `POST` | `/institutes/:id/calendar/cache/invalidate` | Clear cache |
| 16 | `GET` | `/institutes/:id/calendar/cache/stats` | Cache diagnostics |

### Attendance CRUD (Admin/Teacher/Marker)

| # | Method | Endpoint | Purpose |
|---|--------|----------|---------|
| 17 | `POST` | `/api/attendance/mark` | Mark single attendance |
| 18 | `POST` | `/api/attendance/mark-bulk` | Mark up to 100 at once |
| 19 | `POST` | `/api/attendance/mark-by-card` | Mark via system card |
| 20 | `POST` | `/api/attendance/mark-bulk-by-card` | Bulk mark via cards |
| 21 | `POST` | `/api/attendance/mark-by-institute-card` | Mark via institute card |
| 22 | `GET` | `/api/attendance/student/:studentId` | Student history |
| 23 | `GET` | `/api/attendance/by-cardId/:cardId` | Attendance by card |
| 24 | `GET` | `/api/attendance/institute/:instituteId` | Institute-wide (5-day max) |
| 25 | `GET` | `/api/attendance/institute/:id/class/:classId` | Class attendance |
| 26 | `GET` | `/api/attendance/institute/:id/class/:cid/subject/:sid` | Subject attendance |
| 27 | `GET` | `/api/attendance/institute-card-user` | Look up card user |

### Calendar-Linked Attendance Queries

| # | Method | Endpoint | Purpose |
|---|--------|----------|---------|
| 28 | `GET` | `/api/attendance/calendar/institute/:id/event/:eid` | Attendance by event |
| 29 | `GET` | `/api/attendance/calendar/institute/:id/calendar-day/:cdId` | Attendance by day |
| 30 | `GET` | `/api/attendance/calendar/institute/:id/user-type/:type` | Attendance by user type |
| 31 | `GET` | `/api/attendance/calendar/institute/:id/student/:sid/event/:eid` | Student event attendance |

---

> **Previous Part:** [FRONTEND_ADMIN_GUIDE_PART1.md](FRONTEND_ADMIN_GUIDE_PART1.md) — Calendar Setup, Operating Config, Event CRUD  
> **User Guides:** [FRONTEND_USER_GUIDE_PART1.md](FRONTEND_USER_GUIDE_PART1.md) | [FRONTEND_USER_GUIDE_PART2.md](FRONTEND_USER_GUIDE_PART2.md)
