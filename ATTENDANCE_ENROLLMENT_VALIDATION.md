# Environment Variable Configuration for Attendance

## Enrollment Validation Variables

### `ATTENDANCE_MARKS_FOR_ONLY_ENROLLED_INSTITUTE_STUDENTS`

**Purpose**: Controls whether institute attendance requires student enrollment validation.

**Values**:
- `true` - Validates student is enrolled before marking institute attendance
- `false` - Skips enrollment validation (default behavior)

**Behavior when `true`**:
1. System checks `institute_user` table for enrollment
2. Verifies enrollment status is `ACTIVE`
3. Returns `400 Bad Request` with user-friendly message if:
   - Student not enrolled: "Student is currently not enrolled in this institute. Please contact the institute administrator."
   - Enrollment inactive: "Student enrollment is not active. Please contact the institute administrator."
4. ✅ Never throws 500 errors - all validation errors return 400

**Behavior when `false`**:
- No enrollment validation
- Attendance marked directly
- Faster processing

---

### `ATTENDANCE_MARKS_FOR_ONLY_ENROLLED_VEHICLE_STUDENTS`

**Purpose**: Controls whether transport attendance requires enrollment validation.

**Values**:
- `true` - Validates student is enrolled in vehicle/bookhire
- `false` - Skips enrollment validation

**Note**: Currently set to `false` in your environment.

---

## Error Handling

### User-Friendly Errors (400 Bad Request)
```json
{
  "statusCode": 400,
  "message": "Student is currently not enrolled in this institute. Please contact the institute administrator.",
  "error": "Bad Request"
}
```

### No Internal Errors Exposed
- ✅ Database errors caught and converted to user-friendly messages
- ✅ No stack traces or internal IDs exposed
- ✅ Consistent error format across all validation failures

---

## Current Configuration (`.env`)

```env
# Institute Attendance Enrollment Validation
ATTENDANCE_MARKS_FOR_ONLY_ENROLLED_INSTITUTE_STUDENTS=true

# Transport Attendance Enrollment Validation  
ATTENDANCE_MARKS_FOR_ONLY_ENROLLED_VEHICLE_STUDENTS=false
```

---

## Implementation Details

### Location
`src/modules/attendance/attendance.service.ts` - `validateStudentEnrollment()` method

### Flow
```
markAttendance()
  ↓
validateStudentEnrollment(studentId, instituteId)
  ↓
Check env: ATTENDANCE_MARKS_FOR_ONLY_ENROLLED_INSTITUTE_STUDENTS
  ↓
if true:
  - Query institute_user table
  - Validate enrollment exists
  - Validate status is ACTIVE
  - Throw 400 BadRequestException if validation fails
if false:
  - Skip validation
  - Continue with attendance marking
```

### Benefits
✅ Prevents attendance for non-enrolled students
✅ Clear error messages for end users
✅ No 500 errors - proper HTTP status codes
✅ Configurable via environment variable
✅ Detailed logging for debugging

---

## Testing

### Test with validation enabled:
```bash
# Set in .env
ATTENDANCE_MARKS_FOR_ONLY_ENROLLED_INSTITUTE_STUDENTS=true

# Try marking attendance for non-enrolled student
# Expected: 400 Bad Request with message
```

### Test with validation disabled:
```bash
# Set in .env
ATTENDANCE_MARKS_FOR_ONLY_ENROLLED_INSTITUTE_STUDENTS=false

# Mark attendance for any student
# Expected: Success (no validation)
```
