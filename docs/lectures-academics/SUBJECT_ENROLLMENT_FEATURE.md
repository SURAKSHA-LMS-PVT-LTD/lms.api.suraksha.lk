# 🎓 Subject Enrollment Feature Documentation

## Overview

The Institute Class Subject module includes **self-enrollment functionality** that allows teachers and admins to enable student self-enrollment using unique enrollment keys.

---

## ✅ Features

### 1. **Enable/Disable Enrollment**
- Toggle enrollment on/off for each subject assignment
- Database field: `enrollment_enabled` (boolean, default: false)
- Can be set during initial assignment or updated later

### 2. **Enrollment Modes**
- **Open Enrollment**: `enrollmentEnabled: true` + `enrollmentKey: null` (no key required)
- **Key-Required Enrollment**: `enrollmentEnabled: true` + `enrollmentKey: "MATH-2026"` (key required)
- **Enrollment Disabled**: `enrollmentEnabled: false`

### 3. **Enrollment Keys**
- **Custom keys**: Teachers can provide keys for restricted enrollment (up to 50 characters)
- **No key**: Leave empty for open enrollment (any student can join)
- **Uniqueness**: Database index ensures keys are globally unique when provided

### 4. **Automatic Key Management**
- Key is optional - empty key means open enrollment
- Key automatically cleared when enrollment disabled
- Key can be updated anytime

---

## 📊 Database Schema

### Table: `institute_class_subjects`

```sql
-- Enrollment fields
enrollment_enabled BOOLEAN DEFAULT FALSE 
  COMMENT 'When true, enables self-enrollment for this subject';

enrollment_key VARCHAR(50) NULL
  COMMENT 'Unique key for self-enrollment. Generated when enrollment is enabled';

-- Index for fast enrollment key lookup
CREATE UNIQUE INDEX idx_class_subjects_enrollment_key 
  ON institute_class_subjects(enrollment_key) 
  WHERE enrollment_key IS NOT NULL;
```

---

## 🔧 Implementation Details

### Entity (TypeORM)
```typescript
@Entity('institute_class_subjects')
export class InstituteClassSubjectEntity {
  // ... other fields

  @Column({ 
    name: 'enrollment_enabled', 
    type: 'boolean', 
    default: false 
  })
  enrollmentEnabled: boolean;

  @Column({ 
    name: 'enrollment_key', 
    type: 'varchar', 
    length: 50, 
    nullable: true 
  })
  enrollmentKey?: string;
}
```

### DTOs

**CreateInstituteClassSubjectDto:**
```typescript
enrollmentEnabled?: boolean;  // Optional - default: false
enrollmentKey?: string;        // Optional - leave empty for open enrollment
```

**UpdateInstituteClassSubjectDto:**
```typescript
enrollmentEnabled?: boolean;  // Toggle enrollment
enrollmentKey?: string;        // Update key
```

**InstituteClassSubjectResponseDto:**
```typescript
enrollmentEnabled: boolean;
enrollmentKey?: string;  // Visible to authorized users
```

### Service Logic

**Enrollment Settings Handler:**
```typescript
private handleEnrollmentSettings(
  enrollmentEnabled?: boolean, 
  enrollmentKey?: string
): { enrollmentEnabled: boolean; enrollmentKey?: string } {
  // Not specified → disabled
  if (enrollmentEnabled === undefined) {
    return { enrollmentEnabled: false, enrollmentKey: null };
  }

  // Enabled → use provided key or null (open enrollment)
  if (enrollmentEnabled) {
    return { enrollmentEnabled: true, enrollmentKey: enrollmentKey || null };
  }

  // Disabled → clear key
  return { enrollmentEnabled: false, enrollmentKey: null };
}
```

---

## 🎯 Use Cases

### 1. **Open Enrollment (No Key Required)**

**Request:**
```http
POST /api/institutes/1/classes/5/subjects
Content-Type: application/json

{
  "subjectId": "123",
  "teacherId": "456",
  "enrollmentEnabled": true
}
```

**Response:**
```json
{
  "success": true,
  "message": "Subject successfully assigned to class",
  "data": {
    "instituteId": "1",
    "classId": "5",
    "subjectId": "123",
    "enrollmentEnabled": true,
    "enrollmentKey": null
  }
}
```

**Behavior:** Any student can enroll without needing a key.

