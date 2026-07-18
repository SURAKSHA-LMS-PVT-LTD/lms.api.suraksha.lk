# 📚 Institute Class Subject Management - Frontend Integration Guide

## 🔄 Overview

This guide covers all APIs for managing **subject assignments to institute classes**, including assigning, updating, unassigning subjects, and teacher management.

---

## 🎯 Base URL Structure

```
/institutes/:instituteId/classes/:classId/subjects
```

**Path Parameters:**
- `instituteId` - Institute ID (required)
- `classId` - Class ID (required)
- `subjectId` - Subject ID (used in specific operations)

---

## 📝 API Endpoints

### 1. **Assign Subject to Class**

**Endpoint:** `POST /institutes/:instituteId/classes/:classId/subjects`

**Access:** SUPERADMIN, Institute Admin, Teacher (with class access)

**Description:** Assign a single subject to a class with optional teacher assignment.

**Request:**
```typescript
interface AssignSubjectRequest {
  subjectId: string;       // Required
  teacherId?: string;      // Optional - assign teacher
  isActive?: boolean;      // Optional - default: true
  enrollmentEnabled?: boolean;  // Optional - enable self-enrollment (default: false)
  enrollmentKey?: string;  // Optional - if provided, students need key to enroll; if empty, open enrollment
}
```

**Example:**
```typescript
// POST /institutes/1/classes/5/subjects
// Open enrollment (no key required)
{
  "subjectId": "123",
  "teacherId": "456",
  "isActive": true,
  "enrollmentEnabled": true
  // No enrollmentKey = open enrollment
}

// Key-required enrollment
{
  "subjectId": "123",
  "teacherId": "456",
  "isActive": true,
  "enrollmentEnabled": true,
  "enrollmentKey": "MATH-2026"
}
```

**Response:**
```typescript
interface AssignSubjectResponse {
  success: boolean;
  message: string;
  data: {
    instituteId: string;
    classId: string;
    subjectId: string;
    teacherId?: string;
    isActive: boolean;
    enrollmentEnabled: boolean;
    enrollmentKey?: string;
    createdAt: string;
    updatedAt: string;
  }
}
```

**Success Response:**
```json
{
  "success": true,
  "message": "Subject assigned to class successfully",
  "data": {
    "instituteId": "1",
    "classId": "5",
    "subjectId": "123",
    "teacherId": "456",
    "isActive": true,
    "createdAt": "2026-01-10T10:00:00Z",
    "updatedAt": "2026-01-10T10:00:00Z"
  }
}
```

**Error Responses:**
- `409 Conflict` - Subject already assigned to this class
- `403 Forbidden` - Insufficient permissions
- `404 Not Found` - Subject or class not found

---

### 2. **Bulk Assign Subjects to Class**

**Endpoint:** `POST /institutes/:instituteId/classes/:classId/subjects/bulk`

**Access:** SUPERADMIN, Institute Admin, Teacher

**Description:** Assign multiple subjects to a class at once.

**Request:**
```typescript
interface BulkAssignSubjectsRequest {
  subjects: Array<{
    subjectId: string;
    teacherId?: string;
    isActive?: boolean;
  }>;
}
```

**Example:**
```typescript
// POST /institutes/1/classes/5/subjects/bulk
{
  "subjects": [
    { "subjectId": "101", "teacherId": "201" },
    { "subjectId": "102", "teacherId": "202" },
    { "subjectId": "103", "teacherId": "203" }
  ]
}
```

**Response:**
```typescript
interface BulkAssignSubjectsResponse {
  success: boolean;
  message: string;
  data: {
    total: number;
    successful: number;
    failed: number;
    results: Array<{
      subjectId: string;
      success: boolean;
      message?: string;
      data?: object;
    }>;
  }
}
```

**Success Response:**
```json
{
  "success": true,
  "message": "Bulk assignment completed",
  "data": {
    "total": 3,
    "successful": 3,
    "failed": 0,
    "results": [
      {
        "subjectId": "101",
        "success": true,
        "data": { "instituteId": "1", "classId": "5", "subjectId": "101" }
      },
      {
        "subjectId": "102",
        "success": true,
        "data": { "instituteId": "1", "classId": "5", "subjectId": "102" }
      },
      {
        "subjectId": "103",
        "success": true,
        "data": { "instituteId": "1", "classId": "5", "subjectId": "103" }
      }
    ]
  }
}
```

