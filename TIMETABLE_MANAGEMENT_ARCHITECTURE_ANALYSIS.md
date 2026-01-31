# 🗓️ Timetable Management System - Architecture Analysis & Design

## 📊 Current System Analysis

### **Existing Database Structure**

Your LMS already has strong foundational tables:

```
institute
  └── institute_class (has classTeacherId)
      └── institute_class_subject (has teacherId) ✅ TEACHER ASSIGNED
          ├── institute_class_subject_lectures (has instructorId, startTime, endTime) ✅ SCHEDULED LECTURES
          ├── institute_class_subject_homeworks
          ├── institute_class_subject_exams
          └── institute_class_subject_students
```

#### **Key Existing Features:**
1. ✅ **Teacher Assignment**: `institute_class_subject.teacherId` - Teachers assigned to subjects
2. ✅ **Lecture Scheduling**: `institute_class_subject_lectures` - Has start_time, end_time, status
3. ✅ **Class Teacher**: `institute_class.classTeacherId` - Class teacher assigned
4. ✅ **Instructor Tracking**: `institute_class_subject_lectures.instructorId` - Who conducts the lecture

---

## 🎯 Timetable System Design Options

### **Option 1: Use Existing `institute_class_subject_lectures` (✅ RECOMMENDED)**

**Pros:**
- ✅ Already implemented with timestamps, status tracking
- ✅ Has teacher/instructor assignment
- ✅ Supports online/physical/hybrid lectures
- ✅ Has indexes for efficient queries
- ✅ Supports filtering by institute, class, subject, teacher
- ✅ Less database complexity

**Cons:**
- ❌ Designed for individual lectures, not recurring weekly schedules
- ❌ No day-of-week pattern (Monday-Friday recurring)
- ❌ No period/slot numbering (Period 1, Period 2)
- ❌ Must create individual lecture records for each session

**Current Schema:**
```typescript
institute_class_subject_lectures {
  id: bigint (PK)
  instituteId: bigint (FK)
  classId: bigint (FK)
  subjectId: bigint (FK)
  instructorId: bigint (FK) ← Teacher who conducts
  title: string
  description: text
  lectureType: 'online' | 'physical' | 'hybrid'
  venue: string
  startTime: timestamp ← Exact datetime
  endTime: timestamp ← Exact datetime
  status: 'scheduled' | 'live' | 'completed' | 'cancelled'
  meetingLink: text
  recordingUrl: text
  isActive: boolean
  createdAt: timestamp
  updatedAt: timestamp
}
```

---

### **Option 2: Create New `institute_class_timetable` Table (🌟 BEST FOR RECURRING SCHEDULES)**

**Pros:**
- ✅ Designed specifically for recurring weekly schedules
- ✅ Day-of-week patterns (Monday = 1, Tuesday = 2, etc.)
- ✅ Period/slot numbering (Period 1-8)
- ✅ Easy to display weekly timetable grid
- ✅ Can generate lectures from timetable template
- ✅ Supports breaks, special events
- ✅ Academic term/semester support

**Cons:**
- ❌ Requires new table creation and migration
- ❌ Additional complexity in system
- ❌ Need to sync with existing lectures table
- ❌ More development effort

