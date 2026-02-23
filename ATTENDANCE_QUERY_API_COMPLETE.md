# 🔍 Attendance Query API - Complete Reference

**Date:** February 23, 2026  
**System:** Calendar-Aware Attendance Queries

---

## 📋 Available Query Methods

### **Category A: Basic Date/Student Queries**

#### 1. Get Attendance by Date
```typescript
async getAttendanceByDate(
  instituteId: string, 
  date: string
): Promise<MarkAttendanceDto[]>
```

**Use Case:** Get all attendance records for a specific date  
**Performance:** ⚡ Fast (uses PK + SK prefix)  
**Returns:** All attendance (students, teachers, parents, all events)

**Example:**
```typescript
// Get all attendance for Feb 23, 2026
const records = await dynamoDBService.getAttendanceByDate('109', '2026-02-23');

// Result: [{
//   studentId: '123',
//   studentName: 'John Doe',
//   status: 'PRESENT',
//   userType: 'STUDENT',
//   calendarDayId: 'cd-feb23',
//   eventId: 'evt-regular-class',
//   timestamp: 1740326400000
// }, ...]
```

---

#### 2. Get Student Attendance History
```typescript
async getStudentAttendance(
  studentId: string,
  instituteId: string,
  startDate?: string,
  endDate?: string
): Promise<MarkAttendanceDto[]>
```

**Use Case:** Get student's full attendance history (all events)  
**Performance:** ⚡ Fast (uses GSI on student)  
**Returns:** All attendance records for that student

**Example:**
```typescript
// Get student 123's attendance for February 2026
const history = await dynamoDBService.getStudentAttendance(
  '123',
  '109',
  '2026-02-01',
  '2026-02-28'
);

// Result: 20 records (regular classes + special events)
```

---

#### 3. Get Attendance Summary
```typescript
async getAttendanceSummary(
  instituteId: string,
  classId?: string,
  subjectId?: string,
  startDate?: string,
  endDate?: string
): Promise<SummaryResult>
```

**Use Case:** Get statistics (present count, absent count, attendance rate)  
**Performance:** ⚠️ Slower (filters after query)  
**Returns:** Summary object with counts and percentages

**Example:**
```typescript
// Get Class 10A attendance summary for February
const summary = await dynamoDBService.getAttendanceSummary(
  '109',
  'class-10a',
  undefined,
  '2026-02-01',
  '2026-02-28'
);

// Result: {
//   totalRecords: 500,
//   presentCount: 450,
//   absentCount: 30,
//   lateCount: 20,
//   attendanceRate: 90.0,
//   records: [...]
// }
```

---

### **Category B: Calendar-Aware Event Queries** 🆕

#### 4. Get Attendance by Event
```typescript
async getAttendanceByEvent(
  instituteId: string,
  eventId: string,
  date?: string
): Promise<MarkAttendanceDto[]>
```

**Use Case:** Get all attendance for a specific event  
**Performance:** ⚡ Fast if date provided (PK + SK prefix + filter)  
**Returns:** Everyone who attended that specific event

**Example 1: Single-Day Event**
```typescript
// Get all attendance at "Parent-Teacher Meeting" on March 15
const attendees = await dynamoDBService.getAttendanceByEvent(
  '109',
  'evt-parents-meeting-uuid',
  '2026-03-15'
);

// Result: [{
//   studentId: 'parent-user-789',
//   studentName: 'Sarah (Parent)',
//   userType: 'PARENT',
//   status: 'PRESENT',
//   eventId: 'evt-parents-meeting-uuid',
//   timestamp: 1741104000000
// }, ...]
```

**Example 2: All Occurrences**
```typescript
// Get all attendance at ANY "Field Trip" event (all dates)
const allFieldTrips = await dynamoDBService.getAttendanceByEvent(
  '109',
  'evt-field-trip-uuid'
  // No date = all dates
);

// Result: All field trip attendances across entire year
```

---

#### 5. Get Student Attendance by Event
```typescript
async getStudentAttendanceByEvent(
  studentId: string,
  instituteId: string,
  eventId: string,
  startDate?: string,
  endDate?: string
): Promise<MarkAttendanceDto[]>
```

**Use Case:** Check student's attendance at specific event type  
**Performance:** ⚡ Fast (uses student GSI + filter)  
**Returns:** All times this student attended this event type