---

### 3. **Get All Subjects for a Class**

**Endpoint:** `GET /institutes/:instituteId/classes/:classId/subjects`

**Access:** Institute Admin, Teacher, Student, Attendance Marker

**Description:** Retrieve all subjects assigned to a specific class with pagination and filtering.

**Query Parameters:**
```typescript
interface GetClassSubjectsQuery {
  page?: number;           // Default: 1
  limit?: number;          // Default: 50, -1 for all
  search?: string;         // Search in subject name/code
  isActive?: boolean;      // Filter by active status
  teacherId?: string;      // Filter by teacher
  sortBy?: string;         // Sort field (default: createdAt)
  sortOrder?: 'ASC' | 'DESC'; // Sort order (default: DESC)
}
```

**Example:**
```typescript
// GET /institutes/1/classes/5/subjects?isActive=true&teacherId=456&limit=10
```

**Response:**
```typescript
interface ClassSubjectsResponse {
  data: Array<{
    instituteId: string;
    classId: string;
    subjectId: string;
    subject: {
      id: string;
      code: string;
      name: string;
      description?: string;
      category?: string;
      imgUrl?: string;
      subjectType: string;
      basketCategory?: string;
    };
    teacherId?: string;
    teacher?: {
      id: string;
      nameWithInitials: string;
      email: string;
      phoneNumber?: string;
      imageUrl?: string;
    };
    isActive: boolean;
    enrollmentEnabled: boolean;
    enrollmentKey?: string;
    createdAt: string;
    updatedAt: string;
  }>;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
```

**Success Response:**
```json
{
  "data": [
    {
      "instituteId": "1",
      "classId": "5",
      "subjectId": "123",
      "subject": {
        "id": "123",
        "code": "MATH101",
        "name": "Mathematics",
        "description": "Basic mathematics",
        "category": "Science",
        "imgUrl": "https://storage.googleapis.com/.../math.jpg",
        "subjectType": "MAIN",
        "basketCategory": null
      },
      "teacherId": "456",
      "teacher": {
        "id": "456",
        "nameWithInitials": "J. Smith",
        "email": "j.smith@school.com",
        "phoneNumber": "+94712345678",
        "imageUrl": "https://storage.googleapis.com/.../teacher.jpg"
      },
      "isActive": true,
      "createdAt": "2026-01-10T10:00:00Z",
      "updatedAt": "2026-01-10T10:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 15,
    "totalPages": 2
  }
}
```

---

### 4. **Get Specific Subject Assignment**

**Endpoint:** `GET /institutes/:instituteId/classes/:classId/subjects/:subjectId`

**Access:** Institute Admin, Teacher, Student, Attendance Marker

**Description:** Get details of a specific subject assignment.

**Example:**
```typescript
// GET /institutes/1/classes/5/subjects/123
```

**Response:** Same structure as single item in Get All Subjects

---

### 5. **Update Subject Assignment**

**Endpoint:** `PATCH /institutes/:instituteId/classes/:classId/subjects/:subjectId`

**Access:** SUPERADMIN, Institute Admin, Teacher (with class and subject access)

**Description:** Update subject assignment details (e.g., change teacher, toggle active status).

**Request:**
```typescript
interface UpdateSubjectAssignmentRequest {
  teacherId?: string;     // Change assigned teacher
  isActive?: boolean;     // Activate/deactivate assignment
  enrollmentEnabled?: boolean;  // Enable/disable self-enrollment
  enrollmentKey?: string; // Set key (requires key) or leave empty (open enrollment)
}
```

**Example:**
```typescript
// PATCH /institutes/1/classes/5/subjects/123
{
  "teacherId": "789",
  "isActive": true,
  "enrollmentEnabled": true
  // enrollmentKey will be auto-generated if not provided
}
```

**Response:** Same as Get Specific Subject Assignment

**Use Cases:**
- Change teacher for a subject
- Temporarily deactivate subject
- Reactivate previously deactivated subject
- **Enable open enrollment (no key required)**
- **Enable key-required enrollment**
- **Disable enrollment (clears enrollment key)**
- **Update enrollment key**