---

### 2. **Key-Required Enrollment**

**Request:**
```http
POST /api/institutes/1/classes/5/subjects
Content-Type: application/json

{
  "subjectId": "124",
  "teacherId": "456",
  "enrollmentEnabled": true,
  "enrollmentKey": "MATH-2026"
}
```

**Response:**
```json
{
  "enrollmentEnabled": true,
  "enrollmentKey": "MATH-2026"
}
```

**Behavior:** Students need the key "MATH-2026" to enroll.

---

### 3. **Enable Open Enrollment**

**Request:**
```http
PATCH /api/institutes/1/classes/5/subjects/123
Content-Type: application/json

{
  "enrollmentEnabled": true
}
```

**Behavior:**
- Enables enrollment without key requirement
- `enrollmentKey` remains null
- Any student can join

---

### 4. **Switch to Key-Required Enrollment**

**Request:**
```http
PATCH /api/institutes/1/classes/5/subjects/123
Content-Type: application/json

{
  "enrollmentEnabled": true,
  "enrollmentKey": "PHYSICS-2026"
}
```

**Behavior:**
- Changes from open enrollment to key-required
- Students now need key to enroll

**Request:**
```http
PATCH /api/institutes/1/classes/5/subjects/123
Content-Type: application/json

{
  "enrollmentEnabled": false
}
```

**Behavior:**
- Sets `enrollmentEnabled = false`
- Sets `enrollmentKey = null`
- Students can no longer self-enroll

---

### 5. **Disable Enrollment**

**Request:**
```http
PATCH /api/institutes/1/classes/5/subjects/123
Content-Type: application/json

{
  "enrollmentEnabled": false
}
```

**Behavior:**
- Sets `enrollmentEnabled = false`
- Sets `enrollmentKey = null`
- Students can no longer self-enroll

---

### 6. **Update Enrollment Key**

**Request:**
```http
PATCH /api/institutes/1/classes/5/subjects/123
Content-Type: application/json

{
  "enrollmentEnabled": true,
  "enrollmentKey": "PHYSICS-2026"
}
```

**Behavior:**
- Updates key to new value
- Old key invalidated
- Uniqueness validated before save

---

## 🔐 Security & Access Control

### Who Can Manage Enrollment?

| Role | Enable/Disable | View Key | Set Custom Key |
|------|----------------|----------|----------------|
| SUPERADMIN | ✅ | ✅ | ✅ |
| Institute Admin | ✅ | ✅ | ✅ |
| Teacher (assigned to subject) | ✅ | ✅ | ✅ |
| Teacher (not assigned) | ❌ | ❌ | ❌ |
| Student | ❌ | ❌ | ❌ |
| Attendance Marker | ❌ | ❌ | ❌ |

### Key Visibility
- **Authorized users**: See full enrollment key
- **Students**: Would use key via separate enrollment endpoint (to be implemented)
- **Public**: No access to keys

---

## 🎨 Frontend Integration Examples

### React Component - Enrollment Toggle