**Proposed Schema:**
```typescript
institute_class_timetable {
  id: bigint (PK)
  instituteId: bigint (FK)
  classId: bigint (FK)
  subjectId: bigint (FK) ← Subject being taught
  teacherId: bigint (FK) ← Teacher assigned (from institute_class_subject.teacherId)
  
  // 🗓️ RECURRING SCHEDULE
  dayOfWeek: int ← 1=Monday, 2=Tuesday, ..., 7=Sunday
  periodNumber: int ← Period 1, 2, 3, etc.
  startTime: time ← 08:00:00 (time only, no date)
  endTime: time ← 08:45:00 (time only, no date)
  
  // 📍 VENUE & TYPE
  venue: string ← Room number, Lab A, etc.
  lectureType: 'online' | 'physical' | 'hybrid'
  meetingLink: text ← Zoom/Google Meet link (if online)
  
  // 📅 VALIDITY PERIOD
  effectiveFrom: date ← When this schedule starts
  effectiveTo: date ← When this schedule ends (null = ongoing)
  
  // 🎓 ACADEMIC CONTEXT
  academicTerm: string ← '2026-Term-1', '2026-Semester-1'
  academicYear: int ← 2026
  
  // ⚙️ METADATA
  isActive: boolean ← Can temporarily disable a slot
  notes: text ← Special instructions
  color: string ← #FF5733 for UI display
  
  createdAt: timestamp
  updatedAt: timestamp
  createdBy: bigint (FK to user)
  updatedBy: bigint (FK to user)
}

// INDEXES for performance
INDEX idx_timetable_class_day (classId, dayOfWeek, isActive)
INDEX idx_timetable_teacher_day (teacherId, dayOfWeek, isActive)
INDEX idx_timetable_institute (instituteId, academicTerm, isActive)
INDEX idx_timetable_subject (subjectId, isActive)
```

---

## 🏗️ Recommended Architecture: **Hybrid Approach**

Use **BOTH** tables for maximum flexibility:

### **1. Timetable Template (`institute_class_timetable`)**
- Stores recurring weekly schedule patterns
- Defines when each subject is taught (day + period + time)
- Teacher assignments
- Venue/room assignments

### **2. Actual Lectures (`institute_class_subject_lectures`)**
- Generated automatically from timetable
- Stores actual lecture instances with exact dates
- Can be modified individually (cancellations, reschedules)
- Tracks attendance, recordings, status

### **Data Flow:**
```
1. Admin creates TIMETABLE TEMPLATE
   └── institute_class_timetable
       (Math: Monday Period 1, 8:00-8:45, Teacher: John Doe)

2. System GENERATES LECTURES for date range
   └── Creates institute_class_subject_lectures records
       (Math Lecture: 2026-01-27 08:00:00, Teacher: John Doe)
       (Math Lecture: 2026-02-03 08:00:00, Teacher: John Doe)
       (Math Lecture: 2026-02-10 08:00:00, Teacher: John Doe)

3. Teachers/Students VIEW lectures
   └── Query institute_class_subject_lectures
       (Shows actual lectures with attendance, status)

4. Admin UPDATES timetable
   └── Can regenerate future lectures from new template
```

---

## 🤖 Automatic Timetable Generation

### **Feature 1: Auto-Assign Teachers Based on Subject Workload**

```typescript
// Algorithm: Smart Teacher Assignment
async function autoAssignTeachers(
  classId: string, 
  subjectIds: string[]
): Promise<TeacherAssignment[]> {
  
  // 1. Get all teachers who can teach each subject
  const teachersPerSubject = await getQualifiedTeachers(subjectIds);
  
  // 2. Calculate current workload for each teacher
  const teacherWorkload = await calculateTeacherWorkload(teachersPerSubject);
  
  // 3. Assign subjects to teachers with least workload
  const assignments = [];
  for (const subject of subjectIds) {
    const availableTeachers = teachersPerSubject[subject];
    
    // Sort by workload (ascending)
    const teacher = availableTeachers.sort((a, b) => 
      teacherWorkload[a.id] - teacherWorkload[b.id]
    )[0];
    
    assignments.push({
      subjectId: subject,
      teacherId: teacher.id,
      workloadBefore: teacherWorkload[teacher.id],
      workloadAfter: teacherWorkload[teacher.id] + 1
    });
    
    // Update workload for next iteration
    teacherWorkload[teacher.id]++;
  }
  
  return assignments;
}
```

**Factors to Consider:**
- Teacher qualifications (subject expertise)
- Current teaching load (periods per week)
- Availability (not already assigned at same time)
- Preferences (some teachers prefer morning/afternoon)
- Maximum load limits (e.g., 25 periods/week)

---

### **Feature 2: Auto-Generate Optimal Timetable**