---

### 6. **Delete (Unassign) Subject from Class**

**Endpoint:** `DELETE /institutes/:instituteId/classes/:classId/subjects/:subjectId`

**Access:** SUPERADMIN, Institute Admin, Teacher (with class and subject access)

**Description:** Permanently remove subject assignment from class.

**Example:**
```typescript
// DELETE /institutes/1/classes/5/subjects/123
```

**Response:**
```
204 No Content
```

**⚠️ Warning:** This is a permanent deletion. Consider using update with `isActive: false` for soft delete.

---

### 7. **Assign Teacher to Subject**

**Endpoint:** `PATCH /institutes/:instituteId/classes/:classId/subjects/:subjectId/assign-teacher`

**Access:** SUPERADMIN, Institute Admin

**Description:** Assign a teacher to teach a specific subject in a class.

**Request:**
```typescript
interface AssignTeacherRequest {
  teacherId: string;
}
```

**Example:**
```typescript
// PATCH /institutes/1/classes/5/subjects/123/assign-teacher
{
  "teacherId": "456"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Teacher assigned to subject successfully",
  "data": {
    "instituteId": "1",
    "classId": "5",
    "subjectId": "123",
    "teacherId": "456"
  }
}
```

---

### 8. **Unassign Teacher from Subject**

**Endpoint:** `PATCH /institutes/:instituteId/classes/:classId/subjects/:subjectId/unassign-teacher`

**Access:** SUPERADMIN, Institute Admin

**Description:** Remove teacher assignment from a subject.

**Example:**
```typescript
// PATCH /institutes/1/classes/5/subjects/123/unassign-teacher
```

**Response:**
```json
{
  "success": true,
  "message": "Teacher unassigned from subject successfully",
  "data": {
    "instituteId": "1",
    "classId": "5",
    "subjectId": "123",
    "teacherId": null
  }
}
```

---

### 9. **Get Teacher's Subjects in a Class**

**Endpoint:** `GET /institutes/:instituteId/classes/:classId/subjects/teacher/:teacherId`

**Access:** Institute Admin, Teacher

**Description:** Get all subjects assigned to a specific teacher in a class.

**Example:**
```typescript
// GET /institutes/1/classes/5/subjects/teacher/456
```

**Response:** Array of subject assignments (same structure as Get All Subjects)

---

## 🌐 Global Endpoints (Cross-Class)

### 10. **Get All Institute Class Subjects**

**Endpoint:** `GET /institute-class-subjects`

**Query Parameters:**
```typescript
interface GlobalSubjectsQuery {
  instituteId?: string;
  classId?: string;
  subjectId?: string;
  teacherId?: string;
  isActive?: boolean;
  page?: number;
  limit?: number;
}
```

**Example:**
```typescript
// GET /institute-class-subjects?instituteId=1&teacherId=456
```

---

### 11. **Get Teacher's All Subjects**

**Endpoint:** `GET /institute-class-subjects/teacher/:teacherId`

**Description:** Get all subjects assigned to a teacher across all classes.

**Example:**
```typescript
// GET /institute-class-subjects/teacher/456
```

**Response:**
```json
{
  "data": [
    {
      "instituteId": "1",
      "classId": "5",
      "subjectId": "123",
      "subject": { "name": "Mathematics" },
      "class": { "name": "Grade 10A" }
    },
    {
      "instituteId": "1",
      "classId": "6",
      "subjectId": "124",
      "subject": { "name": "Physics" },
      "class": { "name": "Grade 11B" }
    }
  ]
}
```

---

### 12. **Get Institute's All Class Subjects**

**Endpoint:** `GET /institute-class-subjects/institute/:instituteId`

**Description:** Get all subject assignments for an entire institute.

---

### 13. **Get Teacher's Subjects in Institute**

**Endpoint:** `GET /institute-class-subjects/institute/:instituteId/teacher/:teacherId`

**Description:** Get all classes and subjects assigned to a teacher in a specific institute.

---

### 14. **Get Statistics**

**Endpoint:** `GET /institute-class-subjects/stats?instituteId=1`

**Access:** SUPERADMIN, Institute Admin

**Description:** Get statistics about subject assignments.

