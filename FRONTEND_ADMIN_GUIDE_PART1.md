# System Admin Frontend Implementation Guide — Part 1

## Calendar Management, Operating Config & Event CRUD

> **For:** Frontend developers building the **Admin Panel** for institute administrators & super admins  
> **Backend:** NestJS + MySQL (calendar) + DynamoDB (attendance)  
> **Auth:** JWT Bearer token | Roles: `SUPERADMIN`, `instituteAdmin`  
> **Base URL:** `/institutes/:instituteId/calendar` (all calendar management)

---

## Table of Contents

1. [Admin System Overview — Before vs After](#1-admin-overview)
2. [Step 1: Admin Dashboard Landing Page](#step-1)
3. [Step 2: Configure Weekly Operating Schedule](#step-2)
4. [Step 3: Generate Academic Year Calendar](#step-3)
5. [Step 4: Calendar Day Management (View, Edit, Delete)](#step-4)
6. [Step 5: Event Management (Create, Edit, Delete)](#step-5)
7. [Step 6: Bulk Day Updates & Day Type Management](#step-6)
8. [Step 7: Cache Management & Diagnostics](#step-7)
9. [Appendix E: Admin Form Validation Rules](#appendix-e)

---

## 1. Admin System Overview — Before vs After <a name="1-admin-overview"></a>

### Before (No Calendar System)

```
┌──────────────────────────────┐
│  Old Admin Panel             │
│                              │
│  • No calendar management    │
│  • No holiday definitions    │
│  • No event tracking         │
│  • Attendance = just marks   │
│    with no day context       │
│  • No way to set operating   │
│    hours per day-of-week     │
│  • No academic year concept  │
│  • Cannot generate calendar  │
│    for the year              │
│  • Cannot override specific  │
│    days (half-day, cancelled)│
└──────────────────────────────┘

Admin had to:
1. Manually track which days were holidays (spreadsheet or memory)
2. No way to tell the system "this day is a holiday, don't expect attendance"
3. Attendance reports showed 0% for holidays (misleading)
4. No events — couldn't track "who attended the parents meeting"
```

### After (Full Calendar-Aware System)

```
┌──────────────────────────────────────────────────────────────┐
│  New Admin Panel                                             │
│                                                              │
│  ┌── Setup (One-time) ────────────────────────────────────┐  │
│  │  1. Configure weekly schedule (Mon-Sun operating hours)│  │
│  │  2. Generate calendar for academic year (365+ days)    │  │
│  │     • Auto-marks weekends, holidays, term breaks       │  │
│  │     • Creates default REGULAR_CLASS event per day      │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌── Ongoing Management ──────────────────────────────────┐  │
│  │  3. Override specific days (change REGULAR → HALF_DAY) │  │
│  │  4. Create events for specific days (exams, meetings)  │  │
│  │  5. Monitor attendance linked to calendar & events     │  │
│  │  6. View cache diagnostics & invalidate if needed      │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌── Reports ─────────────────────────────────────────────┐  │
│  │  7. View attendance by event / day / user type         │  │
│  │  8. Institute-wide / class / subject dashboards        │  │
│  │  9. Calendar overview with attendance overlay          │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘

Admin can now:
1. Generate a full year's calendar in ONE API call
2. All public holidays & term breaks are auto-marked
3. Override any day: cancel it, make it half-day, add a special event
4. Track attendance per event: "Who came to the Science Exam?"
5. Dashboard shows accurate working-day-only attendance rates
6. Cache ensures "today's day" is fetched in sub-millisecond
```

---

## Step 1: Admin Dashboard Landing Page <a name="step-1"></a>

### 1.1 What to Show

The admin dashboard should summarize the current state of the calendar system:

```
┌─────────────────────────────────────────────────────────────┐
│  🏫 Admin Panel — Suraksha Learning Academy                 │
│                                                             │
│  ┌── Calendar Status ─────────────────────────────────┐     │
│  │                                                    │     │
│  │  Academic Year 2026: ✅ GENERATED                   │     │
│  │  Total Days: 365                                   │     │
│  │  Working Days: 196  │  Holidays: 62  │  Weekends: 107│    │
│  │  Events Created: 245                               │     │
│  │                                                    │     │
│  │  Operating Schedule: ✅ CONFIGURED                  │     │
│  │  Mon-Fri: 08:00-15:00  │  Sat-Sun: Non-operating   │     │
│  └────────────────────────────────────────────────────┘     │
│                                                             │
│  ┌── Today ───────────────────────────────────────────┐     │
│  │  📅 February 25, 2026 — 🟢 REGULAR                 │     │
│  │  Events: 1 (Regular Class Day)                      │     │
│  │  Attendance Status: 142/173 students marked (82.1%)│     │
│  └────────────────────────────────────────────────────┘     │
│                                                             │
│  ┌── Quick Actions ───────────────────────────────────┐     │
│  │                                                    │     │
│  │  [📅 View Calendar]     [⚙️ Operating Config]      │     │
│  │  [🆕 Generate Calendar] [📋 Create Event]          │     │
│  │  [📊 Attendance Reports] [🔧 Cache Management]     │     │
│  └────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 How to Build This Dashboard

The admin dashboard requires combining data from multiple API endpoints:

```typescript
async function loadAdminDashboard(instituteId: string) {
  // 1. Get today's calendar day
  const todayRes = await apiCall('GET', `/institutes/${instituteId}/calendar/today`);
  
  // 2. Get operating config
  const configRes = await apiCall('GET', `/institutes/${instituteId}/calendar/operating-config`);
  
  // 3. Get calendar days for the current academic year to count stats
  const year = new Date().getFullYear().toString();
  const daysRes = await apiCall('GET', 
    `/institutes/${instituteId}/calendar/days?academicYear=${year}&limit=400`
  );
  
  // 4. Count day types
  const dayStats = {
    total: daysRes.total || daysRes.data.length,
    working: daysRes.data.filter(d => d.isAttendanceExpected).length,
    holidays: daysRes.data.filter(d => ['PUBLIC_HOLIDAY', 'INSTITUTE_HOLIDAY'].includes(d.dayType)).length,
    weekends: daysRes.data.filter(d => d.dayType === 'WEEKEND').length,
    examDays: daysRes.data.filter(d => d.dayType === 'EXAM_DAY').length,
    halfDays: daysRes.data.filter(d => d.dayType === 'HALF_DAY').length,
    specialEvents: daysRes.data.filter(d => d.dayType === 'SPECIAL_EVENT').length,
    cancelled: daysRes.data.filter(d => d.dayType === 'CANCELLED').length,
  };
  
  return {
    today: todayRes.data,
    operatingConfig: configRes.data,
    dayStats,
    calendarGenerated: daysRes.total > 0,
  };
}
```

---

## Step 2: Configure Weekly Operating Schedule <a name="step-2"></a>

### 2.1 What This Does (Behind the Scenes)

The operating schedule defines the default for each day-of-week:
- Monday through Friday: operating from 08:00 to 15:00
- Saturday & Sunday: non-operating (weekend)

When the calendar is generated later, it uses this schedule to know:
- Which days are weekends (non-operating)
- What the default start/end times should be

### 2.2 Previous State vs Current State

| Before | After |
|--------|-------|
| No operating schedule | Full 7-day weekly config |
| Backend hardcoded Mon-Fri | Admin chooses which days operate |
| No start/end times | Per-day start/end times |
| Could only set one day at a time | **Bulk set all 7 days at once** |

### 2.3 API Calls

**Set single day config:**
```
POST /institutes/{instituteId}/calendar/operating-config
Authorization: Bearer {token}

{
  "dayOfWeek": 1,           // 1=Monday, 2=Tuesday, ..., 7=Sunday
  "isOperating": true,
  "startTime": "08:00",
  "endTime": "15:00",
  "academicYear": "2026"
}
```

**Set all days at once (recommended):**
```
POST /institutes/{instituteId}/calendar/operating-config/bulk
Authorization: Bearer {token}

{
  "academicYear": "2026",
  "configs": [
    { "dayOfWeek": 1, "isOperating": true, "startTime": "08:00", "endTime": "15:00" },
    { "dayOfWeek": 2, "isOperating": true, "startTime": "08:00", "endTime": "15:00" },
    { "dayOfWeek": 3, "isOperating": true, "startTime": "08:00", "endTime": "15:00" },
    { "dayOfWeek": 4, "isOperating": true, "startTime": "08:00", "endTime": "15:00" },
    { "dayOfWeek": 5, "isOperating": true, "startTime": "08:00", "endTime": "15:00" },
    { "dayOfWeek": 6, "isOperating": false },
    { "dayOfWeek": 7, "isOperating": false }
  ]
}
```

**Get current config:**
```
GET /institutes/{instituteId}/calendar/operating-config
Authorization: Bearer {token}
```

**Response:**
```json
{
  "success": true,
  "data": [
    { "dayOfWeek": 1, "dayName": "Monday", "isOperating": true, "startTime": "08:00", "endTime": "15:00" },
    { "dayOfWeek": 2, "dayName": "Tuesday", "isOperating": true, "startTime": "08:00", "endTime": "15:00" },
    { "dayOfWeek": 3, "dayName": "Wednesday", "isOperating": true, "startTime": "08:00", "endTime": "15:00" },
    { "dayOfWeek": 4, "dayName": "Thursday", "isOperating": true, "startTime": "08:00", "endTime": "15:00" },
    { "dayOfWeek": 5, "dayName": "Friday", "isOperating": true, "startTime": "08:00", "endTime": "15:00" },
    { "dayOfWeek": 6, "dayName": "Saturday", "isOperating": false, "startTime": null, "endTime": null },
    { "dayOfWeek": 7, "dayName": "Sunday", "isOperating": false, "startTime": null, "endTime": null }
  ]
}
```

### 2.4 Suggested UI — Weekly Schedule Configuration

```
┌─────────────────────────────────────────────────────────────┐
│  ⚙️ Weekly Operating Schedule — Academic Year: [2026 ▼]     │
│                                                             │
│  💡 Set the default operating hours for each day of the     │
│     week. This is used when generating the calendar.        │
│                                                             │
│  ┌─────────┬───────────┬──────────────┬──────────────┐      │
│  │  Day    │ Operating │ Start Time   │ End Time     │      │
│  ├─────────┼───────────┼──────────────┼──────────────┤      │
│  │ Monday  │ [✅ On]   │ [08:00 ▼]    │ [15:00 ▼]    │      │
│  │ Tuesday │ [✅ On]   │ [08:00 ▼]    │ [15:00 ▼]    │      │
│  │ Wednesday│ [✅ On]  │ [08:00 ▼]    │ [15:00 ▼]    │      │
│  │ Thursday│ [✅ On]   │ [08:00 ▼]    │ [15:00 ▼]    │      │
│  │ Friday  │ [✅ On]   │ [08:00 ▼]    │ [15:00 ▼]    │      │
│  │ Saturday│ [❌ Off]  │ — disabled — │ — disabled — │      │
│  │ Sunday  │ [❌ Off]  │ — disabled — │ — disabled — │      │
│  └─────────┴───────────┴──────────────┴──────────────┘      │
│                                                             │
│  Common Presets:                                            │
│  [Mon-Fri 8-3] [Mon-Sat 8-1] [6-Day Week] [Custom]         │
│                                                             │
│                         [💾 Save All]  [↩ Reset]            │
└─────────────────────────────────────────────────────────────┘
```

### 2.5 Implementation

```typescript
interface OperatingConfig {
  dayOfWeek: number;    // 1-7
  isOperating: boolean;
  startTime: string;    // "HH:MM"
  endTime: string;      // "HH:MM"
}

function OperatingScheduleForm({ instituteId }: { instituteId: string }) {
  const [configs, setConfigs] = useState<OperatingConfig[]>([
    { dayOfWeek: 1, isOperating: true, startTime: '08:00', endTime: '15:00' },
    { dayOfWeek: 2, isOperating: true, startTime: '08:00', endTime: '15:00' },
    { dayOfWeek: 3, isOperating: true, startTime: '08:00', endTime: '15:00' },
    { dayOfWeek: 4, isOperating: true, startTime: '08:00', endTime: '15:00' },
    { dayOfWeek: 5, isOperating: true, startTime: '08:00', endTime: '15:00' },
    { dayOfWeek: 6, isOperating: false, startTime: '', endTime: '' },
    { dayOfWeek: 7, isOperating: false, startTime: '', endTime: '' },
  ]);
  const [academicYear, setAcademicYear] = useState('2026');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadExistingConfig();
  }, [instituteId]);

  async function loadExistingConfig() {
    try {
      const res = await apiCall('GET', `/institutes/${instituteId}/calendar/operating-config`);
      if (res.data && res.data.length > 0) {
        setConfigs(res.data.map(d => ({
          dayOfWeek: d.dayOfWeek,
          isOperating: d.isOperating,
          startTime: d.startTime || '08:00',
          endTime: d.endTime || '15:00',
        })));
      }
    } catch (e) {
      // No config yet, keep defaults
    }
  }

  async function saveAll() {
    setSaving(true);
    try {
      await apiCall('POST', `/institutes/${instituteId}/calendar/operating-config/bulk`, {
        academicYear,
        configs: configs.map(c => ({
          dayOfWeek: c.dayOfWeek,
          isOperating: c.isOperating,
          ...(c.isOperating ? { startTime: c.startTime, endTime: c.endTime } : {}),
        })),
      });
      showToast({ type: 'success', message: 'Operating schedule saved!' });
    } catch (e) {
      showToast({ type: 'error', message: 'Failed to save schedule' });
    } finally {
      setSaving(false);
    }
  }

  // Preset: Mon-Fri 8-3
  function applyMonFri() {
    setConfigs(configs.map(c => ({
      ...c,
      isOperating: c.dayOfWeek <= 5,
      startTime: c.dayOfWeek <= 5 ? '08:00' : '',
      endTime: c.dayOfWeek <= 5 ? '15:00' : '',
    })));
  }

  return (
    <div>
      <select value={academicYear} onChange={e => setAcademicYear(e.target.value)}>
        <option value="2025">2025</option>
        <option value="2026">2026</option>
        <option value="2027">2027</option>
      </select>
      
      {configs.map((config, i) => (
        <DayRow
          key={config.dayOfWeek}
          config={config}
          onChange={(updated) => {
            const newConfigs = [...configs];
            newConfigs[i] = updated;
            setConfigs(newConfigs);
          }}
        />
      ))}
      
      <div className="presets">
        <button onClick={applyMonFri}>Mon-Fri 8-3</button>
      </div>
      
      <button onClick={saveAll} disabled={saving}>
        {saving ? 'Saving...' : 'Save All'}
      </button>
    </div>
  );
}
```

---

## Step 3: Generate Academic Year Calendar <a name="step-3"></a>

### 3.1 What Happens Behind the Scenes

This is the **most important admin action** — it creates the entire academic year's calendar in one API call:

1. Admin enters: academic year, start date, end date, public holidays, term breaks
2. Backend generates **one CalendarDay record per day** (e.g., 365 records for a full year)
3. For each day, backend auto-assigns:
   - **WEEKEND** if the day-of-week is non-operating (from Step 2 config)
   - **PUBLIC_HOLIDAY** if the date matches a holiday in the list
   - **INSTITUTE_HOLIDAY** for term break dates
   - **REGULAR** for all other operating days
4. For each REGULAR day, backend auto-creates a **default REGULAR_CLASS event**
5. All records stored in MySQL (calendar_days + calendar_events tables)

### 3.2 Previous State vs Current State

| Before | After |
|--------|-------|
| No calendar existed | Full 365-day calendar with events |
| Holidays tracked manually | Auto-marked from admin-provided list |
| No term breaks | Term breaks = INSTITUTE_HOLIDAY |
| No default events | Each regular day gets a REGULAR_CLASS event |
| No reuse — no "generate and done" | One-click generation for the year |

### 3.3 API Call

```
POST /institutes/{instituteId}/calendar/generate
Authorization: Bearer {token}

{
  "academicYear": "2026",
  "startDate": "2026-01-06",
  "endDate": "2026-12-20",
  "publicHolidays": [
    { "date": "2026-01-14", "title": "Tamil Thai Pongal Day" },
    { "date": "2026-01-15", "title": "Duruthu Full Moon Poya Day" },
    { "date": "2026-02-04", "title": "National Day" },
    { "date": "2026-02-12", "title": "Navam Full Moon Poya Day" },
    { "date": "2026-03-13", "title": "Medin Full Moon Poya Day" },
    { "date": "2026-04-13", "title": "Day prior to Sinhala/Tamil New Year" },
    { "date": "2026-04-14", "title": "Sinhala/Tamil New Year Day" },
    { "date": "2026-05-01", "title": "May Day" },
    { "date": "2026-05-11", "title": "Vesak Full Moon Poya Day" },
    { "date": "2026-05-12", "title": "Day following Vesak" },
    { "date": "2026-06-10", "title": "Poson Full Moon Poya Day" },
    { "date": "2026-12-25", "title": "Christmas Day" }
  ],
  "termBreaks": [
    { "startDate": "2026-04-06", "endDate": "2026-04-19", "title": "First Term Break" },
    { "startDate": "2026-08-01", "endDate": "2026-08-16", "title": "Second Term Break" },
    { "startDate": "2026-12-11", "endDate": "2026-12-20", "title": "Third Term Break" }
  ]
}
```

**Success response (201):**
```json
{
  "success": true,
  "message": "Calendar generated successfully for academic year 2026",
  "data": {
    "academicYear": "2026",
    "totalDays": 349,
    "breakdown": {
      "regular": 196,
      "weekend": 100,
      "publicHoliday": 12,
      "instituteHoliday": 41
    },
    "eventsCreated": 196
  }
}
```

**Error — Calendar already exists (409 Conflict):**
```json
{
  "success": false,
  "message": "Calendar already exists for academic year 2026. Delete it first if you want to regenerate."
}
```

### 3.4 Suggested UI — Calendar Generation Wizard

```
┌─────────────────────────────────────────────────────────────┐
│  🆕 Generate Academic Year Calendar                         │
│                                                             │
│  ━━ Step 1 of 3: Basic Info ━━━━━━━━━━━━━━━━━━━━━━━━━━     │
│                                                             │
│  Academic Year:  [2026          ]                           │
│  Start Date:     [2026-01-06    ]  📅                       │
│  End Date:       [2026-12-20    ]  📅                       │
│                                                             │
│  ℹ️ The calendar will generate one day record for each      │
│     date in the range. Operating schedule from Step 2       │
│     will be used for weekday/weekend detection.             │
│                                                             │
│                              [Next: Public Holidays →]      │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  🆕 Generate Academic Year Calendar                         │
│                                                             │
│  ━━ Step 2 of 3: Public Holidays ━━━━━━━━━━━━━━━━━━━━━     │
│                                                             │
│  💡 These dates will be marked as PUBLIC_HOLIDAY.           │
│     Attendance will NOT be expected on these days.          │
│                                                             │
│  [📋 Load Sri Lanka 2026 Public Holidays]  ← preset        │
│                                                             │
│  ┌───────────────┬────────────────────────────┬────────┐    │
│  │ Date          │ Title                      │ Action │    │
│  ├───────────────┼────────────────────────────┼────────┤    │
│  │ 2026-01-14    │ Tamil Thai Pongal Day      │ [🗑️]   │    │
│  │ 2026-01-15    │ Duruthu Full Moon Poya Day │ [🗑️]   │    │
│  │ 2026-02-04    │ National Day               │ [🗑️]   │    │
│  │ 2026-04-13    │ Day prior to S/T New Year  │ [🗑️]   │    │
│  │ 2026-04-14    │ Sinhala/Tamil New Year Day │ [🗑️]   │    │
│  │ 2026-05-01    │ May Day                    │ [🗑️]   │    │
│  │ 2026-05-11    │ Vesak Full Moon Poya Day   │ [🗑️]   │    │
│  │ 2026-05-12    │ Day following Vesak         │ [🗑️]   │    │
│  │ ...           │ ...                        │        │    │
│  └───────────────┴────────────────────────────┴────────┘    │
│                                                             │
│  [+ Add Holiday]                                            │
│                                                             │
│  [← Back]                      [Next: Term Breaks →]        │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  🆕 Generate Academic Year Calendar                         │
│                                                             │
│  ━━ Step 3 of 3: Term Breaks ━━━━━━━━━━━━━━━━━━━━━━━━     │
│                                                             │
│  💡 These date ranges will be marked as INSTITUTE_HOLIDAY.  │
│     Great for end-of-term breaks.                          │
│                                                             │
│  ┌─────────────────┬─────────────────┬────────────────┐     │
│  │ Start Date      │ End Date        │ Title          │     │
│  ├─────────────────┼─────────────────┼────────────────┤     │
│  │ [2026-04-06]    │ [2026-04-19]    │ First Term Br. │     │
│  │ [2026-08-01]    │ [2026-08-16]    │ Second Term Br.│     │
│  │ [2026-12-11]    │ [2026-12-20]    │ Third Term Br. │     │
│  └─────────────────┴─────────────────┴────────────────┘     │
│                                                             │
│  [+ Add Term Break]                                         │
│                                                             │
│  ━━ Summary ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━     │
│  Total days: ~349                                           │
│  Est. working days: ~196  │  Holidays: ~12  │  Weekends: ~100│
│  Term break days: ~41                                       │
│                                                             │
│  [← Back]              [🚀 Generate Calendar]               │
│                                                             │
│  ⚠️ This will create 349+ records. Cannot be undone easily. │
│     Review the settings above before proceeding.            │
└─────────────────────────────────────────────────────────────┘
```

### 3.5 Implementation with Validation

```typescript
interface GenerateCalendarForm {
  academicYear: string;
  startDate: string;
  endDate: string;
  publicHolidays: Array<{ date: string; title: string }>;
  termBreaks: Array<{ startDate: string; endDate: string; title: string }>;
}

// Validation rules
function validateCalendarForm(form: GenerateCalendarForm): string[] {
  const errors: string[] = [];
  
  if (!form.academicYear || !/^\d{4}$/.test(form.academicYear)) {
    errors.push('Academic year must be a 4-digit year (e.g., 2026)');
  }
  
  if (!form.startDate || !form.endDate) {
    errors.push('Start date and end date are required');
  }
  
  if (new Date(form.startDate) >= new Date(form.endDate)) {
    errors.push('Start date must be before end date');
  }
  
  // Check holidays are within range
  for (const h of form.publicHolidays) {
    if (h.date < form.startDate || h.date > form.endDate) {
      errors.push(`Holiday "${h.title}" (${h.date}) is outside the calendar date range`);
    }
    if (!h.title.trim()) {
      errors.push(`All holidays must have a title`);
    }
  }
  
  // Check term breaks are within range and don't overlap
  for (const tb of form.termBreaks) {
    if (tb.startDate < form.startDate || tb.endDate > form.endDate) {
      errors.push(`Term break "${tb.title}" is outside the calendar date range`);
    }
    if (new Date(tb.startDate) >= new Date(tb.endDate)) {
      errors.push(`Term break "${tb.title}" start must be before end`);
    }
  }
  
  // Check for duplicate holiday dates
  const holidayDates = form.publicHolidays.map(h => h.date);
  const uniqueDates = new Set(holidayDates);
  if (uniqueDates.size !== holidayDates.length) {
    errors.push('Duplicate holiday dates found');
  }
  
  return errors;
}

async function generateCalendar(instituteId: string, form: GenerateCalendarForm) {
  const errors = validateCalendarForm(form);
  if (errors.length > 0) {
    showErrors(errors);
    return;
  }

  const confirmed = await showConfirmDialog(
    'Generate Calendar',
    `This will create calendar records from ${form.startDate} to ${form.endDate}. Continue?`
  );
  
  if (!confirmed) return;

  try {
    const res = await apiCall('POST', `/institutes/${instituteId}/calendar/generate`, form);
    showToast({ type: 'success', message: res.message });
    
    // Show breakdown
    showDialog('Calendar Generated!', `
      Working days: ${res.data.breakdown.regular}
      Weekends: ${res.data.breakdown.weekend}
      Public holidays: ${res.data.breakdown.publicHoliday}
      Institute holidays: ${res.data.breakdown.instituteHoliday}
      Events created: ${res.data.eventsCreated}
    `);
  } catch (err) {
    if (err.status === 409) {
      showToast({ type: 'warning', message: 'Calendar already exists for this year. Delete it first to regenerate.' });
    }
  }
}
```

### 3.6 Deleting a Calendar (To Regenerate)

If the admin needs to regenerate (e.g., wrong holidays):

```
DELETE /institutes/{instituteId}/calendar/{academicYear}
Authorization: Bearer {token}
```

```json
{
  "success": true,
  "message": "Calendar for academic year 2026 deleted successfully",
  "data": { "deletedDays": 349, "deletedEvents": 196 }
}
```

**UI: Confirmation required**
```
⚠️ Delete Calendar for 2026?
This will permanently delete:
• 349 calendar days
• 196 events
• All calendar-day linkages in attendance records will be orphaned

This action cannot be undone!

[Cancel]  [🗑️ Delete and Regenerate]
```

---

## Step 4: Calendar Day Management (View, Edit, Delete) <a name="step-4"></a>

### 4.1 What This Is For

After generating the calendar, admins may need to modify individual days:
- Change a REGULAR day to HALF_DAY (e.g., school function)
- Cancel a day (emergency, weather)
- Add a title/description to a day
- Change operating hours for one specific day

### 4.2 API Calls

**List days (with filters):**
```
GET /institutes/{instituteId}/calendar/days?startDate=2026-02-01&endDate=2026-02-28&dayType=REGULAR
```

**Update a single day:**
```
PATCH /institutes/{instituteId}/calendar/days/{calendarDayId}
Authorization: Bearer {token}

{
  "dayType": "HALF_DAY",
  "title": "School Sports Preparation",
  "startTime": "08:00:00",
  "endTime": "12:00:00",
  "isAttendanceExpected": true
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Calendar day updated",
  "data": {
    "id": "4521",
    "calendarDate": "2026-02-25",
    "dayType": "HALF_DAY",
    "title": "School Sports Preparation",
    "startTime": "08:00:00",
    "endTime": "12:00:00",
    "isAttendanceExpected": true
  }
}
```

**Delete a day (rare — removes the day record entirely):**
```
DELETE /institutes/{instituteId}/calendar/days/{calendarDayId}
```

### 4.3 Suggested UI — Calendar Admin View with Edit

```
┌─────────────────────────────────────────────────────────────┐
│  📅 Calendar Management — February 2026                     │
│  [< Jan]                                      [Mar >]       │
│                                                             │
│  Filter: [All Types ▼]  [Attendance Expected ▼]             │
│                                                             │
│  ┌──────┬──────┬──────┬──────┬──────┬──────┬──────┐        │
│  │ Mon  │ Tue  │ Wed  │ Thu  │ Fri  │ Sat  │ Sun  │        │
│  ├──────┼──────┼──────┼──────┼──────┼──────┼──────┤        │
│  │  2   │  3   │  4   │  5   │  6   │  7   │  8   │        │
│  │ 🟢   │ 🟢   │ 🔴   │ 🟢   │ 🟢   │ 🔵   │ 🔵   │        │
│  │ [✏️]  │ [✏️]  │ [✏️]  │ [✏️]  │ [✏️]  │      │      │        │
│  └──────┴──────┴──────┴──────┴──────┴──────┴──────┘        │
│                                                             │
│  Click ✏️ to edit any day                                    │
└─────────────────────────────────────────────────────────────┘
```

### 4.4 Edit Day Modal

```
┌── Edit Calendar Day ────────────────────────────────┐
│                                                      │
│  📅 February 25, 2026                                │
│  Current: 🟢 REGULAR                                 │
│                                                      │
│  Day Type:   [HALF_DAY ▼]                            │
│              Options:                                │
│              • REGULAR                               │
│              • HALF_DAY                              │
│              • EXAM_DAY                              │
│              • STAFF_ONLY                            │
│              • SPECIAL_EVENT                         │
│              • CANCELLED                             │
│              • PUBLIC_HOLIDAY                        │
│              • INSTITUTE_HOLIDAY                     │
│                                                      │
│  Title:      [School Sports Preparation        ]     │
│  Start Time: [08:00 ▼]                               │
│  End Time:   [12:00 ▼]                               │
│  Attendance: [✅ Expected]                            │
│                                                      │
│  ⚠️ Changing day type affects attendance tracking     │
│     for this date.                                   │
│                                                      │
│  [Cancel]                    [💾 Save Changes]       │
└──────────────────────────────────────────────────────┘
```

---

## Step 5: Event Management (Create, Edit, Delete) <a name="step-5"></a>

### 5.1 What Events Are

Events are specific activities that happen on a calendar day. Examples:
- **REGULAR_CLASS** — auto-created for each working day during calendar generation
- **EXAM** — term exams, internal exams
- **PARENTS_MEETING** — parent-teacher conference
- **SPORTS_DAY** — annual athletics/sports day
- **CULTURAL_EVENT** — Vesak celebration, Christmas concert
- **FIELD_TRIP** — educational trips

Events can be:
- **Attendance-tracked** — the system records who attended this specific event
- **Linked to a calendar day** — belongs to a specific day
- **Scoped** — INSTITUTE-wide, CLASS-specific, or SUBJECT-specific
- **Mandatory or optional**

### 5.2 Create Event

```
POST /institutes/{instituteId}/calendar/events
Authorization: Bearer {token}

{
  "calendarDayId": "4521",          // Link to a specific day (optional)
  "calendarDate": "2026-02-25",     // Alternative: specify by date
  "eventType": "PARENTS_MEETING",
  "title": "Grade 10 Parents Meeting",
  "description": "Term 1 progress review with parents",
  "eventDate": "2026-02-25",
  "startTime": "14:00:00",
  "endTime": "16:00:00",
  "isAllDay": false,
  "isAttendanceTracked": true,
  "isDefault": false,
  "targetUserTypes": ["STUDENT", "PARENT"],
  "attendanceOpenTo": "TARGET_ONLY",
  "targetScope": "CLASS",
  "targetClassIds": ["201", "202"],
  "venue": "School Auditorium",
  "status": "SCHEDULED",
  "isMandatory": true,
  "notes": "Parents please bring report card"
}
```

**Success (201):**
```json
{
  "success": true,
  "message": "Event created successfully",
  "data": {
    "id": "8910",
    "eventType": "PARENTS_MEETING",
    "title": "Grade 10 Parents Meeting",
    "calendarDayId": "4521",
    "status": "SCHEDULED"
  }
}
```

### 5.3 Update Event

```
PATCH /institutes/{instituteId}/calendar/events/{eventId}
Authorization: Bearer {token}

{
  "status": "POSTPONED",
  "notes": "Postponed due to rain. New date TBD."
}
```

### 5.4 Delete Event

```
DELETE /institutes/{instituteId}/calendar/events/{eventId}
Authorization: Bearer {token}
```

### 5.5 Suggested UI — Create Event Form

```
┌─────────────────────────────────────────────────────────────┐
│  📋 Create New Event                                        │
│                                                             │
│  ┌── Basic Info ──────────────────────────────────────┐     │
│  │  Event Type: [PARENTS_MEETING ▼]                   │     │
│  │              • EXAM                                │     │
│  │              • PARENTS_MEETING                     │     │
│  │              • SPORTS_DAY                          │     │
│  │              • CULTURAL_EVENT                      │     │
│  │              • FIELD_TRIP                          │     │
│  │              • WORKSHOP                            │     │
│  │              • ORIENTATION                         │     │
│  │              • STAFF_MEETING                       │     │
│  │              • TRAINING                            │     │
│  │              • CUSTOM                              │     │
│  │                                                    │     │
│  │  Title:       [Grade 10 Parents Meeting        ]   │     │
│  │  Description: [Term 1 progress review...       ]   │     │
│  │  Venue:       [School Auditorium               ]   │     │
│  │  Meeting Link:[                                ]   │     │
│  └────────────────────────────────────────────────────┘     │
│                                                             │
│  ┌── Date & Time ─────────────────────────────────────┐     │
│  │  Calendar Day: [Feb 25, 2026 ▼] (picks calendarDayId)│   │
│  │  Start Time:   [14:00]                             │     │
│  │  End Time:     [16:00]                             │     │
│  │  All Day:      [❌ No]                              │     │
│  └────────────────────────────────────────────────────┘     │
│                                                             │
│  ┌── Attendance Settings ─────────────────────────────┐     │
│  │  Track Attendance:  [✅ Yes]                        │     │
│  │  Open To:           [TARGET_ONLY ▼]                │     │
│  │                     • TARGET_ONLY — only listed     │     │
│  │                     • ALL_ENROLLED — all students   │     │
│  │                     • ANYONE — open to all          │     │
│  │  Mandatory:         [✅ Yes]                        │     │
│  │  Max Participants:  [        ] (optional)           │     │
│  └────────────────────────────────────────────────────┘     │
│                                                             │
│  ┌── Target Scope ────────────────────────────────────┐     │
│  │  Scope: [CLASS ▼]                                  │     │
│  │         • INSTITUTE — entire institute             │     │
│  │         • CLASS — specific classes                 │     │
│  │         • SUBJECT — specific subjects              │     │
│  │                                                    │     │
│  │  Target Classes: [✅ Grade 10A] [✅ Grade 10B]      │     │
│  │                  [  Grade 11A] [  Grade 11B]       │     │
│  │                                                    │     │
│  │  Target Users:   [✅ STUDENT] [✅ PARENT]           │     │
│  │                  [  TEACHER] [  STAFF]             │     │
│  └────────────────────────────────────────────────────┘     │
│                                                             │
│  [Cancel]                         [📋 Create Event]         │
└─────────────────────────────────────────────────────────────┘
```

### 5.6 Events List View (for a specific day)

```
GET /institutes/{instituteId}/calendar/days/{calendarDayId}/events
```

```
┌─────────────────────────────────────────────────────────────┐
│  📋 Events — February 25, 2026                              │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  ⭐ Regular Class Day (Default Event)                │    │
│  │  📖 REGULAR_CLASS | 08:00-15:00                     │    │
│  │  Status: SCHEDULED  │  Tracked: ✅  │  Mandatory: ✅ │    │
│  │  [Edit] [View Attendance]                           │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Grade 10 Parents Meeting                            │    │
│  │  👨‍👩‍👧 PARENTS_MEETING | 14:00-16:00                    │    │
│  │  Status: SCHEDULED  │  Tracked: ✅  │  Mandatory: ✅ │    │
│  │  Scope: CLASS (Grade 10A, 10B)                      │    │
│  │  Venue: School Auditorium                           │    │
│  │  [Edit] [Delete] [View Attendance]                  │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  [+ Add Event to This Day]                                  │
└─────────────────────────────────────────────────────────────┘
```

---

## Step 6: Bulk Day Updates & Day Type Management <a name="step-6"></a>

### 6.1 Use Case: Emergency School Closure

Admin needs to quickly mark a week as CANCELLED (e.g., flood, pandemic):

**Strategy:** Use the PATCH endpoint for each day, or batch on the frontend:

```typescript
async function bulkUpdateDays(
  instituteId: string,
  startDate: string,
  endDate: string,
  updates: { dayType: string; title?: string; isAttendanceExpected?: boolean }
) {
  // 1. Fetch all days in range
  const res = await apiCall('GET',
    `/institutes/${instituteId}/calendar/days?startDate=${startDate}&endDate=${endDate}&limit=400`
  );

  // 2. Update each day (exclude weekends/holidays if desired)
  const targetDays = res.data.filter(d => d.dayType === 'REGULAR' || d.dayType === 'HALF_DAY');
  
  const results = [];
  for (const day of targetDays) {
    try {
      const updateRes = await apiCall('PATCH',
        `/institutes/${instituteId}/calendar/days/${day.id}`,
        {
          dayType: updates.dayType,
          title: updates.title || `Cancelled: ${day.calendarDate}`,
          isAttendanceExpected: updates.isAttendanceExpected ?? false,
        }
      );
      results.push({ date: day.calendarDate, success: true });
    } catch (err) {
      results.push({ date: day.calendarDate, success: false, error: err.message });
    }
  }

  return results;
}

// Usage: Mark Feb 24-28 as CANCELLED due to flooding
await bulkUpdateDays(instituteId, '2026-02-24', '2026-02-28', {
  dayType: 'CANCELLED',
  title: 'School closed — flooding',
  isAttendanceExpected: false,
});
```

### 6.2 Suggested UI — Bulk Day Update

```
┌─────────────────────────────────────────────────────────────┐
│  ⚡ Bulk Update Calendar Days                                │
│                                                             │
│  Select Date Range:                                         │
│  From: [2026-02-24]  To: [2026-02-28]                       │
│                                                             │
│  Apply To: [Only REGULAR days ▼]                            │
│            • All days in range                              │
│            • Only REGULAR days                              │
│            • Only HALF_DAY days                             │
│            • Only working days (attendance expected)         │
│                                                             │
│  New Settings:                                              │
│  Day Type:             [CANCELLED ▼]                        │
│  Title:                [School closed — flooding    ]       │
│  Attendance Expected:  [❌ No]                               │
│                                                             │
│  Preview: 5 days will be updated                            │
│  • Feb 24 (Mon) — REGULAR → CANCELLED                      │
│  • Feb 25 (Tue) — REGULAR → CANCELLED                      │
│  • Feb 26 (Wed) — REGULAR → CANCELLED                      │
│  • Feb 27 (Thu) — REGULAR → CANCELLED                      │
│  • Feb 28 (Fri) — REGULAR → CANCELLED                      │
│                                                             │
│  [Cancel]                   [⚡ Update 5 Days]              │
└─────────────────────────────────────────────────────────────┘
```

---

## Step 7: Cache Management & Diagnostics <a name="step-7"></a>

### 7.1 What the Cache Is

The "today's calendar day" endpoint is called very frequently (every time a teacher opens the marking screen, etc.). The backend caches this response for performance:

- **Cache key:** `calendar_today_{instituteId}`
- **TTL:** Auto-expires (configurable)
- **Cache hit:** Sub-millisecond response
- **Cache miss:** ~50-200ms (MySQL query)

### 7.2 API Calls

**View cache stats (admin/SUPERADMIN only):**
```
GET /institutes/{instituteId}/calendar/cache/stats
Authorization: Bearer {token}
```

```json
{
  "success": true,
  "data": {
    "cacheEnabled": true,
    "todayCacheKey": "calendar_today_101",
    "isCached": true,
    "cachedAt": "2026-02-25T02:30:00.000Z",
    "ttlRemaining": 3420
  }
}
```

**Invalidate cache manually:**
```
POST /institutes/{instituteId}/calendar/cache/invalidate
Authorization: Bearer {token}
```

```json
{
  "success": true,
  "message": "Cache invalidated for institute 101"
}
```

### 7.3 When to Invalidate

The cache auto-invalidates when days/events are modified. Manual invalidation is needed only if:
- Data appears stale
- After bulk database operations
- After debugging

### 7.4 Suggested UI — Cache Panel (Admin Only)

```
┌─────────────────────────────────────────────────────────────┐
│  🔧 Cache Management (Admin Only)                           │
│                                                             │
│  Today Cache:                                               │
│  Status:       ✅ Cached                                    │
│  Cached At:    8:00 AM (1h 30m ago)                         │
│  TTL Remaining: 57 minutes                                  │
│                                                             │
│  [🔄 Invalidate Cache]                                      │
│                                                             │
│  ⚠️ Only use this if today's data appears stale.            │
│     The cache auto-refreshes when you edit days/events.     │
└─────────────────────────────────────────────────────────────┘
```

---

## Appendix E: Admin Form Validation Rules <a name="appendix-e"></a>

### Operating Config

| Field | Validation |
|-------|-----------|
| `dayOfWeek` | Integer 1-7 (1=Monday) |
| `isOperating` | Boolean |
| `startTime` | Required if `isOperating=true`. Format: `HH:MM` |
| `endTime` | Required if `isOperating=true`. Must be after `startTime`. Format: `HH:MM` |
| `academicYear` | 4-digit string, e.g., `"2026"` |

### Generate Calendar

| Field | Validation |
|-------|-----------|
| `academicYear` | Required. 4-digit string |
| `startDate` | Required. `YYYY-MM-DD`. Must be before `endDate` |
| `endDate` | Required. `YYYY-MM-DD`. Must be after `startDate` |
| `publicHolidays` | Optional array. Each item: `{ date: "YYYY-MM-DD", title: "non-empty string" }` |
| `publicHolidays[].date` | Must be within startDate-endDate range |
| `termBreaks` | Optional array. Each: `{ startDate, endDate, title }` |
| `termBreaks[].startDate` | Must be before `termBreaks[].endDate` |
| `termBreaks[]` range | Must be within calendar startDate-endDate |

### Create Event

| Field | Validation |
|-------|-----------|
| `calendarDayId` or `calendarDate` | At least one required (not both) |
| `eventType` | Required. Must be valid CalendarEventType enum |
| `title` | Required. Non-empty string |
| `eventDate` | Required. `YYYY-MM-DD` |
| `startTime` | Optional. `HH:MM:SS` format |
| `endTime` | Optional. Must be after `startTime` if both provided |
| `isAllDay` | Boolean. If true, startTime/endTime ignored |
| `isAttendanceTracked` | Boolean |
| `isDefault` | Boolean. Only ONE event per day should be default |
| `targetUserTypes` | Array of AttendanceUserType enum values |
| `attendanceOpenTo` | `TARGET_ONLY`, `ALL_ENROLLED`, or `ANYONE` |
| `targetScope` | `INSTITUTE`, `CLASS`, or `SUBJECT` |
| `targetClassIds` | Required if scope is `CLASS`. Array of class IDs |
| `targetSubjectIds` | Required if scope is `SUBJECT`. Array of subject IDs |
| `status` | Default: `SCHEDULED`. Valid: `SCHEDULED`, `ONGOING`, `COMPLETED`, `CANCELLED`, `POSTPONED` |
| `maxParticipants` | Optional positive integer |
| `isMandatory` | Boolean |

### Update Calendar Day

| Field | Validation |
|-------|-----------|
| `dayType` | Must be valid CalendarDayType enum |
| `title` | Optional string |
| `description` | Optional string |
| `startTime` | `HH:MM:SS` format |
| `endTime` | `HH:MM:SS` format. Must be after `startTime` |
| `isAttendanceExpected` | Boolean |

---

> **Continue to Part 2:** [FRONTEND_ADMIN_GUIDE_PART2.md](FRONTEND_ADMIN_GUIDE_PART2.md) — Attendance Monitoring, Reports, Dashboard Analytics, Advanced Admin Features