```typescript
// Algorithm: Constraint-Based Timetable Generation
async function generateOptimalTimetable(
  instituteId: string,
  classId: string,
  subjects: SubjectConfig[],
  constraints: TimetableConstraints
): Promise<Timetable> {
  
  const timetable = [];
  
  // Define time slots (periods)
  const periods = [
    { number: 1, start: '08:00', end: '08:45' },
    { number: 2, start: '08:45', end: '09:30' },
    { number: 3, start: '09:30', end: '10:15' },
    { number: 4, start: '10:30', end: '11:15' }, // After break
    { number: 5, start: '11:15', end: '12:00' },
    { number: 6, start: '13:00', end: '13:45' }, // After lunch
    { number: 7, start: '13:45', end: '14:30' },
    { number: 8, start: '14:30', end: '15:15' },
  ];
  
  // Days of week
  const days = [1, 2, 3, 4, 5]; // Monday to Friday
  
  // Track teacher availability
  const teacherSchedule = new Map();
  const roomSchedule = new Map();
  
  // For each subject, allocate required periods
  for (const subject of subjects) {
    let periodsAllocated = 0;
    
    while (periodsAllocated < subject.periodsPerWeek) {
      // Find next available slot
      for (const day of days) {
        for (const period of periods) {
          const slotKey = `${day}-${period.number}`;
          
          // Check constraints
          const teacher = subject.teacherId;
          const isTeacherFree = !teacherSchedule.get(`${teacher}-${slotKey}`);
          const isRoomFree = !roomSchedule.get(`${subject.venue}-${slotKey}`);
          
          // Check hard constraints
          if (constraints.noDoubleSubject) {
            // Don't schedule same subject twice in same day
            const alreadyScheduledToday = timetable.some(
              t => t.dayOfWeek === day && t.subjectId === subject.id
            );
            if (alreadyScheduledToday) continue;
          }
          
          // If slot is available, assign it
          if (isTeacherFree && isRoomFree) {
            timetable.push({
              instituteId,
              classId,
              subjectId: subject.id,
              teacherId: teacher,
              dayOfWeek: day,
              periodNumber: period.number,
              startTime: period.start,
              endTime: period.end,
              venue: subject.venue || 'Main Hall',
              lectureType: 'physical',
              academicTerm: constraints.academicTerm,
              isActive: true
            });
            
            // Mark as occupied
            teacherSchedule.set(`${teacher}-${slotKey}`, true);
            roomSchedule.set(`${subject.venue}-${slotKey}`, true);
            
            periodsAllocated++;
            break;
          }
        }
        if (periodsAllocated >= subject.periodsPerWeek) break;
      }
    }
  }
  
  return timetable;
}

// Subject configuration
interface SubjectConfig {
  id: string;
  name: string;
  teacherId: string;
  periodsPerWeek: number; // Math: 6, English: 5, etc.
  venue?: string;
  preferredDays?: number[]; // Optional
  preferredPeriods?: number[]; // Optional
}

// Constraints
interface TimetableConstraints {
  academicTerm: string;
  noDoubleSubject: boolean; // No same subject twice/day
  maxPeriodsPerDay: number; // Max 8 periods
  breaks: Array<{ afterPeriod: number; duration: number }>;
  lunchTime: { afterPeriod: number; duration: number };
}
```

**Optimization Criteria:**
1. **No Teacher Conflicts**: Same teacher can't be in two places
2. **No Room Conflicts**: Same room can't have two classes
3. **Balanced Distribution**: Spread subjects across the week
4. **No Double Periods**: Same subject not scheduled twice same day (optional)
5. **Break Times**: Respect break and lunch periods
6. **Teacher Preferences**: Morning/afternoon preferences
    7. **Subject Clustering**: Related subjects near each other (e.g., Math followed by Science)

---

### **Feature 3: Bulk Lecture Generation from Timetable**