**Response:**
```json
{
  "totalAssignments": 150,
  "activeAssignments": 145,
  "inactiveAssignments": 5,
  "totalSubjects": 25,
  "totalClasses": 10,
  "subjectsPerClass": 15.0,
  "teachersWithAssignments": 20
}
```

---

## � Enrollment Management

### Overview
When assigning subjects to classes, you can enable **self-enrollment** functionality. This allows students to join subjects using an enrollment key.

### Features:
- ✅ **Enable/Disable enrollment** per subject
- ✅ **Auto-generate enrollment keys** (format: XXXX-XXXX)
- ✅ **Custom enrollment keys** (teacher-defined)
- ✅ **Unique keys** enforced at database level
- ✅ **Automatic key clearing** when enrollment disabled

### Enrollment Key Format:
- **Auto-generated:** `AB3K-9MN2` (8 chars, excludes confusing chars like 0, O, 1, I)
- **Custom:** Any string up to 50 characters
- **Uniqueness:** Enforced across all subject assignments

### Enable Enrollment Example:

**When Assigning Subject:**
```typescript
// Open enrollment (no key required)
POST /institutes/1/classes/5/subjects
{
  "subjectId": "123",
  "teacherId": "456",
  "enrollmentEnabled": true
  // No enrollmentKey = open enrollment
}

// Key-required enrollment
POST /institutes/1/classes/5/subjects
{
  "subjectId": "123",
  "teacherId": "456",
  "enrollmentEnabled": true,
  "enrollmentKey": "MATH-2026"
}
```

**Toggle Enrollment Later:**
```typescript
// Enable open enrollment (no key)
PATCH /institutes/1/classes/5/subjects/123
{
  "enrollmentEnabled": true
}

// Enable key-required enrollment
PATCH /institutes/1/classes/5/subjects/123
{
  "enrollmentEnabled": true,
  "enrollmentKey": "PHYSICS-2026"
}

// Disable enrollment (clears key automatically)
PATCH /institutes/1/classes/5/subjects/123
{
  "enrollmentEnabled": false
}
```

### Response with Enrollment Data:
```json
// Open enrollment (no key required)
{
  "instituteId": "1",
  "classId": "5",
  "subjectId": "123",
  "subject": { "name": "Mathematics" },
  "teacherId": "456",
  "isActive": true,
  "enrollmentEnabled": true,
  "enrollmentKey": null,
  "createdAt": "2026-01-10T10:00:00Z",
  "updatedAt": "2026-01-10T10:00:00Z"
}

// Key-required enrollment
{
  "instituteId": "1",
  "classId": "5",
  "subjectId": "124",
  "subject": { "name": "Physics" },
  "teacherId": "456",
  "isActive": true,
  "enrollmentEnabled": true,
  "enrollmentKey": "PHYSICS-2026",
  "createdAt": "2026-01-10T10:00:00Z",
  "updatedAt": "2026-01-10T10:00:00Z"
}
```

---

## �🎨 Frontend Component Examples

### 1. **Subject Assignment Modal**