**Example:**
```typescript
// Check how many times student 123 attended field trips
const fieldTripAttendance = await dynamoDBService.getStudentAttendanceByEvent(
  '123',
  '109',
  'evt-field-trip-uuid',
  '2026-01-01',
  '2026-12-31'
);

// Result: [
//   { date: '2026-03-10', status: 'PRESENT' },
//   { date: '2026-06-15', status: 'PRESENT' },
//   { date: '2026-09-20', status: 'ABSENT' }
// ]
// Student attended 2 out of 3 field trips
```

---

### **Category C: Calendar Day Queries** 🆕

#### 6. Get Attendance by Calendar Day
```typescript
async getAttendanceByCalendarDay(
  instituteId: string,
  calendarDayId: string,
  userType?: string
): Promise<MarkAttendanceDto[]>
```

**Use Case:** Get ALL attendance for a calendar day (cross-event view)  
**Performance:** ⚠️ Slower (scans institute partition with filter)  
**Returns:** All attendance linked to that calendar day ID

**Example 1: All Users**
```typescript
// Get everyone who marked attendance on Feb 23 calendar day
const allAttendance = await dynamoDBService.getAttendanceByCalendarDay(
  '109',
  'cd-feb23-uuid'
);

// Result: [
//   { studentId: '123', userType: 'STUDENT', eventId: 'evt-regular' },
//   { studentId: '124', userType: 'STUDENT', eventId: 'evt-regular' },
//   { studentId: 'teacher-456', userType: 'TEACHER', eventId: 'evt-regular' },
//   { studentId: 'parent-789', userType: 'PARENT', eventId: 'evt-meeting' }
// ]
```

**Example 2: Filtered by User Type**
```typescript
// Get only TEACHER attendance for Feb 23
const teacherAttendance = await dynamoDBService.getAttendanceByCalendarDay(
  '109',
  'cd-feb23-uuid',
  'TEACHER'
);

// Result: Only teacher attendance records
```

---

### **Category D: User Type Queries** 🆕

#### 7. Get Attendance by User Type
```typescript
async getAttendanceByUserType(
  instituteId: string,
  userType: string,
  date?: string,
  eventId?: string
): Promise<MarkAttendanceDto[]>
```

**Use Case:** Get attendance filtered by who attended (students vs teachers vs parents)  
**Performance:** ⚡ Fast if date provided  
**Returns:** All attendance for that user type

**Example 1: All Teachers Today**
```typescript
// Get all teacher attendance for today
const teacherAttendance = await dynamoDBService.getAttendanceByUserType(
  '109',
  'TEACHER',
  '2026-02-23'
);

// Result: All teachers who marked present today
```

**Example 2: Parents at Specific Event**
```typescript
// Get all parents who attended the Parents Meeting
const parentAttendees = await dynamoDBService.getAttendanceByUserType(
  '109',
  'PARENT',
  '2026-03-15',
  'evt-parents-meeting-uuid'
);

// Result: {
//   total: 380,
//   present: 350,
//   rate: 92.1%
// }
```

**Example 3: All Non-Student Attendance**
```typescript
// Get all TEACHER + PARENT + ADMIN attendance (not students)
const nonStudentTypes = ['TEACHER', 'PARENT', 'INSTITUTE_ADMIN'];
const allNonStudents = await Promise.all(
  nonStudentTypes.map(type => 
    dynamoDBService.getAttendanceByUserType('109', type, '2026-02-23')
  )
);

// Result: Combined attendance of all non-student users
```

---

## 🎯 Performance Comparison

| Query Method | Date? | Performance | DynamoDB Operation | Cost |
|-------------|-------|-------------|-------------------|------|
| `getAttendanceByDate` | ✅ Yes | ⚡⚡⚡ Fast | PK + SK prefix | $ |
| `getStudentAttendance` | Optional | ⚡⚡⚡ Fast | GSI query | $$ |
| `getAttendanceByEvent` | Optional | ⚡⚡ Medium | PK + filter | $$ |
| `getStudentAttendanceByEvent` | Optional | ⚡⚡ Medium | GSI + filter | $$$ |
| `getAttendanceByCalendarDay` | N/A | ⚡ Slow | PK scan + filter | $$$ |
| `getAttendanceByUserType` | Optional | ⚡⚡ Medium | PK + filter | $$ |
| `getAttendanceSummary` | Optional | ⚡ Slow | PK scan + filter | $$$$ |