```typescript
async function generateLecturesFromTimetable(
  timetableId: string,
  startDate: Date,
  endDate: Date
): Promise<InstituteClassSubjectLecture[]> {
  
  // Get timetable entry
  const timetableEntry = await timetableRepository.findOne(timetableId);
  
  const lectures = [];
  const currentDate = new Date(startDate);
  
  // Iterate through date range
  while (currentDate <= endDate) {
    // Check if current day matches timetable day
    const dayOfWeek = currentDate.getDay(); // 0=Sunday, 1=Monday
    const adjustedDay = dayOfWeek === 0 ? 7 : dayOfWeek; // Convert to 1-7
    
    if (adjustedDay === timetableEntry.dayOfWeek) {
      // Check if there's a holiday/break
      const isHoliday = await checkHoliday(currentDate, timetableEntry.instituteId);
      
      if (!isHoliday) {
        // Create lecture instance
        const lecture = {
          instituteId: timetableEntry.instituteId,
          classId: timetableEntry.classId,
          subjectId: timetableEntry.subjectId,
          instructorId: timetableEntry.teacherId,
          title: `${timetableEntry.subject.name} - Period ${timetableEntry.periodNumber}`,
          description: `Regular class lecture`,
          lectureType: timetableEntry.lectureType,
          venue: timetableEntry.venue,
          startTime: combineDateAndTime(currentDate, timetableEntry.startTime),
          endTime: combineDateAndTime(currentDate, timetableEntry.endTime),
          status: 'scheduled',
          meetingLink: timetableEntry.meetingLink,
          isActive: true,
          timetableId: timetableEntry.id // Link back to template
        };
        
        lectures.push(lecture);
      }
    }
    
    // Move to next day
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  // Bulk insert all lectures
  return await lectureRepository.save(lectures);
}
```

---

## 👁️ Student View - Timetable Display

### **API Endpoint: Get Student Timetable**

```typescript
// GET /api/timetable/student/:studentId?week=2026-01-27
async getStudentTimetable(
  studentId: string,
  week: string // Start date of week
): Promise<StudentTimetableView> {
  
  // 1. Get student's class
  const student = await getStudentWithClass(studentId);
  const classId = student.classId;
  
  // 2. Get all subjects student is enrolled in
  const enrolledSubjects = await getStudentSubjects(studentId, classId);
  
  // 3. Get timetable entries for this class
  const timetableEntries = await timetableRepository.find({
    where: {
      classId,
      subjectId: In(enrolledSubjects.map(s => s.id)),
      isActive: true
    },
    relations: ['subject', 'teacher']
  });
  
  // 4. Get actual lectures for this week (with attendance, status)
  const weekStart = new Date(week);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  
  const lectures = await lectureRepository.find({
    where: {
      classId,
      startTime: Between(weekStart, weekEnd),
      isActive: true
    },
    relations: ['subject', 'instructor']
  });
  
  // 5. Format as weekly grid
  return formatWeeklyTimetable(timetableEntries, lectures);
}

// Response format
interface StudentTimetableView {
  weekStart: Date;
  weekEnd: Date;
  schedule: {
    [day: string]: { // 'Monday', 'Tuesday', etc.
      [period: number]: {
        subjectId: string;
        subjectName: string;
        teacherName: string;
        venue: string;
        startTime: string; // '08:00'
        endTime: string; // '08:45'
        lectureType: 'online' | 'physical' | 'hybrid';
        meetingLink?: string;
        status: 'scheduled' | 'live' | 'completed' | 'cancelled';
        hasAttendance: boolean;
        lectureId?: string; // If actual lecture exists
      };
    };
  };
  holidays: Date[];
  exams: Array<{ date: Date; subject: string }>;
}
```

### **Frontend Display (Weekly Grid)**

