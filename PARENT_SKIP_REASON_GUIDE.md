# 👪 Parent Skip Reason Storage - Complete Guide

**Version:** 1.0.0  
**Last Updated:** January 18, 2026  
**Feature:** Comprehensive tracking of why parent information is not provided

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Database Schema](#database-schema)
3. [How It Works](#how-it-works)
4. [Use Cases](#use-cases)
5. [API Integration](#api-integration)
6. [Query Examples](#query-examples)
7. [Business Rules](#business-rules)

---

## 🎯 Overview

The Parent Skip Reason feature allows the system to track and store **why parent information is not provided** when creating a user with student data. This is critical for:

- **Compliance**: Understanding why parent information is missing
- **Analytics**: Tracking patterns in parent data availability
- **Support**: Helping staff understand each student's family situation
- **Auditing**: Maintaining a record of data collection decisions

### Key Features

✅ **Separate tracking for each parent type** (Father, Mother, Guardian)  
✅ **Automatic storage** during user creation  
✅ **Flexible reasons** - Free text field for detailed explanations  
✅ **Historical tracking** - Timestamps for audit trail  
✅ **Soft delete support** - is_active flag for data retention  

---

## 📊 Database Schema

### Table: `reason_of_parent_skip`

```sql
CREATE TABLE reason_of_parent_skip (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  parent_type ENUM('father', 'mother', 'guardian') NOT NULL,
  reason TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  -- Foreign key constraint
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  
  -- Indexes for performance
  INDEX idx_user_id (user_id),
  INDEX idx_parent_type (parent_type),
  INDEX idx_is_active (is_active)
);
```

### Field Descriptions

| Field | Type | Description |
|-------|------|-------------|
| `id` | BIGINT | Unique identifier for the skip reason record |
| `user_id` | BIGINT | References the student user (foreign key to `users.id`) |
| `parent_type` | ENUM | Type of parent: 'father', 'mother', or 'guardian' |
| `reason` | TEXT | Free-text explanation of why parent info is not provided |
| `is_active` | BOOLEAN | Soft delete flag (true = active, false = deleted) |
| `created_at` | TIMESTAMP | When the record was created |
| `updated_at` | TIMESTAMP | When the record was last updated |

### Constraints

- **CASCADE DELETE**: When a user is deleted, all associated skip reasons are automatically deleted
- **NOT NULL**: user_id, parent_type, and reason are required
- **UNIQUE**: No constraint - allows updating reasons by creating new records

---

## 🔄 How It Works

### Automatic Storage During User Creation

When creating a comprehensive user via `POST /users/comprehensive`, the system automatically stores skip reasons:

```
┌─────────────────────────────────────────────────────────────┐
│ 1. User Creation Request Received                           │
│    - Contains studentData with skip reasons                  │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. User Record Created                                       │
│    - User ID generated: 12345                                │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Student Record Created                                    │
│    - Linked to user ID: 12345                                │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Check for Skip Reasons (STEP 2.5)                        │
│    - If fatherSkipReason provided → Store it                │
│    - If motherSkipReason provided → Store it                │
│    - If guardianSkipReason provided → Store it              │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. Transaction Committed                                     │
│    - User + Student + Skip Reasons all saved together        │
└─────────────────────────────────────────────────────────────┘
```

### Service Implementation

**Location**: `src/modules/user/user.service.ts` (STEP 2.5)

```typescript
// Import the entity
const { ReasonOfParentSkipEntity, ParentType } = 
  await import('../student/entities/reason-of-parent-skip.entity');

// Father skip reason
if (dto.studentData?.fatherSkipReason) {
  const fatherSkipRecord = queryRunner.manager.create(ReasonOfParentSkipEntity, {
    userId: userId,
    parentType: ParentType.FATHER,
    reason: dto.studentData.fatherSkipReason,
    isActive: true
  });
  await queryRunner.manager.save(fatherSkipRecord);
}

// Mother skip reason (similar)
// Guardian skip reason (similar)
```

---

## 💼 Use Cases

### Use Case 1: Deceased Parent

**Scenario**: A student's mother has passed away

**API Request**:
```json
{
  "firstName": "Sarah",
  "lastName": "Johnson",
  "email": "sarah.johnson@school.lk",
  "studentData": {
    "studentId": "STU-2024-001",
    "fatherId": "98765",
    "fatherPhoneNumber": "+94771234567",
    "motherSkipReason": "Mother passed away in 2022"
  }
}
```

**Database Result**:
```
reason_of_parent_skip:
  id: 1
  user_id: 12345
  parent_type: 'mother'
  reason: 'Mother passed away in 2022'
  is_active: true
  created_at: 2026-01-18 10:30:00
```

---

### Use Case 2: Unknown Guardian

**Scenario**: Student lives with extended family, no formal guardian assigned

**API Request**:
```json
{
  "firstName": "Ahmed",
  "lastName": "Khan",
  "studentData": {
    "fatherId": "11111",
    "motherId": "22222",
    "guardianSkipReason": "Student lives with grandparents, no formal guardian assigned"
  }
}
```

**Database Result**:
```
reason_of_parent_skip:
  id: 2
  user_id: 12346
  parent_type: 'guardian'
  reason: 'Student lives with grandparents, no formal guardian assigned'
  is_active: true
  created_at: 2026-01-18 10:35:00
```

---

### Use Case 3: Single Parent Household

**Scenario**: Father not in the picture, single mother raising child

**API Request**:
```json
{
  "firstName": "Michael",
  "lastName": "Brown",
  "studentData": {
    "motherId": "33333",
    "motherPhoneNumber": "+94772222222",
    "fatherSkipReason": "Single parent household - father not involved in upbringing"
  }
}
```

**Database Result**:
```
reason_of_parent_skip:
  id: 3
  user_id: 12347
  parent_type: 'father'
  reason: 'Single parent household - father not involved in upbringing'
  is_active: true
  created_at: 2026-01-18 10:40:00
```

---

### Use Case 4: Multiple Skip Reasons

**Scenario**: Orphaned student with no guardian

**API Request**:
```json
{
  "firstName": "Emily",
  "lastName": "Davis",
  "studentData": {
    "fatherSkipReason": "Father deceased - 2020",
    "motherSkipReason": "Mother deceased - 2021",
    "guardianSkipReason": "No legal guardian assigned, under care of children's home"
  }
}
```

**Database Result**:
```
reason_of_parent_skip:
  id: 4, user_id: 12348, parent_type: 'father', reason: 'Father deceased - 2020'
  id: 5, user_id: 12348, parent_type: 'mother', reason: 'Mother deceased - 2021'
  id: 6, user_id: 12348, parent_type: 'guardian', reason: 'No legal guardian...'
```

**Note**: One user can have **up to 3 skip reason records** (one for each parent type).

---

## 🔌 API Integration

### Endpoint: POST /users/comprehensive

**Full Example with Skip Reasons**:

```json
{
  "firstName": "John",
  "lastName": "Doe",
  "nameWithInitials": "J. Doe",
  "email": "john.doe@example.com",
  "phoneNumber": "+94771234567",
  "userType": "USER",
  "dateOfBirth": "1995-05-15",
  "gender": "MALE",
  "nic": "199512345678",
  "addressLine1": "123 Main Street",
  "city": "Colombo",
  "district": "COLOMBO",
  "province": "WESTERN",
  "country": "Sri Lanka",
  
  "studentData": {
    "studentId": "STU-2024-001",
    "emergencyContact": "+94771234567",
    "bloodGroup": "O+",
    
    "fatherId": "1234567890",
    "fatherPhoneNumber": "+94771111111",
    "fatherSkipReason": null,
    
    "motherId": null,
    "motherPhoneNumber": null,
    "motherSkipReason": "Mother is deceased",
    
    "guardianId": null,
    "guardianPhoneNumber": null,
    "guardianSkipReason": "No guardian assigned - living with father only"
  }
}
```

**Response**: Standard user creation response (skip reasons stored in background)

---

## 🔍 Query Examples

### 1. Get All Skip Reasons for a User

```sql
SELECT 
  id,
  parent_type,
  reason,
  created_at
FROM reason_of_parent_skip
WHERE user_id = 12345
  AND is_active = TRUE
ORDER BY parent_type;
```

**Result**:
```
id  | parent_type | reason                      | created_at
----|-------------|-----------------------------|-----------
5   | mother      | Mother is deceased          | 2026-01-18
6   | guardian    | No guardian assigned...     | 2026-01-18
```

---

### 2. Find All Students Missing Mother Information

```sql
SELECT 
  u.id AS user_id,
  u.first_name,
  u.last_name,
  r.reason AS mother_skip_reason,
  r.created_at
FROM users u
INNER JOIN reason_of_parent_skip r ON u.id = r.user_id
WHERE r.parent_type = 'mother'
  AND r.is_active = TRUE
ORDER BY r.created_at DESC;
```

---

### 3. Count Skip Reasons by Type

```sql
SELECT 
  parent_type,
  COUNT(*) AS total_count,
  COUNT(DISTINCT user_id) AS unique_users
FROM reason_of_parent_skip
WHERE is_active = TRUE
GROUP BY parent_type
ORDER BY total_count DESC;
```

**Example Result**:
```
parent_type | total_count | unique_users
------------|-------------|-------------
father      | 145         | 145
mother      | 87          | 87
guardian    | 312         | 312
```

---

### 4. Recent Skip Reasons (Last 30 Days)

```sql
SELECT 
  u.first_name,
  u.last_name,
  r.parent_type,
  r.reason,
  r.created_at
FROM reason_of_parent_skip r
INNER JOIN users u ON r.user_id = u.id
WHERE r.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
  AND r.is_active = TRUE
ORDER BY r.created_at DESC
LIMIT 20;
```

---

### 5. Students with Multiple Skip Reasons

```sql
SELECT 
  u.id AS user_id,
  u.first_name,
  u.last_name,
  COUNT(*) AS skip_reason_count,
  GROUP_CONCAT(r.parent_type ORDER BY r.parent_type) AS missing_parents
FROM users u
INNER JOIN reason_of_parent_skip r ON u.id = r.user_id
WHERE r.is_active = TRUE
GROUP BY u.id, u.first_name, u.last_name
HAVING skip_reason_count > 1
ORDER BY skip_reason_count DESC;
```

**Example Result**:
```
user_id | first_name | last_name | skip_reason_count | missing_parents
--------|------------|-----------|-------------------|------------------
12348   | Emily      | Davis     | 3                 | father,guardian,mother
12350   | Tom        | Wilson    | 2                 | father,guardian
```

---

## 📜 Business Rules

### 1. Storage Rules

✅ **Required Fields**:
- `user_id` - Must reference existing user
- `parent_type` - Must be one of: father, mother, guardian
- `reason` - Must not be empty

✅ **Optional Behavior**:
- Skip reasons are **only stored if provided** in the API request
- If skip reason is `null` or not provided, **no record is created**
- Multiple skip reasons (up to 3) can be stored for one user

✅ **Automatic Timestamps**:
- `created_at` - Set automatically on insert
- `updated_at` - Updates automatically on any change

---

### 2. Data Integrity

🔒 **Foreign Key Cascade**:
```sql
FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
```
- When a user is deleted, all skip reasons are **automatically deleted**
- Maintains referential integrity

🔒 **Soft Delete**:
- Use `is_active = FALSE` instead of physical deletion
- Allows historical tracking and audit trails
- Active records only: `WHERE is_active = TRUE`

---

### 3. Performance Optimization

📈 **Indexes**:
```sql
INDEX idx_user_id (user_id)      -- Fast lookup by user
INDEX idx_parent_type (parent_type) -- Fast filtering by type
INDEX idx_is_active (is_active)   -- Fast filtering active records
```

📈 **Query Tips**:
- Always filter by `is_active = TRUE` for current data
- Use `user_id` in WHERE clause for best performance
- Avoid full table scans on `reason` field (TEXT type)

---

### 4. Common Reason Patterns

Based on real-world usage, common skip reasons include:

**Father Skip Reasons**:
- "Deceased"
- "Unknown/Not listed on birth certificate"
- "No contact/Absent from family"
- "Single parent household"
- "Father lives abroad"

**Mother Skip Reasons**:
- "Deceased"
- "No contact/Estranged"
- "Lives abroad"
- "Single father household"

**Guardian Skip Reasons**:
- "No legal guardian assigned"
- "Living with grandparents (not legal guardians)"
- "Under care of children's home"
- "Foster care situation"
- "Parents are primary guardians"

---

## 🛠️ Technical Implementation

### Entity: ReasonOfParentSkipEntity

**Location**: `src/modules/student/entities/reason-of-parent-skip.entity.ts`

```typescript
import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum ParentType {
  FATHER = 'father',
  MOTHER = 'mother',
  GUARDIAN = 'guardian'
}

@Entity('reason_of_parent_skip')
export class ReasonOfParentSkipEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ type: 'bigint', name: 'user_id' })
  userId: string;

  @Column({
    type: 'enum',
    enum: ParentType,
    name: 'parent_type'
  })
  parentType: ParentType;

  @Column({ type: 'text' })
  reason: string;

  @Column({ type: 'boolean', default: true, name: 'is_active' })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
```

---

### DTO Integration

**Location**: `src/modules/user/dto/create-user-comprehensive.dto.ts`

```typescript
export class StudentDataDto {
  // ... other fields ...
  
  @ApiPropertyOptional({ 
    description: 'Reason for not providing father information',
    example: 'Father is deceased'
  })
  @IsOptional()
  @IsString()
  fatherSkipReason?: string;

  @ApiPropertyOptional({ 
    description: 'Reason for not providing mother information',
    example: 'Mother lives abroad'
  })
  @IsOptional()
  @IsString()
  motherSkipReason?: string;

  @ApiPropertyOptional({ 
    description: 'Reason for not providing guardian information',
    example: 'No legal guardian assigned'
  })
  @IsOptional()
  @IsString()
  guardianSkipReason?: string;
}
```

---

## 📈 Analytics & Reporting

### Dashboard Queries

**1. Parent Availability Overview**:
```sql
SELECT 
  COUNT(DISTINCT u.id) AS total_students,
  COUNT(DISTINCT CASE WHEN r.parent_type = 'father' THEN r.user_id END) AS missing_father,
  COUNT(DISTINCT CASE WHEN r.parent_type = 'mother' THEN r.user_id END) AS missing_mother,
  COUNT(DISTINCT CASE WHEN r.parent_type = 'guardian' THEN r.user_id END) AS missing_guardian
FROM users u
LEFT JOIN reason_of_parent_skip r ON u.id = r.user_id AND r.is_active = TRUE
WHERE u.user_type = 'USER';
```

**2. Top Skip Reasons**:
```sql
SELECT 
  parent_type,
  LEFT(reason, 50) AS reason_preview,
  COUNT(*) AS occurrence_count
FROM reason_of_parent_skip
WHERE is_active = TRUE
GROUP BY parent_type, reason
ORDER BY occurrence_count DESC
LIMIT 10;
```

---

## 🚀 Best Practices

### For Developers

1. **Always use transactions** when creating users with skip reasons
2. **Validate user_id exists** before inserting skip reasons
3. **Use soft deletes** (`is_active = FALSE`) instead of physical deletion
4. **Log skip reason creation** for audit trails
5. **Handle null/empty values** properly in API requests

### For Administrators

1. **Review skip reasons periodically** for data quality
2. **Standardize common reasons** to improve reporting
3. **Train staff** on when to use skip reasons appropriately
4. **Export data regularly** for compliance reporting
5. **Monitor patterns** to identify potential data collection issues

---

## ✅ Summary

The Parent Skip Reason feature provides:

✅ **Comprehensive tracking** of why parent data is missing  
✅ **Automatic storage** during user creation  
✅ **Flexible reasons** for various family situations  
✅ **Strong data integrity** with foreign key constraints  
✅ **Historical tracking** with timestamps  
✅ **Performance optimization** with proper indexes  
✅ **Analytics support** for reporting and compliance  

**Result**: Better understanding of student family situations and improved data quality!

---

**For support or questions, contact the development team.**

**Last Updated**: January 18, 2026