```tsx
import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';

interface AssignSubjectModalProps {
  instituteId: string;
  classId: string;
  onSuccess: () => void;
  onClose: () => void;
}

export const AssignSubjectModal: React.FC<AssignSubjectModalProps> = ({
  instituteId,
  classId,
  onSuccess,
  onClose
}) => {
  const [selectedSubject, setSelectedSubject] = useState('');
  const [selectedTeacher, setSelectedTeacher] = useState('');
  const [enrollmentEnabled, setEnrollmentEnabled] = useState(false);
  const [customEnrollmentKey, setCustomEnrollmentKey] = useState('');

  // Fetch available subjects
  const { data: subjects } = useQuery({
    queryKey: ['subjects', instituteId],
    queryFn: () => fetch(`/api/subjects?instituteId=${instituteId}`).then(r => r.json())
  });

  // Fetch available teachers
  const { data: teachers } = useQuery({
    queryKey: ['teachers', instituteId],
    queryFn: () => fetch(`/api/users/teachers?instituteId=${instituteId}`).then(r => r.json())
  });

  // Assign subject mutation
  const assignMutation = useMutation({
    mutationFn: async (data: { 
      subjectId: string; 
      teacherId?: string;
      enrollmentEnabled?: boolean;
      enrollmentKey?: string;
    }) => {
      const response = await fetch(
        `/api/institutes/${instituteId}/classes/${classId}/subjects`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        }
      );
      if (!response.ok) throw new Error('Failed to assign subject');
      return response.json();
    },
    onSuccess: () => {
      onSuccess();
      onClose();
    }
  });

  const handleSubmit = () => {
    assignMutation.mutate({
      subjectId: selectedSubject,
      teacherId: selectedTeacher || undefined,
      enrollmentEnabled,
      enrollmentKey: enrollmentEnabled && customEnrollmentKey ? customEnrollmentKey : undefined
    });
  };

  return (
    <div className="modal">
      <h2>Assign Subject to Class</h2>
      
      <div className="form-group">
        <label>Select Subject *</label>
        <select
          value={selectedSubject}
          onChange={(e) => setSelectedSubject(e.target.value)}
          required
        >
          <option value="">-- Select Subject --</option>
          {subjects?.data?.map((subject: any) => (
            <option key={subject.id} value={subject.id}>
              {subject.code} - {subject.name}
            </option>
          ))}
        </select>
      </div>

      <div className="form-group">
        <label>Assign Teacher (Optional)</label>
        <select
          value={selectedTeacher}
          onChange={(e) => setSelectedTeacher(e.target.value)}
        >
          <option value="">-- No Teacher --</option>
          {teachers?.data?.map((teacher: any) => (
            <option key={teacher.id} value={teacher.id}>
              {teacher.nameWithInitials} ({teacher.email})
            </option>
          ))}
        </select>
      </div>

      <div className="form-group">
        <label>
          <input
            type="checkbox"
            checked={enrollmentEnabled}
            onChange={(e) => setEnrollmentEnabled(e.target.checked)}
          />
          Enable Self-Enrollment
        </label>
        <small className="help-text">
          Allows students to join this subject using an enrollment key
        </small>
      </div>

      {enrollmentEnabled && (
        <div className="form-group">
          <label>Custom Enrollment Key (Optional)</label>
          <input
            type="text"
            value={customEnrollmentKey}
            onChange={(e) => setCustomEnrollmentKey(e.target.value)}
            placeholder="Leave empty for open enrollment"
            maxLength={50}
          />
          <small className="help-text">
            With key: Students need key to enroll (e.g., MATH-2026)<br />
            Without key: Open enrollment - any student can join
          </small>
        </div>
      )}

      <div className="button-group">
        <button onClick={onClose}>Cancel</button>
        <button 
          onClick={handleSubmit}
          disabled={!selectedSubject || assignMutation.isPending}
        >
          {assignMutation.isPending ? 'Assigning...' : 'Assign Subject'}
        </button>
      </div>
    </div>
  );
};
```

---

### 2. **Enrollment Toggle Component**