```typescript
// Example response
{
  "weekStart": "2026-01-27",
  "weekEnd": "2026-02-02",
  "schedule": {
    "Monday": {
      "1": {
        "subjectName": "Mathematics",
        "teacherName": "Mr. John Doe",
        "venue": "Room 101",
        "startTime": "08:00",
        "endTime": "08:45",
        "status": "scheduled",
        "lectureType": "physical"
      },
      "2": {
        "subjectName": "English",
        "teacherName": "Ms. Jane Smith",
        "venue": "Room 102",
        "startTime": "08:45",
        "endTime": "09:30",
        "status": "scheduled",
        "lectureType": "physical"
      },
      // ... more periods
    },
    "Tuesday": {
      "1": {
        "subjectName": "Science",
        "teacherName": "Dr. Alan Brown",
        "venue": "Lab A",
        "startTime": "08:00",
        "endTime": "08:45",
        "status": "live",
        "lectureType": "hybrid",
        "meetingLink": "https://zoom.us/j/123456789"
      }
    }
    // ... rest of week
  },
  "holidays": ["2026-01-30"],
  "exams": [
    { "date": "2026-02-05", "subject": "Mathematics" }
  ]
}
```

---

## 📊 Database Schema Comparison

| Feature | Use Existing `lectures` | New `timetable` Table | Hybrid Approach |
|---------|------------------------|----------------------|-----------------|
| **Recurring Schedules** | ❌ Must create each | ✅ One entry = all weeks | ✅ Template + Instances |
| **Day-of-Week Pattern** | ❌ No | ✅ Yes (1-7) | ✅ Template has pattern |
| **Period Numbers** | ❌ No | ✅ Yes | ✅ Template has periods |
| **Exact Date Tracking** | ✅ Yes | ❌ No | ✅ Instances have dates |
| **Status Tracking** | ✅ scheduled/live/completed | ❌ No | ✅ Instances have status |
| **Attendance** | ✅ Can link | ❌ Cannot | ✅ Link to instances |
| **Cancellations** | ✅ Mark cancelled | ❌ Hard to handle | ✅ Cancel instances |
| **Reschedules** | ✅ Update time | ❌ Hard to handle | ✅ Modify instances |
| **Weekly Grid View** | ❌ Must aggregate | ✅ Direct query | ✅ Query template |
| **Setup Complexity** | Low | Medium | High |
| **Flexibility** | High | Low | Highest |

---

## 🎯 Recommended Implementation Plan

### **Phase 1: Create Timetable Table (Week 1-2)**

```sql
CREATE TABLE institute_class_timetable (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  institute_id BIGINT NOT NULL,
  class_id BIGINT NOT NULL,
  subject_id BIGINT NOT NULL,
  teacher_id BIGINT,
  day_of_week INT NOT NULL, -- 1=Monday to 7=Sunday
  period_number INT NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  venue VARCHAR(255),
  lecture_type ENUM('online', 'physical', 'hybrid') DEFAULT 'physical',
  meeting_link TEXT,
  effective_from DATE,
  effective_to DATE,
  academic_term VARCHAR(50),
  academic_year INT,
  is_active BOOLEAN DEFAULT TRUE,
  notes TEXT,
  color VARCHAR(7), -- Hex color
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_by BIGINT,
  updated_by BIGINT,
  
  FOREIGN KEY (institute_id) REFERENCES institute(id) ON DELETE CASCADE,
  FOREIGN KEY (class_id) REFERENCES institute_class(id) ON DELETE CASCADE,
  FOREIGN KEY (subject_id) REFERENCES subject(id) ON DELETE CASCADE,
  FOREIGN KEY (teacher_id) REFERENCES user(id) ON DELETE SET NULL,
  
  INDEX idx_timetable_class_day (class_id, day_of_week, is_active),
  INDEX idx_timetable_teacher_day (teacher_id, day_of_week, is_active),
  INDEX idx_timetable_institute (institute_id, academic_term, is_active),
  
  UNIQUE KEY unique_timetable_slot (class_id, day_of_week, period_number, effective_from)
);
```

### **Phase 2: Add Reference to Existing Lectures (Week 2)**

```sql
ALTER TABLE institute_class_subject_lectures 
ADD COLUMN timetable_id BIGINT,
ADD FOREIGN KEY (timetable_id) REFERENCES institute_class_timetable(id) ON DELETE SET NULL;
```

### **Phase 3: Implement Core APIs (Week 3-4)**

1. **Timetable Management**
   - `POST /api/timetable` - Create timetable entry
   - `GET /api/timetable/class/:classId` - Get class timetable
   - `PUT /api/timetable/:id` - Update entry
   - `DELETE /api/timetable/:id` - Delete entry