**Optimization Tips:**
- ✅ **Always provide date** when possible (uses KeyConditionExpression)
- ✅ **Use student GSI** for student-specific queries
- ⚠️ **Avoid calendar day queries** without caching (scans partition)
- ⚠️ **Cache summary results** (most expensive query)

---

## 📊 Real-World Query Scenarios

### **Scenario 1: Daily Attendance Report**
```typescript
// Admin wants: "Show me today's attendance across all events"
const today = getCurrentSriLankaDate(); // '2026-02-23'

// Step 1: Get all attendance for today
const allAttendance = await dynamoDBService.getAttendanceByDate('109', today);

// Step 2: Group by event
const byEvent = allAttendance.reduce((acc, record) => {
  const eventId = record.eventId || 'unknown';
  if (!acc[eventId]) acc[eventId] = [];
  acc[eventId].push(record);
  return acc;
}, {});

// Result: {
//   'evt-regular-class': [450 students],
//   'evt-parents-meeting': [80 parents]
// }
```

---

### **Scenario 2: Event-Specific Report**
```typescript
// Admin wants: "Who attended the Parents Meeting on March 15?"

// Option A: Get attendance by event + date (FASTER)
const attendees = await dynamoDBService.getAttendanceByEvent(
  '109',
  'evt-parents-meeting-uuid',
  '2026-03-15'
);

// Group by user type
const byUserType = attendees.reduce((acc, record) => {
  const type = record.userType || 'UNKNOWN';
  if (!acc[type]) acc[type] = { present: 0, absent: 0 };
  if (record.status === 'PRESENT') acc[type].present++;
  else acc[type].absent++;
  return acc;
}, {});

// Result: {
//   PARENT: { present: 350, absent: 50, rate: 87.5% },
//   TEACHER: { present: 30, absent: 20, rate: 60% }
// }
```

---

### **Scenario 3: Student Report Card**
```typescript
// Parent wants: "Show my child's attendance for February"

// Step 1: Get all calendar days in February (from MySQL)
const workingDays = await calendarService.getWorkingDays(
  '109',
  '2026-02-01',
  '2026-02-28'
);
// Result: 20 working days

// Step 2: Get student's attendance for February
const attendance = await dynamoDBService.getStudentAttendance(
  '123',
  '109',
  '2026-02-01',
  '2026-02-28'
);
// Result: 18 present, 2 absent

// Step 3: Calculate real attendance rate
const rate = (18 / 20) * 100; // 90% (only working days)
// NOT: (18 / 28) * 100 = 64.3% (wrong! includes weekends)

// Step 4: Group by event type
const byEvent = {
  REGULAR_CLASS: attendance.filter(a => a.eventId?.includes('regular')),
  SPECIAL_EVENTS: attendance.filter(a => !a.eventId?.includes('regular'))
};

// Result:
// - Regular Classes: 18/20 days (90%)
// - Special Events: 1/1 field trip attended (100%)
```

---

### **Scenario 4: Teacher Attendance Monitoring**
```typescript
// Admin wants: "Show all teacher attendance for this week"

const dates = ['2026-02-17', '2026-02-18', '2026-02-19', '2026-02-20', '2026-02-21'];

const teacherAttendance = await Promise.all(
  dates.map(date => 
    dynamoDBService.getAttendanceByUserType('109', 'TEACHER', date)
  )
);

// Result: [
//   { date: '2026-02-17', teachers: 45/50 present (90%) },
//   { date: '2026-02-18', teachers: 48/50 present (96%) },
//   { date: '2026-02-19', teachers: 47/50 present (94%) },
//   { date: '2026-02-20', teachers: 46/50 present (92%) },
//   { date: '2026-02-21', teachers: 49/50 present (98%) }
// ]
```

---

### **Scenario 5: Cross-Event Analysis**
```typescript
// Admin wants: "How many students attended both regular class AND the field trip?"

const date = '2026-03-10'; // Field trip day

// Get all student attendance for that date
const allAttendance = await dynamoDBService.getAttendanceByDate('109', date);

// Filter students who attended BOTH events
const regularClass = allAttendance.filter(
  a => a.userType === 'STUDENT' && a.eventId === 'evt-regular-class'
);
const fieldTrip = allAttendance.filter(
  a => a.userType === 'STUDENT' && a.eventId === 'evt-field-trip'
);

const bothEvents = regularClass.filter(rc =>
  fieldTrip.some(ft => ft.studentId === rc.studentId)
);

// Result: 380 students attended both regular class and field trip
```