```tsx
import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

interface EnrollmentToggleProps {
  instituteId: string;
  classId: string;
  subjectId: string;
  currentEnrollmentEnabled: boolean;
  currentEnrollmentKey?: string;
}

export const EnrollmentToggle: React.FC<EnrollmentToggleProps> = ({
  instituteId,
  classId,
  subjectId,
  currentEnrollmentEnabled,
  currentEnrollmentKey
}) => {
  const queryClient = useQueryClient();
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [customKey, setCustomKey] = useState('');

  const toggleEnrollmentMutation = useMutation({
    mutationFn: async (data: { enrollmentEnabled: boolean; enrollmentKey?: string }) => {
      const response = await fetch(
        `/api/institutes/${instituteId}/classes/${classId}/subjects/${subjectId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        }
      );
      if (!response.ok) throw new Error('Failed to update enrollment');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['class-subjects'] });
      setShowKeyInput(false);
      setCustomKey('');
    }
  });

  const handleToggle = (enabled: boolean) => {
    if (enabled && !currentEnrollmentKey) {
      // Enabling enrollment - show option for custom key
      setShowKeyInput(true);
    } else {
      // Disabling enrollment or already has key
      toggleEnrollmentMutation.mutate({ enrollmentEnabled: enabled });
    }
  };

  const handleSubmitWithKey = () => {
    toggleEnrollmentMutation.mutate({
      enrollmentEnabled: true,
      enrollmentKey: customKey || undefined
    });
  };

  return (
    <div className="enrollment-toggle">
      <div className="enrollment-status">
        <label className="toggle-switch">
          <input
            type="checkbox"
            checked={currentEnrollmentEnabled}
            onChange={(e) => handleToggle(e.target.checked)}
            disabled={toggleEnrollmentMutation.isPending}
          />
          <span className="slider"></span>
        </label>
        <span>Self-Enrollment {currentEnrollmentEnabled ? 'Enabled' : 'Disabled'}</span>
      </div>

      {currentEnrollmentEnabled && currentEnrollmentKey && (
        <div className="enrollment-key-display">
          <label>Enrollment Key:</label>
          <code className="enrollment-key">{currentEnrollmentKey}</code>
          <button
            onClick={() => navigator.clipboard.writeText(currentEnrollmentKey)}
            className="btn-copy"
          >
            📋 Copy
          </button>
        </div>
      )}

      {showKeyInput && (
        <div className="enrollment-key-input">
          <input
            type="text"
            value={customKey}
            onChange={(e) => setCustomKey(e.target.value)}
            placeholder="Enter custom key or leave empty"
            maxLength={50}
          />
          <button onClick={handleSubmitWithKey} className="btn-primary">
            {customKey ? 'Set Custom Key' : 'Auto-Generate Key'}
          </button>
          <button onClick={() => setShowKeyInput(false)} className="btn-secondary">
            Cancel
          </button>
        </div>
      )}
    </div>
  );
};
```

---

### 3. **Class Subjects List Component**

```tsx
import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface ClassSubjectsListProps {
  instituteId: string;
  classId: string;
}