2. **Auto-Generation**
   - `POST /api/timetable/generate` - Auto-generate optimal timetable
   - `POST /api/timetable/:id/generate-lectures` - Create lectures from template
   - `POST /api/timetable/auto-assign-teachers` - Assign teachers by workload

3. **Student Views**
   - `GET /api/timetable/student/:id` - Student's weekly timetable
   - `GET /api/timetable/teacher/:id` - Teacher's weekly schedule
   - `GET /api/timetable/class/:classId/grid` - Class timetable grid view

### **Phase 4: Advanced Features (Week 5-6)**

1. **Conflict Detection**
   - Teacher double-booking alerts
   - Room conflicts
   - Student class overlaps

2. **Bulk Operations**
   - Copy timetable to another class
   - Update all entries for a subject
   - Batch reschedule

3. **Notifications**
   - Notify students of timetable changes
   - Remind about upcoming lectures
   - Alert on cancellations

---

## 💡 Best Practices

### **1. Start with Template, Generate Instances**
- Admins define recurring schedule in `timetable`
- System generates actual lectures in `lectures`
- Students interact with generated lectures only

### **2. Allow Manual Overrides**
- Generated lectures can be edited individually
- Changes don't affect template
- Template can be updated for future weeks

### **3. Handle Exceptions Gracefully**
- Holidays: Don't generate lectures
- Exams: Block timetable slots
- Events: Mark lectures as cancelled

### **4. Efficient Queries**
- Cache timetable templates (rarely change)
- Index by class, day, period for fast grid views
- Paginate lecture lists (many records)

### **5. Validation Rules**
- Period times don't overlap
- Teacher available at that time
- Room not double-booked
- Student enrolled in subject
- Within academic term dates

---

## 🚀 Quick Start Example

### **Step 1: Create Timetable for Grade 10 Class**

```typescript
// POST /api/timetable/bulk-create
{
  "instituteId": "101",
  "classId": "1000",
  "academicTerm": "2026-Term-1",
  "effectiveFrom": "2026-01-27",
  "effectiveTo": "2026-06-30",
  "entries": [
    {
      "subjectId": "40", // Mathematics
      "teacherId": "500",
      "dayOfWeek": 1, // Monday
      "periodNumber": 1,
      "startTime": "08:00",
      "endTime": "08:45",
      "venue": "Room 101",
      "lectureType": "physical"
    },
    {
      "subjectId": "41", // English
      "teacherId": "501",
      "dayOfWeek": 1,
      "periodNumber": 2,
      "startTime": "08:45",
      "endTime": "09:30",
      "venue": "Room 102",
      "lectureType": "physical"
    }
    // ... more entries
  ]
}
```

### **Step 2: Generate Lectures for 4 Weeks**

```typescript
// POST /api/timetable/generate-lectures
{
  "classId": "1000",
  "startDate": "2026-01-27",
  "endDate": "2026-02-23",
  "excludeHolidays": true
}

// Response: Created 160 lectures (4 weeks × 5 days × 8 periods)
```

### **Step 3: Students View Their Timetable**

```typescript
// GET /api/timetable/student/123?week=2026-01-27
// Returns weekly grid with all lectures
```

---

## 🎉 Conclusion

**Recommended Approach: Hybrid System**

1. ✅ **Create `institute_class_timetable` table** for recurring schedules
2. ✅ **Keep using `institute_class_subject_lectures`** for actual instances
3. ✅ **Implement auto-generation** to create lectures from template
4. ✅ **Build smart teacher assignment** based on workload balancing
5. ✅ **Provide weekly grid views** for students and teachers

**Benefits:**
- Minimal admin effort (define template once)
- Maximum flexibility (edit individual lectures)
- Optimal performance (indexed queries)
- Automatic scheduling (smart algorithms)
- Student-friendly (clean weekly view)

This hybrid approach gives you the **best of both worlds**: easy recurring schedule management with the flexibility to handle exceptions and real-world changes.
