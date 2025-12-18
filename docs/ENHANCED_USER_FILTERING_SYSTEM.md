# Enhanced User Filtering System

**Date:** November 8, 2025  
**Status:** ✅ COMPLETED

## Overview

Comprehensive filtering system added to institute user endpoints with specialized filters for STUDENT, TEACHER, and PARENT user types.

## 🎯 Enhanced Endpoints

### 1. Students Endpoint
```
GET /institute-users/institute/{instituteId}/users/STUDENT
```

### 2. Teachers Endpoint
```
GET /institute-users/institute/{instituteId}/users/TEACHER
```

### 3. Parents Endpoint
```
GET /institute-users/institute/{instituteId}/users/PARENT
```

## 🔍 Filter Categories

### Common Filters (All User Types)

| Filter | Type | Description | Example |
|--------|------|-------------|---------|
| `search` | string | Search by name or email | `search=john` |
| `isActive` | boolean | Filter by active status | `isActive=true` |
| `gender` | enum | Filter by gender | `gender=MALE` |
| `minAge` | number | Minimum age filter | `minAge=18` |
| `maxAge` | number | Maximum age filter | `maxAge=25` |
| `city` | string | Filter by city/address | `city=Colombo` |
| `page` | number | Page number | `page=1` |
| `limit` | number | Items per page (max 50) | `limit=20` |
| `sortBy` | enum | Sort field | `sortBy=name` |
| `sortOrder` | enum | Sort direction | `sortOrder=ASC` |

**Gender Options:** MALE, FEMALE, OTHER  
**Sort By Options:** createdAt, name, email, dateOfBirth  
**Sort Order Options:** ASC, DESC

### STUDENT-Specific Filters

| Filter | Type | Description | Example |
|--------|------|-------------|---------|
| `studentId` | string | Filter by student ID | `studentId=STU2024001` |
| `emergencyContact` | string | Filter by emergency contact | `emergencyContact=+94771234567` |
| `hasMedicalConditions` | boolean | Has medical conditions | `hasMedicalConditions=true` |
| `hasAllergies` | boolean | Has allergies | `hasAllergies=true` |
| `parent` | boolean | Include parent details | `parent=true` |

### PARENT-Specific Filters

| Filter | Type | Description | Example |
|--------|------|-------------|---------|
| `occupation` | string | Filter by occupation | `occupation=Engineer` |
| `workplace` | string | Filter by workplace | `workplace=Tech Company` |

## 📋 Usage Examples

### Students

#### Filter by Age Range
```
GET /institute-users/institute/1/users/STUDENT?minAge=15&maxAge=18&page=1&limit=50
```
Returns students aged 15-18 years.

#### Students with Medical Conditions
```
GET /institute-users/institute/1/users/STUDENT?hasMedicalConditions=true&page=1&limit=50
```
Returns all students who have medical conditions.

#### Female Students from Specific City
```
GET /institute-users/institute/1/users/STUDENT?gender=FEMALE&city=Colombo&page=1&limit=50
```
Returns female students from Colombo.

#### Search Student with Parent Details
```
GET /institute-users/institute/1/users/STUDENT?studentId=STU2024&parent=true
```
Returns student matching ID with full parent information.

#### Students with Allergies
```
GET /institute-users/institute/1/users/STUDENT?hasAllergies=true&sortBy=name&sortOrder=ASC
```
Returns students with allergies, sorted alphabetically.

### Teachers

#### Male Teachers Above 25
```
GET /institute-users/institute/1/users/TEACHER?gender=MALE&minAge=25&page=1&limit=50
```
Returns male teachers aged 25 and above.

#### Active Teachers from City
```
GET /institute-users/institute/1/users/TEACHER?isActive=true&city=Kandy&page=1&limit=50
```
Returns active teachers from Kandy.

#### Search Teachers by Name
```
GET /institute-users/institute/1/users/TEACHER?search=Silva&sortBy=name
```
Returns teachers with "Silva" in their name or email.

### Parents

#### Filter by Occupation
```
GET /institute-users/institute/1/users/PARENT?occupation=Engineer&page=1&limit=50
```
Returns parents who are engineers.

#### Filter by Workplace
```
GET /institute-users/institute/1/users/PARENT?workplace=Hospital&page=1&limit=50
```
Returns parents working at hospitals.

#### Combined Filters
```
GET /institute-users/institute/1/users/PARENT?occupation=Doctor&city=Colombo
```
Returns doctors living in Colombo.

## 🔐 Security Features

### Input Validation
- ✅ All inputs validated with class-validator decorators
- ✅ Min/max length constraints
- ✅ Regex pattern matching
- ✅ Type validation

### SQL Injection Protection
- ✅ Sanitization using `SecurityUtils.sanitizeSearchInput()`
- ✅ Removal of dangerous characters: `'`, `"`, `;`, `` ` ``, `\`
- ✅ Parameterized queries with TypeORM
- ✅ No raw SQL string concatenation

### Performance Optimizations
- ✅ Selective field queries (no SELECT *)
- ✅ Conditional table joins (only when needed)
- ✅ Separate count queries (lighter than main query)
- ✅ Index-optimized WHERE clauses
- ✅ Pagination to limit result sets

## 📊 Filter Implementation Details

### Age Filter Logic
```typescript
// For minAge=18: shows users who are 18 or older
const maxBirthDate = new Date(currentYear - minAge, currentMonth, currentDay);
queryBuilder.andWhere('u.date_of_birth <= :maxBirthDate', { maxBirthDate });