```tsx
import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';

interface EnrollmentToggleProps {
  instituteId: string;
  classId: string;
  subjectId: string;
  enrollmentEnabled: boolean;
  enrollmentKey?: string;
}

export const EnrollmentToggle: React.FC<EnrollmentToggleProps> = ({
  instituteId,
  classId,
  subjectId,
  enrollmentEnabled,
  enrollmentKey
}) => {
  const [customKey, setCustomKey] = useState('');
  const [showKeyInput, setShowKeyInput] = useState(false);

  const toggleMutation = useMutation({
    mutationFn: async (data: { enrollmentEnabled: boolean; enrollmentKey?: string }) => {
      const response = await fetch(
        `/api/institutes/${instituteId}/classes/${classId}/subjects/${subjectId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        }
      );
      return response.json();
    }
  });

  const handleToggle = (enabled: boolean) => {
    if (enabled && !enrollmentKey) {
      setShowKeyInput(true); // Show option for custom key
    } else {
      toggleMutation.mutate({ enrollmentEnabled: enabled });
    }
  };

  const handleSetKey = () => {
    toggleMutation.mutate({
      enrollmentEnabled: true,
      enrollmentKey: customKey || undefined // Empty = auto-generate
    });
    setShowKeyInput(false);
  };

  return (
    <div className="enrollment-toggle">
      {/* Toggle Switch */}
      <label>
        <input
          type="checkbox"
          checked={enrollmentEnabled}
          onChange={(e) => handleToggle(e.target.checked)}
        />
        Self-Enrollment
      </label>

      {/* Display Key */}
      {enrollmentEnabled && enrollmentKey && (
        <div className="enrollment-key">
          <strong>Key:</strong> <code>{enrollmentKey}</code>
          <button onClick={() => navigator.clipboard.writeText(enrollmentKey)}>
            Copy
          </button>
        </div>
      )}

      {/* Custom Key Input */}
      {showKeyInput && (
        <div className="key-input">
          <input
            type="text"
            placeholder="Custom key (or leave empty)"
            value={customKey}
            onChange={(e) => setCustomKey(e.target.value)}
            maxLength={50}
          />
          <button onClick={handleSetKey}>
            {customKey ? 'Set Custom Key' : 'Auto-Generate'}
          </button>
          <button onClick={() => setShowKeyInput(false)}>Cancel</button>
        </div>
      )}
    </div>
  );
};
```

### Display Enrollment Key

```tsx
export const EnrollmentKeyDisplay: React.FC<{ enrollmentKey: string }> = ({ 
  enrollmentKey 
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(enrollmentKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="enrollment-key-display">
      <label>Enrollment Key:</label>
      <code className="key-code">{enrollmentKey}</code>
      <button onClick={handleCopy} className="btn-copy">
        {copied ? '✓ Copied!' : '📋 Copy'}
      </button>
      <small className="help-text">
        Share this key with students to allow self-enrollment
      </small>
    </div>
  );
};
```

### CSS Styling

```css
.enrollment-toggle {
  padding: 1rem;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  background: #f9f9f9;
}

.enrollment-key {
  margin-top: 0.5rem;
  padding: 0.5rem;
  background: #fff;
  border-radius: 4px;
}

.enrollment-key code {
  font-family: 'Courier New', monospace;
  font-size: 1.1rem;
  font-weight: bold;
  color: #2563eb;
  background: #eff6ff;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
}

.btn-copy {
  margin-left: 0.5rem;
  padding: 0.25rem 0.75rem;
  background: #2563eb;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.btn-copy:hover {
  background: #1d4ed8;
}

.key-input {
  margin-top: 0.5rem;
  display: flex;
  gap: 0.5rem;
}

.key-input input {
  flex: 1;
  padding: 0.5rem;
  border: 1px solid #d1d5db;
  border-radius: 4px;
}
```

---

## 📝 API Endpoints Summary

| Endpoint | Method | Enrollment Action |
|----------|--------|-------------------|
| `/institutes/:id/classes/:id/subjects` | POST | Set during assignment |
| `/institutes/:id/classes/:id/subjects/:id` | PATCH | Toggle on/off, update key |
| `/institutes/:id/classes/:id/subjects/:id` | GET | View enrollment status |

---

## ✅ Implementation Checklist

- [x] Database schema updated with `enrollment_enabled` and `enrollment_key`
- [x] Unique index on `enrollment_key` column
- [x] Entity updated with enrollment fields
- [x] DTOs updated (Create, Update, Response)
- [x] Service logic for key generation
- [x] Service logic for enrollment settings handling
- [x] Controller endpoints support enrollment fields
- [x] API documentation updated
- [x] Frontend guide created with React examples
- [x] TypeScript interfaces exported
- [ ] Student enrollment endpoint (future: `/enroll` with key validation)
- [ ] Enrollment analytics (track how many students enrolled via key)
- [ ] Key expiration feature (optional future enhancement)

---

## 🚀 Future Enhancements

### 1. **Student Enrollment Endpoint**
```http
POST /api/student/enroll
{
  "enrollmentKey": "AB3K-9MN2"
}
```

### 2. **Enrollment Analytics**
- Track enrollment count per key
- Track which students enrolled via key vs admin assignment
- Enrollment timestamp

### 3. **Key Expiration**
```typescript
enrollmentKeyExpiresAt?: Date;
```

### 4. **Enrollment Limits**
```typescript
maxEnrollments?: number;
currentEnrollments?: number;
```

---

**Last Updated:** January 10, 2026  
**Status:** ✅ Fully Implemented  
**Version:** v2.0.0+
