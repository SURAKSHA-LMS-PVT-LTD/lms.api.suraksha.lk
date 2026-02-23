# DynamoDB Attendance Table - View Guide

## 📊 Current Table Status

**Table Name:** `attendance_events`  
**Region:** `us-east-1`  
**Records Found:** 4 (all created before calendar integration)

---

## 🔍 View Records

### Quick Command
```bash
npx ts-node view-dynamodb-attendance.ts
```

### Current Records
```
Record 1: John Doe (Institute 1) - 2025-12-27 - ✅ Present
  ❌ calendarDayId: NOT SET (old record)
  ❌ eventId: NOT SET (old record)
  ❌ userType: NOT SET

Record 2: KAUSHAN THARUSHKA (Institute 109) - 2026-01-26 - ✅ Present
  ❌ calendarDayId: NOT SET (old record)
  ❌ eventId: NOT SET (old record)
  ❌ userType: NOT SET

Record 3 & 4: KAVEESHA SANJANA (Institute 109) - Feb 2026 - ✅ Present
  ❌ calendarDayId: NOT SET (old records)
  ❌ eventId: NOT SET (old records)
  ❌ userType: NOT SET
```

---

## 🆕 New Calendar Fields (Implemented Today)

After calendar system implementation, **new** attendance records will include:

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `calendarDayId` | string (uuid) | Links to `institute_calendar_days.id` | `"cd-123e4567"` |
| `eventId` | string (uuid) | Links to `institute_calendar_events.id` | `"evt-789abc"` |
| `userType` | string | Auto-detected user type | `"STUDENT"`, `"TEACHER"` |

---

## 🧪 Test Calendar Integration

### 1. Generate Calendar (Institute 109)
```bash
POST /api/institutes/109/calendar/generate
{
  "academicYear": "2026",
  "startDate": "2026-02-23",
  "endDate": "2026-12-31",
  "publicHolidays": [
    { "date": "2026-04-14", "title": "Sinhala New Year" }
  ],
  "createdBy": "admin"
}
```

### 2. Mark New Attendance
```bash
POST /api/attendance/mark
{
  "studentId": "2",
  "instituteId": "109",
  "instituteName": "Cambridge International School",
  "date": "2026-02-23",
  "status": "PRESENT"
}
```

### 3. Verify Calendar Linkage
```bash
npx ts-node view-dynamodb-attendance.ts
```

**Expected NEW Record:**
```
📝 Record 5:
  Student ID:       2
  Student Name:     KAVEESHA SANJANA
  Institute ID:     109
  Date:             2026-02-23
  Status:           ✅ Present
  User Type:        STUDENT
  🆕 Calendar Day ID: cd-123e4567-abc ✅ SET
  🆕 Event ID:        evt-789abc-def ✅ SET
  Location:         Cambridge International School
```

---

## 📋 Record Structure

### Before (Old Records)
```json
{
  "studentId": "2",
  "date": "2026-02-13",
  "status": 1,
  "instituteId": "109",
  "markingMethod": "qr",
  "timestamp": 1739377389817
}
```

### After (New Records with Calendar)
```json
{
  "studentId": "2",
  "date": "2026-02-23",
  "status": 1,
  "instituteId": "109",
  "calendarDayId": "cd-123e4567",  // ← NEW
  "eventId": "evt-789abc",         // ← NEW
  "userType": "STUDENT",           // ← NEW
  "markingMethod": "qr",
  "timestamp": 1740326400000
}
```

---

## 🔧 Additional AWS CLI Commands

### View Table Schema
```bash
aws dynamodb describe-table --table-name attendance_events --region us-east-1
```

### Query Specific Institute
```bash
aws dynamodb query \
  --table-name attendance_events \
  --key-condition-expression "pk = :pk" \
  --expression-attribute-values '{":pk":{"S":"I#109"}}' \
  --region us-east-1 \
  --max-items 5
```

### Check Latest Records
```bash
aws dynamodb scan \
  --table-name attendance_events \
  --region us-east-1 \
  --max-items 5 \
  --scan-index-forward false
```

---

## 📝 Summary

- ✅ DynamoDB table accessible
- ✅ 4 historical records found
- ❌ No calendar-linked records yet (system just implemented)
- 🎯 Next: Fix auth module → Start server → Mark attendance → Verify calendar linkage

**Scripts Available:**
- `view-dynamodb-attendance.ts` - View current records
- `test-calendar-system.ts` - Automated testing (needs JWT token)