export const ClassSubjectsList: React.FC<ClassSubjectsListProps> = ({
  instituteId,
  classId
}) => {
  const queryClient = useQueryClient();

  // Fetch class subjects
  const { data, isLoading } = useQuery({
    queryKey: ['class-subjects', instituteId, classId],
    queryFn: () => 
      fetch(`/api/institutes/${instituteId}/classes/${classId}/subjects?limit=-1`)
        .then(r => r.json())
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (subjectId: string) => {
      const response = await fetch(
        `/api/institutes/${instituteId}/classes/${classId}/subjects/${subjectId}`,
        { method: 'DELETE' }
      );
      if (!response.ok) throw new Error('Failed to delete');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['class-subjects'] });
    }
  });

  // Toggle active mutation
  const toggleActiveMutation = useMutation({
    mutationFn: async ({ subjectId, isActive }: { subjectId: string; isActive: boolean }) => {
      const response = await fetch(
        `/api/institutes/${instituteId}/classes/${classId}/subjects/${subjectId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isActive })
        }
      );
      if (!response.ok) throw new Error('Failed to update');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['class-subjects'] });
    }
  });

  if (isLoading) return <div>Loading subjects...</div>;

  return (
    <div className="subjects-list">
      <div className="header">
        <h3>Class Subjects ({data?.data?.length || 0})</h3>
        <button onClick={() => {/* Open assign modal */}}>
          + Assign Subject
        </button>
      </div>

      <table>
        <thead>
          <tr>
            <th>Code</th>
            <th>Subject Name</th>
            <th>Type</th>
            <th>Teacher</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {data?.data?.map((assignment: any) => (
            <tr key={assignment.subjectId}>
              <td>{assignment.subject.code}</td>
              <td>
                <div className="subject-info">
                  {assignment.subject.imgUrl && (
                    <img 
                      src={assignment.subject.imgUrl} 
                      alt={assignment.subject.name}
                      className="subject-icon"
                    />
                  )}
                  <span>{assignment.subject.name}</span>
                </div>
              </td>
              <td>
                <span className="badge badge-info">
                  {assignment.subject.subjectType}
                </span>
              </td>
              <td>
                {assignment.teacher ? (
                  <div className="teacher-info">
                    {assignment.teacher.imageUrl && (
                      <img 
                        src={assignment.teacher.imageUrl} 
                        alt={assignment.teacher.nameWithInitials}
                        className="teacher-avatar"
                      />
                    )}
                    <span>{assignment.teacher.nameWithInitials}</span>
                  </div>
                ) : (
                  <span className="text-muted">No teacher assigned</span>
                )}
              </td>
              <td>
                <span className={`badge ${assignment.isActive ? 'badge-success' : 'badge-warning'}`}>
                  {assignment.isActive ? 'Active' : 'Inactive'}
                </span>
              </td>
              <td>
                <div className="action-buttons">
                  <button
                    onClick={() => toggleActiveMutation.mutate({
                      subjectId: assignment.subjectId,
                      isActive: !assignment.isActive
                    })}
                    className="btn-sm"
                  >
                    {assignment.isActive ? 'Deactivate' : 'Activate'}
                  </button>
                  <button
                    onClick={() => {/* Open teacher assignment */}}
                    className="btn-sm btn-primary"
                  >
                    Assign Teacher
                  </button>
                  <button
                    onClick={() => {
                      if (confirm('Are you sure you want to remove this subject?')) {
                        deleteMutation.mutate(assignment.subjectId);
                      }
                    }}
                    className="btn-sm btn-danger"
                  >
                    Remove
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
```

---

### 3. **Bulk Subject Assignment Component**

```tsx
import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';

interface BulkAssignProps {
  instituteId: string;
  classId: string;
  availableSubjects: Array<{ id: string; name: string; code: string }>;
  availableTeachers: Array<{ id: string; nameWithInitials: string }>;
  onSuccess: () => void;
}

export const BulkSubjectAssignment: React.FC<BulkAssignProps> = ({
  instituteId,
  classId,
  availableSubjects,
  availableTeachers,
  onSuccess
}) => {
  const [assignments, setAssignments] = useState<Array<{
    subjectId: string;
    teacherId?: string;
  }>>([]);

  const bulkAssignMutation = useMutation({
    mutationFn: async (subjects: Array<{ subjectId: string; teacherId?: string }>) => {
      const response = await fetch(
        `/api/institutes/${instituteId}/classes/${classId}/subjects/bulk`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subjects })
        }
      );
      if (!response.ok) throw new Error('Bulk assignment failed');
      return response.json();
    },
    onSuccess: (data) => {
      alert(`Successfully assigned ${data.data.successful} out of ${data.data.total} subjects`);
      onSuccess();
    }
  });

  const addAssignment = () => {
    setAssignments([...assignments, { subjectId: '', teacherId: undefined }]);
  };

  const updateAssignment = (index: number, field: 'subjectId' | 'teacherId', value: string) => {
    const updated = [...assignments];
    updated[index][field] = value || undefined;
    setAssignments(updated);
  };

  const removeAssignment = (index: number) => {
    setAssignments(assignments.filter((_, i) => i !== index));
  };

  const handleSubmit = () => {
    const valid = assignments.filter(a => a.subjectId);
    if (valid.length === 0) {
      alert('Please add at least one subject');
      return;
    }
    bulkAssignMutation.mutate(valid);
  };

  return (
    <div className="bulk-assignment">
      <h3>Bulk Assign Subjects</h3>
      
      {assignments.map((assignment, index) => (
        <div key={index} className="assignment-row">
          <select
            value={assignment.subjectId}
            onChange={(e) => updateAssignment(index, 'subjectId', e.target.value)}
          >
            <option value="">-- Select Subject --</option>
            {availableSubjects.map(subject => (
              <option key={subject.id} value={subject.id}>
                {subject.code} - {subject.name}
              </option>
            ))}
          </select>

          <select
            value={assignment.teacherId || ''}
            onChange={(e) => updateAssignment(index, 'teacherId', e.target.value)}
          >
            <option value="">-- Optional Teacher --</option>
            {availableTeachers.map(teacher => (
              <option key={teacher.id} value={teacher.id}>
                {teacher.nameWithInitials}
              </option>
            ))}
          </select>

          <button onClick={() => removeAssignment(index)}>Remove</button>
        </div>
      ))}

      <button onClick={addAssignment} className="btn-secondary">
        + Add Another Subject
      </button>

      <button 
        onClick={handleSubmit}
        disabled={bulkAssignMutation.isPending || assignments.length === 0}
        className="btn-primary"
      >
        {bulkAssignMutation.isPending ? 'Assigning...' : `Assign ${assignments.length} Subjects`}
      </button>
    </div>
  );
};
```

---

## 📋 TypeScript Interfaces

```typescript
// Subject Assignment Types
export interface SubjectAssignment {
  instituteId: string;
  classId: string;
  subjectId: string;
  subject: Subject;
  teacherId?: string;
  teacher?: Teacher;
  isActive: boolean;
  enrollmentEnabled: boolean;
  enrollmentKey?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Subject {
  id: string;
  code: string;
  name: string;
  description?: string;
  category?: string;
  imgUrl?: string;
  subjectType: string;
  basketCategory?: string;
  isActive: boolean;
}

export interface Teacher {
  id: string;
  nameWithInitials: string;
  email: string;
  phoneNumber?: string;
  imageUrl?: string;
}

// API Response Types
export interface AssignSubjectResponse {
  success: boolean;
  message: string;
  data: SubjectAssignment;
}

export interface ClassSubjectsResponse {
  data: SubjectAssignment[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface BulkAssignResponse {
  success: boolean;
  message: string;
  data: {
    total: number;
    successful: number;
    failed: number;
    results: Array<{
      subjectId: string;
      success: boolean;
      message?: string;
      data?: SubjectAssignment;
    }>;
  };
}
```

---

## 🔐 Access Control Summary

| Endpoint | SUPERADMIN | Institute Admin | Teacher | Student | Attendance Marker |
|----------|------------|-----------------|---------|---------|-------------------|
| Assign Subject | ✅ | ✅ | ✅ (with class access) | ❌ | ❌ |
| Bulk Assign | ✅ | ✅ | ✅ (with class access) | ❌ | ❌ |
| Get Class Subjects | ✅ | ✅ | ✅ (with class access) | ✅ (with class access) | ✅ (institute-level) |
| Get Specific Subject | ✅ | ✅ | ✅ (with access) | ✅ (with access) | ✅ |
| Update Assignment | ✅ | ✅ | ✅ (with class & subject access) | ❌ | ❌ |
| Delete Assignment | ✅ | ✅ | ✅ (with class & subject access) | ❌ | ❌ |
| Assign Teacher | ✅ | ✅ | ❌ | ❌ | ❌ |
| Unassign Teacher | ✅ | ✅ | ❌ | ❌ | ❌ |

---

## 🚀 Common Use Cases

### 1. **Class Setup: Assign All Subjects**
```typescript
// Use bulk assignment for initial class setup
const classSetup = async () => {
  const subjects = [
    { subjectId: '101', teacherId: '201' },
    { subjectId: '102', teacherId: '202' },
    { subjectId: '103', teacherId: '203' }
  ];
  
  await fetch(`/api/institutes/1/classes/5/subjects/bulk`, {
    method: 'POST',
    body: JSON.stringify({ subjects })
  });
};
```

### 2. **Teacher Change: Update Assignment**
```typescript
// Change teacher for a subject
await fetch(`/api/institutes/1/classes/5/subjects/123`, {
  method: 'PATCH',
  body: JSON.stringify({ teacherId: '789' })
});
```

### 3. **Temporary Deactivation**
```typescript
// Deactivate subject temporarily (e.g., teacher on leave)
await fetch(`/api/institutes/1/classes/5/subjects/123`, {
  method: 'PATCH',
  body: JSON.stringify({ isActive: false })
});
```

### 4. **Remove Subject from Class**
```typescript
// Permanently remove subject assignment
await fetch(`/api/institutes/1/classes/5/subjects/123`, {
  method: 'DELETE'
});
```

---

## 📚 Additional Resources

- Subject API Documentation: See [SUBJECT_MIGRATION_IMPLEMENTATION_GUIDE.md](SUBJECT_MIGRATION_IMPLEMENTATION_GUIDE.md)
- Attendance Integration: See [ATTENDANCE_FRONTEND_MIGRATION_GUIDE.md](ATTENDANCE_FRONTEND_MIGRATION_GUIDE.md)
- Backend Implementation: `src/modules/institute_class_modules/institute_class_subject/`
- API Documentation: `/api-docs` endpoint

---

**Last Updated:** January 10, 2026
**Status:** ✅ Ready for Frontend Integration
**Version:** v2.0.0+