// For maxAge=25: shows users who are 25 or younger
const minBirthDate = new Date(currentYear - maxAge - 1, currentMonth, currentDay);
queryBuilder.andWhere('u.date_of_birth >= :minBirthDate', { minBirthDate });
```

### Medical Conditions Filter
```typescript
// hasMedicalConditions=true: has conditions
queryBuilder.andWhere('s.medical_conditions IS NOT NULL AND s.medical_conditions != ""');

// hasMedicalConditions=false: no conditions
queryBuilder.andWhere('(s.medical_conditions IS NULL OR s.medical_conditions = "")');
```

### City Filter (Searches Both Address Lines)
```typescript
const cityCondition = '(u.address_line1 LIKE :city OR u.address_line2 LIKE :city)';
queryBuilder.andWhere(cityCondition, { city: `%${safeCity}%` });
```

### Student-Specific Filters (Conditional Join)
```typescript
// Only join student table when using student-specific filters
if (query.studentId || query.emergencyContact || query.hasMedicalConditions || query.hasAllergies) {
  countQueryBuilder.leftJoin('students', 's', 's.user_id = u.id');
}
```

## 📁 Modified Files

### 1. DTO Enhancement
**File:** `src/modules/institute_mudules/institue_user/dto/secure-query.dto.ts`

**Added Fields:**
- `studentId` - Student ID filter
- `emergencyContact` - Emergency contact filter
- `hasMedicalConditions` - Medical conditions flag filter
- `hasAllergies` - Allergies flag filter
- `gender` - Gender filter
- `minAge` - Minimum age filter
- `maxAge` - Maximum age filter
- `city` - City/address filter
- `occupation` - Parent occupation filter (already existed)
- `workplace` - Parent workplace filter (already existed)

**Validation:**
- Min/max length constraints
- Regex pattern matching
- Transform decorators for sanitization
- Type validation

### 2. Service Implementation
**File:** `src/modules/institute_mudules/institue_user/institue_user.service.ts`

**Method:** `getSecureUsersByInstituteAndType()`

**Enhancements:**
- Applied gender filter to all user types
- Applied age range filters with date calculations
- Applied city filter searching both address lines
- Applied student-specific filters (studentId, emergencyContact, medical conditions, allergies)
- Conditional table joins for performance
- Sanitization of all filter inputs

### 3. Controller Documentation
**File:** `src/modules/institute_mudules/institue_user/institue_user.controller.ts`

**Updates:**
- Enhanced API documentation with filter examples
- Added usage examples for each user type
- Documented all available filters
- Added filter combination examples

### 4. Module Configuration
**File:** `src/modules/user/user.module.ts`

**Fixed:** Added `InstantSmsModule` import to resolve `InstantSmsService` dependency for `UserNotificationService`.

## ✅ Testing Recommendations

### 1. Filter Validation Tests
- Test invalid filter values
- Test min/max boundary conditions
- Test SQL injection attempts
- Test special character handling

### 2. Performance Tests
- Test with large datasets (1000+ users)
- Measure query execution time
- Verify proper index usage
- Test pagination performance

### 3. Combination Tests
- Test multiple filters combined
- Test filter + search + sorting
- Test filter + pagination
- Test conflicting filters (e.g., minAge > maxAge)

### 4. User Type Specific Tests
- Test STUDENT filters (medical conditions, allergies, etc.)
- Test PARENT filters (occupation, workplace)
- Test TEACHER filters (common filters only)
- Test age filters across all types

## 🚀 Benefits

1. **Enhanced User Experience**
   - Precise filtering capabilities
   - Multiple filter combinations
   - Relevant search results

2. **Improved Performance**
   - Conditional joins reduce query overhead
   - Selective field selection
   - Optimized pagination

3. **Better Security**
   - Comprehensive input validation
   - SQL injection protection
   - Sanitized user inputs

4. **Maintainability**
   - Well-documented code
   - Consistent validation patterns
   - Reusable validation utilities

## 📝 Notes

- All filters are optional and can be combined
- Filters use LIKE operator with `%` for partial matching
- Age calculations are based on date of birth
- Student table joins are conditional for performance
- Parent filters work on parent relationship data
- All responses are paginated (max 50 items per page)

## 🔄 Future Enhancements

Potential additions for future iterations:

1. **Blood Group Filter** (for students)
2. **Verification Status Filter** (image verification)
3. **Enrollment Date Range** (for all types)
4. **Parent Type Filter** (father/mother/guardian)
5. **Multi-field Search** (name + email + phone)
6. **Advanced Sorting** (multiple fields)
7. **Export Functionality** (CSV/Excel with filters)
8. **Saved Filter Presets** (common filter combinations)

---

**Implementation Status:** ✅ COMPLETE  
**Testing Status:** ⏳ PENDING  
**Deployment Status:** 🟡 READY FOR TESTING
