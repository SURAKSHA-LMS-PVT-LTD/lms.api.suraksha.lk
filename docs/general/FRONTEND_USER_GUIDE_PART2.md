# User Frontend Implementation Guide — Part 2

## Event Attendance, Reports, Charts & Analytics, Parent Portal

> **Continues from:** [FRONTEND_USER_GUIDE_PART1.md](FRONTEND_USER_GUIDE_PART1.md)  
> **For:** Frontend developers building user-facing attendance views  
> **Auth:** JWT Bearer token | **Timezone:** Asia/Colombo (UTC+5:30)

---

## Table of Contents

7. [Step 7: View Event Attendance (Who Attended an Event?)](#step-7)
8. [Step 8: View Calendar Day Attendance](#step-8)
9. [Step 9: Institute-Wide Attendance Dashboard](#step-9)
10. [Step 10: Class Attendance View](#step-10)
11. [Step 11: Subject Attendance View](#step-11)
12. [Step 12: Charts & Analytics — Detailed Implementation](#step-12)
13. [Step 13: Parent Portal — View Child's Attendance](#step-13)
14. [Step 14: Parent — View Child's Event Attendance](#step-14)
15. [Step 15: Responsive Design & Mobile Considerations](#step-15)
16. [Appendix C: Complete API Quick Reference](#appendix-c)
17. [Appendix D: Date/Time Handling (Sri Lanka/Asia Colombo)](#appendix-d)

---

## Step 7: View Event Attendance (Who Attended an Event?) <a name="step-7"></a>

### 7.1 What This Screen Shows

When a teacher or admin clicks "View Attendance" on a specific event (e.g., "Term 1 Mathematics Exam"), this shows all attendance records linked to that event.

### 7.2 What Happens Behind the Scenes

1. Frontend sends event ID + institute ID
2. Backend queries DynamoDB for all records where `eventId` matches
3. Results include student names, statuses, timestamps, marking methods
4. Useful for: "Who came to the Parents Meeting?" or "Who sat the Science exam?"

### 7.3 API Call

```
GET /api/attendance/calendar/institute/{instituteId}/event/{eventId}?page=1&limit=50
Authorization: Bearer {token}
```

**Query params:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `page` | number | No | Default: 1 |
| `limit` | number | No | Default: 50, max: 100 |

**Response:**
```json
{
  "success": true,
  "data": {
    "eventId": "8905",
    "eventTitle": "Term 1 Mathematics Exam",
    "eventType": "EXAM",
    "records": [
      {
        "studentId": "456",
        "studentName": "Kasun Perera",
        "status": "present",
        "markedAt": "2026-02-11T02:30:00.000Z",
        "markingMethod": "manual",
        "remarks": null
      },
      {
        "studentId": "457",
        "studentName": "Nimali Silva",
        "status": "absent",
        "markedAt": "2026-02-11T02:30:00.000Z",
        "markingMethod": "manual",
        "remarks": "Medical leave"
      }
    ],
    "summary": {
      "present": 28,
      "absent": 3,
      "late": 2,
      "total": 33
    }
  },
  "pagination": {
    "currentPage": 1,
    "totalPages": 1,
    "totalRecords": 33
  }
}
```

### 7.4 Suggested UI — Event Attendance View

```
┌─────────────────────────────────────────────────────────────┐
│  📝 Event Attendance — Term 1 Mathematics Exam              │
│  📅 February 11, 2026  │  ⏰ 08:00 — 10:00  │  Main Hall   │
│  Scope: Grade 10A, 10B  │  Mandatory: ✅                    │
│                                                             │
│  ┌── Summary ─────────────────────────────────────────┐     │
│  │  ✅ Present: 28  │  ❌ Absent: 3  │  ⏰ Late: 2    │     │
│  │  Total Expected: 33  │  Attendance: 84.8%           │     │
│  │                                                    │     │
│  │  ████████████████████████░░░░░░ 84.8%              │     │
│  └────────────────────────────────────────────────────┘     │
│                                                             │
│  ┌── Attendance Records ──────────────────────────────┐     │
│  │ Filter: [All ▼]  Search: [____________]            │     │
│  │                                                    │     │
│  │  ┌────┬──────────────────┬────────┬──────────┐     │     │
│  │  │ #  │ Student          │ Status │ Time     │     │     │
│  │  ├────┼──────────────────┼────────┼──────────┤     │     │
│  │  │ 1  │ Kasun Perera     │ ✅     │ 08:00 AM │     │     │
│  │  │ 2  │ Nimali Silva     │ ❌     │ —        │     │     │
│  │  │ 3  │ Sahan Fernando   │ ⏰     │ 08:25 AM │     │     │
│  │  │ .. │ ...              │ ...    │ ...      │     │     │
│  │  └────┴──────────────────┴────────┴──────────┘     │     │
│  └────────────────────────────────────────────────────┘     │
│                                                             │
│  [📥 Export CSV]  [🖨️ Print]                                │
└─────────────────────────────────────────────────────────────┘
```

---

## Step 8: View Calendar Day Attendance <a name="step-8"></a>

### 8.1 What This Shows

All attendance records for a specific calendar day — across ALL events that day. This is the "full picture" for a day when there are multiple events.

### 8.2 API Call

```
GET /api/attendance/calendar/institute/{instituteId}/calendar-day/{calendarDayId}?page=1&limit=50
Authorization: Bearer {token}
```

**Response — same structure as event attendance, but aggregated across all events for that day:**
```json
{
  "success": true,
  "data": {
    "calendarDayId": "4511",
    "calendarDate": "2026-02-11",
    "dayType": "EXAM_DAY",
    "records": [
      {
        "studentId": "456",
        "studentName": "Kasun Perera",
        "eventId": "8905",
        "eventTitle": "Mathematics Exam",
        "status": "present",
        "markedAt": "2026-02-11T02:30:00.000Z"
      },
      {
        "studentId": "456",
        "studentName": "Kasun Perera",
        "eventId": "8906",
        "eventTitle": "Science Exam",
        "status": "present",
        "markedAt": "2026-02-11T05:00:00.000Z"
      }
    ]
  }
}
```

### 8.3 Suggested UI — Day Attendance with Event Grouping

```
┌─────────────────────────────────────────────────────────────┐
│  📅 Day Attendance — February 11, 2026 (EXAM_DAY)          │
│                                                             │
│  ┌── Event 1: Mathematics Exam (08:00-10:00) ─────────┐    │
│  │  Present: 28 | Absent: 3 | Late: 2                 │    │
│  │  ████████████████████████░░ 84.8%                   │    │
│  │  [Expand Details ▼]                                 │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌── Event 2: Science Exam (10:30-12:00) ──────────────┐   │
│  │  Present: 30 | Absent: 2 | Late: 1                 │    │
│  │  ██████████████████████████░░ 90.9%                 │    │
│  │  [Expand Details ▼]                                 │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  📊 Day Total: 61 Present | 5 Absent | 3 Late              │
└─────────────────────────────────────────────────────────────┘
```

---

## Step 9: Institute-Wide Attendance Dashboard <a name="step-9"></a>

### 9.1 What This Shows

An overview of ALL attendance across the entire institute for a date range. Shows how many students attended, aggregated.

### 9.2 API Call

```
GET /api/attendance/institute/{instituteId}?startDate=2026-02-20&endDate=2026-02-25&page=1&limit=100
Authorization: Bearer {token}
```

**Important Limitation:**
- Maximum **5-day range** (backend enforces this to prevent heavy DynamoDB scans)
- For longer ranges, you must paginate with multiple API calls (e.g., Week 1, Week 2, Week 3...)

**Response:**
```json
{
  "success": true,
  "pagination": { "currentPage": 1, "totalPages": 2, "totalRecords": 150 },
  "data": [
    {
      "attendanceId": "att_...",
      "studentId": "456",
      "studentName": "Kasun Perera",
      "className": "Grade 10A",
      "subjectName": "Mathematics",
      "date": "2026-02-25",
      "status": "present",
      "markedAt": "2026-02-25T03:00:00.000Z"
    }
  ]
}
```

### 9.3 Building the Dashboard (Client-Side Aggregation)

Since the API returns raw records, you need to aggregate on the client side:

```typescript
interface DailySummary {
  date: string;
  present: number;
  absent: number;
  late: number;
  total: number;
  rate: number;
}

function aggregateByDate(records: any[]): DailySummary[] {
  const grouped = new Map<string, { present: number; absent: number; late: number; total: number }>();

  for (const rec of records) {
    const date = rec.date || rec.markedAt?.split('T')[0];
    if (!grouped.has(date)) {
      grouped.set(date, { present: 0, absent: 0, late: 0, total: 0 });
    }
    const g = grouped.get(date)!;
    g.total++;
    if (rec.status === 'present') g.present++;
    else if (rec.status === 'absent') g.absent++;
    else if (rec.status === 'late') g.late++;
  }

  return Array.from(grouped.entries()).map(([date, g]) => ({
    date,
    ...g,
    rate: g.total > 0 ? (g.present / g.total) * 100 : 0,
  }));
}

// For longer date ranges, fetch in 5-day windows
async function fetchMultiWeek(instituteId: string, startDate: string, endDate: string) {
  const allRecords: any[] = [];
  let current = new Date(startDate);
  const end = new Date(endDate);

  while (current <= end) {
    const windowEnd = new Date(current);
    windowEnd.setDate(windowEnd.getDate() + 4); // 5-day window
    if (windowEnd > end) windowEnd.setTime(end.getTime());

    const res = await apiCall('GET',
      `/api/attendance/institute/${instituteId}?startDate=${formatDate(current)}&endDate=${formatDate(windowEnd)}&limit=500`
    );
    allRecords.push(...res.data);

    current.setDate(current.getDate() + 5);
  }

  return allRecords;
}
```

### 9.4 Suggested UI — Institute Dashboard

```
┌─────────────────────────────────────────────────────────────┐
│  🏫 Institute Attendance Dashboard                          │
│  Suraksha Learning Academy                                  │
│                                                             │
│  Date Range: [2026-02-01] — [2026-02-28]  [Apply]          │
│                                                             │
│  ┌── Key Metrics ─────────────────────────────────────┐     │
│  │                                                    │     │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐         │     │
│  │  │ Average  │  │ Working  │  │ Total    │         │     │
│  │  │ Rate     │  │ Days     │  │ Records  │         │     │
│  │  │  87.3%   │  │   19     │  │  3,249   │         │     │
│  │  │ 📈 +2.1% │  │          │  │          │         │     │
│  │  └──────────┘  └──────────┘  └──────────┘         │     │
│  │                                                    │     │
│  └────────────────────────────────────────────────────┘     │
│                                                             │
│  ┌── Daily Attendance Bar Chart ──────────────────────┐     │
│  │                                                    │     │
│  │  100% ┤                                            │     │
│  │   90% ┤ ██ ██    ██ ██       ██ ██ ██ ██ ██        │     │
│  │   80% ┤ ██ ██ ██ ██ ██    ██ ██ ██ ██ ██ ██ ██     │     │
│  │   70% ┤ ██ ██ ██ ██ ██    ██ ██ ██ ██ ██ ██ ██     │     │
│  │   60% ┤                                            │     │
│  │       └──────────────────────────────────────      │     │
│  │        2  3  4  5  6    9 10 11 12 13 16 17 ...    │     │
│  │                                                    │     │
│  │  🟢 Present  🔴 Absent  🟡 Late                    │     │
│  └────────────────────────────────────────────────────┘     │
│                                                             │
│  ┌── Class-wise Breakdown ────────────────────────────┐     │
│  │  Class       │ Rate  │ Present │ Absent │ Late     │     │
│  │  Grade 10A   │ 92.1% │ 612     │ 38     │ 14       │     │
│  │  Grade 10B   │ 85.4% │ 543     │ 76     │ 17       │     │
│  │  Grade 11A   │ 89.7% │ 598     │ 52     │ 17       │     │
│  │  Grade 11B   │ 81.2% │ 518     │ 98     │ 22       │     │
│  └────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

---

## Step 10: Class Attendance View <a name="step-10"></a>

### 10.1 API Call

```
GET /api/attendance/institute/{instituteId}/class/{classId}?startDate=2026-02-20&endDate=2026-02-25&page=1&limit=100
Authorization: Bearer {token}
```

Same 5-day limit. Same response structure as institute-wide, but filtered to one class.

### 10.2 Suggested UI — Class Attendance

```
┌─────────────────────────────────────────────────────────────┐
│  📚 Class Attendance — Grade 10A                            │
│  📅 2026-02-20 to 2026-02-25                                │
│                                                             │
│  ┌── Student Attendance Table ────────────────────────┐     │
│  │                                                    │     │
│  │  Student         │ Mon │ Tue │ Wed │ Thu │ Fri     │     │
│  │  ─────────────── │ ─── │ ─── │ ─── │ ─── │ ───     │     │
│  │  Kasun Perera    │ ✅  │ ✅  │ ✅  │ ✅  │ ✅      │     │
│  │  Nimali Silva    │ ✅  │ ❌  │ ✅  │ ✅  │ ✅      │     │
│  │  Sahan Fernando  │ ⏰  │ ✅  │ ✅  │ ❌  │ ⏰      │     │
│  │  Amaya Jayasinghe│ ✅  │ ✅  │ ❌  │ ✅  │ ✅      │     │
│  │                                                    │     │
│  └────────────────────────────────────────────────────┘     │
│                                                             │
│  📊 Class Average: 88.5%                                    │
│  🏆 Best Day: Tuesday (95.2%)                               │
│  ⚠️ Worst Day: Thursday (80.1%)                             │
└─────────────────────────────────────────────────────────────┘
```

### 10.3 Building the Student×Day Grid

```typescript
interface StudentDayGrid {
  students: Array<{
    studentId: string;
    studentName: string;
    days: Map<string, 'present' | 'absent' | 'late' | 'left' | 'left_early' | 'left_lately' | null>;
    rate: number;
  }>;
  dates: string[];
}

function buildStudentDayGrid(records: any[], dates: string[]): StudentDayGrid {
  const studentMap = new Map<string, Map<string, string>>();

  for (const rec of records) {
    const date = rec.date || rec.markedAt?.split('T')[0];
    if (!studentMap.has(rec.studentId)) {
      studentMap.set(rec.studentId, new Map());
    }
    studentMap.get(rec.studentId)!.set(date, rec.status);
  }

  const students = Array.from(studentMap.entries()).map(([studentId, dayMap]) => {
    const total = dates.length;
    const present = dates.filter(d => dayMap.get(d) === 'present').length;
    
    return {
      studentId,
      studentName: records.find(r => r.studentId === studentId)?.studentName || studentId,
      days: dayMap,
      rate: total > 0 ? (present / total) * 100 : 0,
    };
  });

  return { students, dates };
}
```

---

## Step 11: Subject Attendance View <a name="step-11"></a>

### 11.1 API Call

```
GET /api/attendance/institute/{instituteId}/class/{classId}/subject/{subjectId}?startDate=2026-02-20&endDate=2026-02-25&page=1&limit=100
Authorization: Bearer {token}
```

Same structure as class attendance, filtered to one subject. Useful for: "How is Grade 10A doing in Mathematics specifically?"

### 11.2 Use Case: Compare Subject Attendance

Fetch attendance for multiple subjects and display a comparison:

```typescript
async function fetchSubjectComparison(instituteId: string, classId: string, subjectIds: string[]) {
  const results = await Promise.all(
    subjectIds.map(subjectId =>
      apiCall('GET',
        `/api/attendance/institute/${instituteId}/class/${classId}/subject/${subjectId}?startDate=2026-02-01&endDate=2026-02-05&limit=500`
      ).then(res => ({
        subjectId,
        subjectName: res.data[0]?.subjectName || subjectId,
        records: res.data,
      }))
    )
  );
  return results;
}
```

```
┌─────────────────────────────────────────────────────────────┐
│  📊 Subject Comparison — Grade 10A                          │
│                                                             │
│  Subject        │ Attendance Rate  │  Trend                 │
│  ─────────────── │ ──────────────── │  ─────                 │
│  Mathematics    │ ██████████ 92.1% │  📈 +1.5%              │
│  Science        │ █████████░ 87.3% │  📉 -0.8%              │
│  English        │ █████████░ 89.5% │  📈 +2.0%              │
│  History        │ ████████░░ 78.2% │  📉 -3.1%              │
│  Sinhala        │ █████████░ 91.0% │  ➡️ 0.0%               │
└─────────────────────────────────────────────────────────────┘
```

---

## Step 12: Charts & Analytics — Detailed Implementation <a name="step-12"></a>

### 12.1 Recommended Chart Libraries

| Library | Best For | Bundle Size | Notes |
|---------|----------|-------------|-------|
| **Recharts** | React apps | ~45KB | Declarative, easy to use |
| **Chart.js + react-chartjs-2** | Any framework | ~65KB | Most popular |
| **ApexCharts** | Dashboards | ~130KB | Beautiful defaults |
| **Lightweight-charts** | Time series | ~45KB | TradingView style |

### 12.2 Chart 1: Daily Attendance Bar Chart (Stacked)

**Data source:** Institute-wide attendance + calendar days (combine both to know working vs non-working days)

```typescript
// Fetch both calendar days AND attendance for the same period
async function getDailyChartData(instituteId: string, startDate: string, endDate: string) {
  // Step 1: Get calendar days to know which are working days
  const calendarRes = await apiCall('GET',
    `/institutes/${instituteId}/calendar/days?startDate=${startDate}&endDate=${endDate}&limit=400`
  );
  
  // Step 2: Get attendance records (in 5-day windows)
  const attendanceRecords = await fetchMultiWeek(instituteId, startDate, endDate);
  
  // Step 3: Combine
  const chartData = calendarRes.data
    .filter(day => day.isAttendanceExpected) // Only working days
    .map(day => {
      const dayRecords = attendanceRecords.filter(r => r.date === day.calendarDate);
      return {
        date: day.calendarDate,
        dayType: day.dayType,
        present: dayRecords.filter(r => r.status === 'present').length,
        absent: dayRecords.filter(r => r.status === 'absent').length,
        late: dayRecords.filter(r => r.status === 'late').length,
        total: dayRecords.length,
      };
    });
    
  return chartData;
}
```

**Recharts implementation:**
```tsx
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';

function DailyAttendanceChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data}>
        <XAxis dataKey="date" tickFormatter={d => new Date(d).toLocaleDateString('en-LK', { day: 'numeric', month: 'short' })} />
        <YAxis />
        <Tooltip />
        <Legend />
        <Bar dataKey="present" stackId="a" fill="#22C55E" name="Present" />
        <Bar dataKey="late" stackId="a" fill="#F59E0B" name="Late" />
        <Bar dataKey="absent" stackId="a" fill="#EF4444" name="Absent" />
      </BarChart>
    </ResponsiveContainer>
  );
}
```

### 12.3 Chart 2: Donut Chart — Status Breakdown

**Best for:** Student attendance history, event attendance summary

```tsx
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

const COLORS = {
  present: '#22C55E',
  absent: '#EF4444',
  late: '#F59E0B',
  left: '#3B82F6',
  left_early: '#8B5CF6',
  left_lately: '#6B7280',
};

function StatusDonutChart({ summary }) {
  const data = [
    { name: 'Present', value: summary.totalPresent, color: COLORS.present },
    { name: 'Absent', value: summary.totalAbsent, color: COLORS.absent },
    { name: 'Late', value: summary.totalLate, color: COLORS.late },
    { name: 'Left', value: summary.totalLeft, color: COLORS.left },
    { name: 'Left Early', value: summary.totalLeftEarly, color: COLORS.left_early },
    { name: 'Left Lately', value: summary.totalLeftLately, color: COLORS.left_lately },
  ].filter(d => d.value > 0);

  return (
    <ResponsiveContainer width="100%" height={250}>
      <PieChart>
        <Pie data={data} innerRadius={60} outerRadius={100} dataKey="value" label>
          {data.map((entry, index) => (
            <Cell key={index} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip />
      </PieChart>
    </ResponsiveContainer>
  );
}
```

### 12.4 Chart 3: Attendance Trend Line (Weekly/Monthly)

**Data source:** Aggregate student history over time

```tsx
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

function AttendanceTrendChart({ monthlyData }) {
  // monthlyData = [{ month: 'Jan', rate: 85.2 }, { month: 'Feb', rate: 87.3 }, ...]
  return (
    <ResponsiveContainer width="100%" height={250}>
      <LineChart data={monthlyData}>
        <XAxis dataKey="month" />
        <YAxis domain={[0, 100]} />
        <Tooltip formatter={(v) => `${v}%`} />
        <ReferenceLine y={85} stroke="#F59E0B" strokeDasharray="5 5" label="Target: 85%" />
        <Line type="monotone" dataKey="rate" stroke="#3B82F6" strokeWidth={2} dot />
      </LineChart>
    </ResponsiveContainer>
  );
}
```

### 12.5 Chart 4: Calendar Heatmap (GitHub-style)

Shows attendance at a glance for an entire academic year.

```tsx
// Using react-calendar-heatmap
import CalendarHeatmap from 'react-calendar-heatmap';
import 'react-calendar-heatmap/dist/styles.css';

function AttendanceHeatmap({ studentId, instituteId }) {
  const [values, setValues] = useState([]);

  useEffect(() => {
    // Fetch full year of attendance
    fetchMultiWeek(instituteId, '2026-01-01', '2026-12-31').then(records => {
      const filtered = records.filter(r => r.studentId === studentId);
      const dateMap = new Map();
      for (const rec of filtered) {
        const date = rec.date || rec.markedAt?.split('T')[0];
        const score = rec.status === 'present' ? 4 : rec.status === 'late' ? 2 : 1;
        dateMap.set(date, Math.max(dateMap.get(date) || 0, score));
      }
      setValues(Array.from(dateMap.entries()).map(([date, count]) => ({ date, count })));
    });
  }, [studentId, instituteId]);

  return (
    <CalendarHeatmap
      startDate={new Date('2026-01-01')}
      endDate={new Date('2026-12-31')}
      values={values}
      classForValue={(value) => {
        if (!value) return 'color-empty';
        return `color-scale-${value.count}`;
      }}
      tooltipDataAttrs={(value) => ({
        'data-tip': value?.date ? `${value.date}: ${value.count === 4 ? 'Present' : value.count === 2 ? 'Late' : 'Absent'}` : 'No data',
      })}
    />
  );
}

// CSS for heatmap colors
// .color-empty { fill: #ebedf0; }
// .color-scale-1 { fill: #EF4444; }  /* Absent = red */
// .color-scale-2 { fill: #F59E0B; }  /* Late = yellow */
// .color-scale-4 { fill: #22C55E; }  /* Present = green */
```

### 12.6 Chart 5: Radar Chart — Multi-Subject View

Compare a student's attendance across subjects:

```tsx
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from 'recharts';

function SubjectRadarChart({ subjectData }) {
  // subjectData = [
  //   { subject: 'Math', rate: 92 },
  //   { subject: 'Science', rate: 87 },
  //   { subject: 'English', rate: 95 },
  //   { subject: 'History', rate: 78 },
  //   { subject: 'Sinhala', rate: 91 },
  // ]
  return (
    <ResponsiveContainer width="100%" height={300}>
      <RadarChart data={subjectData}>
        <PolarGrid />
        <PolarAngleAxis dataKey="subject" />
        <PolarRadiusAxis domain={[0, 100]} />
        <Radar dataKey="rate" stroke="#3B82F6" fill="#3B82F6" fillOpacity={0.3} />
      </RadarChart>
    </ResponsiveContainer>
  );
}
```

---

## Step 13: Parent Portal — View Child's Attendance <a name="step-13"></a>

### 13.1 What Happens Behind the Scenes

1. Parent logs in → JWT contains their `userId` and `globalRole` (which includes PARENT role)
2. Backend has a parent-child relationship: parent's `childId` is stored
3. Parent calls the same student attendance API with their child's `studentId`
4. Backend verifies: "Is this parent authorized to see this student's data?"
5. Returns the same attendance records as Step 5

### 13.2 API Calls for Parent

**Get child's attendance history (same as student history):**
```
GET /api/attendance/student/{childStudentId}?instituteId=101&startDate=2026-01-01&endDate=2026-02-25
Authorization: Bearer {parentToken}
```

The backend checks that the parent has a relationship with the student. If not, returns 403.

### 13.3 Suggested UI — Parent Dashboard

```
┌─────────────────────────────────────────────────────────────┐
│  👨‍👩‍👧 Parent Dashboard — Welcome, Mr. Perera                 │
│                                                             │
│  Your Children:                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  👦 Kasun Perera — Grade 10A — Suraksha Academy     │    │
│  │  This Month: 92.1% attendance | 📈 +3.2% vs last   │    │
│  │  [View Details →]                                   │    │
│  └─────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  👧 Kavindi Perera — Grade 7B — Suraksha Academy    │    │
│  │  This Month: 87.5% attendance | 📉 -1.1% vs last   │    │
│  │  [View Details →]                                   │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌── Today ───────────────────────────────────────────┐     │
│  │  📅 February 25 — REGULAR Day                       │     │
│  │                                                    │     │
│  │  Kasun: ⏳ Not marked yet (classes started at 08:00)│     │
│  │  Kavindi: ✅ Present — marked at 08:05 AM           │     │
│  └────────────────────────────────────────────────────┘     │
│                                                             │
│  ┌── This Week ───────────────────────────────────────┐     │
│  │  Mon  Tue  Wed  Thu  Fri                            │     │
│  │  Kasun:  ✅   ✅   ✅   ✅   ⏳                     │     │
│  │  Kavindi:✅   ❌   ✅   ✅   ✅                     │     │
│  └────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

---

## Step 14: Parent — View Child's Event Attendance <a name="step-14"></a>

### 14.1 API Call

```
GET /api/attendance/calendar/institute/{instituteId}/student/{studentId}/event/{eventId}
Authorization: Bearer {parentToken}
```

**Roles that can access:** SUPERADMIN, instituteAdmin, teacher, attendanceMarker, student (own), parent (of child)

**Response:**
```json
{
  "success": true,
  "data": {
    "studentId": "456",
    "studentName": "Kasun Perera",
    "eventId": "8905",
    "eventTitle": "Term 1 Mathematics Exam",
    "attendance": {
      "status": "present",
      "markedAt": "2026-02-11T02:30:00.000Z",
      "markingMethod": "manual",
      "remarks": null
    }
  }
}
```

### 14.2 Suggested UI — Parent Event Detail

```
┌─────────────────────────────────────────────────────────────┐
│  📝 Event Attendance — Kasun Perera                         │
│                                                             │
│  Event: Term 1 Mathematics Exam                             │
│  Date: February 11, 2026                                    │
│  Time: 08:00 — 10:00                                        │
│  Venue: Main Hall                                           │
│                                                             │
│  Status: ✅ Present                                         │
│  Marked at: 08:30 AM                                        │
│  Method: Manual                                             │
│                                                             │
│  [← Back to Calendar]                                       │
└─────────────────────────────────────────────────────────────┘
```

---

## Step 15: Responsive Design & Mobile Considerations <a name="step-15"></a>

### 15.1 Mobile Layout Rules

| Component | Desktop | Mobile |
|-----------|---------|--------|
| Calendar grid | 7-column grid | Scrollable list or compact 7-col |
| Attendance table | Full table | Card list (one card per student) |
| Charts | Side by side | Stacked vertically |
| Bulk marking | Full table | Swipe cards per student |
| Stats cards | Row of 3-4 | Row of 2 + scroll |

### 15.2 Mobile-First Calendar (Cards Instead of Grid)

```
┌─────────────────────────────────┐
│  📅 This Week                   │
│                                 │
│  ┌─────────────────────────┐    │
│  │ Mon, Feb 23             │    │
│  │ 🟢 REGULAR | 08:00-15:00│    │
│  │ ✅ Present (09:05 AM)   │    │
│  └─────────────────────────┘    │
│  ┌─────────────────────────┐    │
│  │ Tue, Feb 24             │    │
│  │ 🟢 REGULAR | 08:00-15:00│    │
│  │ ✅ Present (08:15 AM)   │    │
│  └─────────────────────────┘    │
│  ┌─────────────────────────┐    │
│  │ Wed, Feb 25             │    │
│  │ 🟢 REGULAR | 08:00-15:00│    │
│  │ ⏳ Not marked yet       │    │
│  └─────────────────────────┘    │
│                                 │
│  [View Full Calendar →]         │
└─────────────────────────────────┘
```

### 15.3 Touch-Friendly Bulk Marking

```
┌─────────────────────────────────┐
│  📋 Mark Attendance             │
│  Grade 10A — Mathematics        │
│                                 │
│  ┌─────────────────────────┐    │
│  │  👦 Kasun Perera        │    │
│  │  [ ✅ ]  [ ❌ ]  [ ⏰ ] │    │
│  └─────────────────────────┘    │
│  ┌─────────────────────────┐    │
│  │  👧 Nimali Silva        │    │
│  │  [ ✅ ]  [ ❌ ]  [ ⏰ ] │    │
│  └─────────────────────────┘    │
│  ┌─────────────────────────┐    │
│  │  👦 Sahan Fernando      │    │
│  │  [ ✅ ]  [ ❌ ]  [ ⏰ ] │    │
│  └─────────────────────────┘    │
│                                 │
│  [Submit 33 Students]           │
└─────────────────────────────────┘
```

---

## Appendix C: Complete API Quick Reference <a name="appendix-c"></a>

### Attendance CRUD

| Action | Method | Endpoint | Roles |
|--------|--------|----------|-------|
| Mark single | `POST` | `/api/attendance/mark` | Admin, Teacher, Marker |
| Mark bulk | `POST` | `/api/attendance/mark-bulk` | Admin, Teacher, Marker |
| Mark by card | `POST` | `/api/attendance/mark-by-card` | Admin, Teacher, Marker |
| Mark bulk by card | `POST` | `/api/attendance/mark-bulk-by-card` | Admin, Teacher, Marker |
| Mark by inst. card | `POST` | `/api/attendance/mark-by-institute-card` | Admin, Teacher, Marker |
| Student history | `GET` | `/api/attendance/student/:studentId` | All authenticated |
| By card ID | `GET` | `/api/attendance/by-cardId/:cardId` | All authenticated |
| Institute wide | `GET` | `/api/attendance/institute/:instituteId` | Admin, Teacher, Marker |
| Class attendance | `GET` | `/api/attendance/institute/:id/class/:classId` | Admin, Teacher, Marker |
| Subject attendance | `GET` | `/api/attendance/institute/:id/class/:cid/subject/:sid` | Admin, Teacher, Marker |
| Look up card user | `GET` | `/api/attendance/institute-card-user` | Admin, Teacher, Marker |

### Calendar Queries (Read-only for users)

| Action | Method | Endpoint | Roles |
|--------|--------|----------|-------|
| Today's day | `GET` | `/institutes/:id/calendar/today` | All authenticated |
| List days | `GET` | `/institutes/:id/calendar/days` | All authenticated |
| Day events | `GET` | `/institutes/:id/calendar/days/:dayId/events` | All authenticated |
| Default event | `GET` | `/institutes/:id/calendar/days/:dayId/default-event` | All authenticated |

### Calendar-Linked Attendance Queries

| Action | Method | Endpoint | Roles |
|--------|--------|----------|-------|
| By event | `GET` | `/api/attendance/calendar/institute/:id/event/:eid` | Admin, Teacher, Marker |
| By calendar day | `GET` | `/api/attendance/calendar/institute/:id/calendar-day/:cdId` | Admin, Teacher, Marker |
| By user type | `GET` | `/api/attendance/calendar/institute/:id/user-type/:type` | Admin, Teacher, Marker |
| Student event | `GET` | `/api/attendance/calendar/institute/:id/student/:sid/event/:eid` | Admin, Teacher, Marker, Student(self), Parent |

---

## Appendix D: Date/Time Handling (Sri Lanka / Asia Colombo) <a name="appendix-d"></a>

### Important: The Backend Uses UTC

All `markedAt` timestamps are stored in UTC. Display them in Sri Lanka time (UTC+5:30):

```typescript
function toSriLankaTime(utcDateStr: string): string {
  const date = new Date(utcDateStr);
  return date.toLocaleString('en-LK', {
    timeZone: 'Asia/Colombo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

// Example:
// "2026-02-25T03:00:00.000Z" → "8:30 AM" (Colombo time)
```

### Date Format for API Calls

Always use `YYYY-MM-DD` format for dates:

```typescript
function formatDateForApi(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
```

### Time Format for Display

Calendar days have `startTime` and `endTime` in `HH:MM:SS` format. Convert for display:

```typescript
function formatTime(timeStr: string | null): string {
  if (!timeStr) return '—';
  const [hours, minutes] = timeStr.split(':');
  const h = parseInt(hours);
  const period = h >= 12 ? 'PM' : 'AM';
  const displayH = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${displayH}:${minutes} ${period}`;
}

// "08:00:00" → "8:00 AM"
// "15:00:00" → "3:00 PM"
```

---

> **Previous Part:** [FRONTEND_USER_GUIDE_PART1.md](FRONTEND_USER_GUIDE_PART1.md) — Today's Dashboard, Marking, Student History, Calendar View  
> **Admin Guide:** [FRONTEND_ADMIN_GUIDE_PART1.md](FRONTEND_ADMIN_GUIDE_PART1.md) — System Admin Calendar & Attendance Management