---

## 🔧 Helper Query Functions (Recommended)

Create these wrapper functions in your service layer for common queries:

```typescript
// attendance-query.service.ts

export class AttendanceQueryService {
  constructor(
    private readonly dynamoDBService: DynamoDBAttendanceService,
    private readonly calendarService: InstituteCalendarService
  ) {}

  /**
   * Get real attendance rate (excludes weekends/holidays)
   */
  async getRealAttendanceRate(
    studentId: string,
    instituteId: string,
    startDate: string,
    endDate: string
  ): Promise<number> {
    // Step 1: Get working days from calendar
    const workingDays = await this.calendarService.getWorkingDays(
      instituteId,
      startDate,
      endDate
    );

    // Step 2: Get student attendance
    const attendance = await this.dynamoDBService.getStudentAttendance(
      studentId,
      instituteId,
      startDate,
      endDate
    );

    // Step 3: Count present days
    const presentDays = attendance.filter(a => a.status === 'PRESENT').length;

    // Step 4: Calculate rate
    return workingDays.length > 0 
      ? (presentDays / workingDays.length) * 100 
      : 0;
  }

  /**
   * Get event attendance summary
   */
  async getEventAttendanceSummary(
    instituteId: string,
    eventId: string,
    date: string
  ): Promise<EventSummary> {
    // Get all attendance for event
    const attendees = await this.dynamoDBService.getAttendanceByEvent(
      instituteId,
      eventId,
      date
    );

    // Group by user type
    const byUserType = attendees.reduce((acc, record) => {
      const type = record.userType || 'UNKNOWN';
      if (!acc[type]) {
        acc[type] = { total: 0, present: 0, absent: 0 };
      }
      acc[type].total++;
      if (record.status === 'PRESENT') acc[type].present++;
      else acc[type].absent++;
      return acc;
    }, {});

    // Calculate rates
    Object.keys(byUserType).forEach(type => {
      const data = byUserType[type];
      data.rate = (data.present / data.total) * 100;
    });

    return {
      eventId,
      date,
      totalAttendees: attendees.length,
      byUserType
    };
  }

  /**
   * Get today's attendance summary (cached)
   */
  @Cache({ ttl: 300 }) // Cache 5 minutes
  async getTodayAttendanceSummary(instituteId: string): Promise<DailySummary> {
    const today = getCurrentSriLankaDate();

    // Get today's calendar day
    const calendarDay = await this.calendarService.getTodayCalendarDay(instituteId);

    // Get all attendance
    const allAttendance = await this.dynamoDBService.getAttendanceByDate(
      instituteId,
      today
    );

    // Group by event
    const byEvent = allAttendance.reduce((acc, record) => {
      const eventId = record.eventId || 'unknown';
      if (!acc[eventId]) {
        acc[eventId] = { present: 0, absent: 0, late: 0 };
      }
      if (record.status === 'PRESENT') acc[eventId].present++;
      else if (record.status === 'LATE') acc[eventId].late++;
      else acc[eventId].absent++;
      return acc;
    }, {});

    return {
      date: today,
      dayType: calendarDay.dayType,
      totalRecords: allAttendance.length,
      byEvent
    };
  }
}
```

---

## ✅ Summary

Your attendance query API now supports:

| Query Type | Method | Performance |
|-----------|--------|-------------|
| ✅ Date-based | `getAttendanceByDate` | ⚡⚡⚡ Fast |
| ✅ Student history | `getStudentAttendance` | ⚡⚡⚡ Fast |
| ✅ Event-based | `getAttendanceByEvent` | ⚡⚡ Medium |
| ✅ Calendar day | `getAttendanceByCalendarDay` | ⚡ Slow |
| ✅ User type | `getAttendanceByUserType` | ⚡⚡ Medium |
| ✅ Student + event | `getStudentAttendanceByEvent` | ⚡⚡ Medium |
| ✅ Statistics | `getAttendanceSummary` | ⚡ Slow |

**All calendar-aware queries are now 100% complete!** 🎉
