# Teacher Assignment APIs - Frontend Integration Guide

## Overview
This document provides complete API documentation for teacher assignment functionality in both **Institute Classes** and **Institute Class Subjects**. All responses now include teacher information (name, email, image) and new assign/unassign endpoints.

---

## 🎯 Institute Classes APIs

### Base URL: `/institute-classes`

---

### 1. **Get All Classes (Paginated)**
```
GET /institute-classes?instituteId={id}&page=1&limit=10
```

**Access:** Any institute role

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| instituteId | string | Yes | Institute ID |
| academicYear | string | No | Filter by academic year |
| grade | number | No | Filter by grade |
| isActive | boolean | No | Filter active/inactive classes |
| search | string | No | Search by name or code |
| page | number | No | Page number (default: 1) |
| limit | number | No | Items per page (default: 10) |

**Response Body:**
```json
{
  "data": [
    {
      "id": "123",
      "name": "Grade 10 - Mathematics A",
      "code": "G10-MATH-A",
      "grade": 10,
      "specialty": "Advanced",
      "classType": "REGULAR",
      "academicYear": "2024/2025",
      "instituteId": "456",
      "classTeacherId": "789",
      "imageUrl": "https://storage.googleapis.com/bucket/class-image.jpg",
      "isActive": true,
      "startDate": "2024-01-15",
      "endDate": "2024-12-20",
      "enrollmentEnabled": false,
      "enrollmentCode": null,
      "requireTeacherVerification": true,
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z",
      
      // ✨ NEW: Complete teacher information
      "classTeacher": {
        "id": "789",
        "firstName": "John",
        "lastName": "Smith",
        "email": "john.smith@school.com",
        "imageUrl": "https://storage.googleapis.com/bucket/teacher-profile.jpg",
        "phoneNumber": "+1234567890",
        "userType": "TEACHER"
      }
    }
  ],
  "meta": {
    "total": 50,
    "page": 1,
    "limit": 10,
    "totalPages": 5
  }
}
```

**Note:** If no teacher is assigned, `classTeacher` will be `null`.

---

### 2. **Get Single Class**
```
GET /institute-classes/:id
```

**Access:** Any institute role

**Response:** Same structure as individual class object above.

---

### 3. **Assign Teacher to Class** ⭐ NEW
```
PATCH /institute-classes/:id/assign-teacher
```

**Access:** Institute Admin or SUPERADMIN only

**Request Body:**
```json
{
  "teacherId": "789"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Teacher assigned to class successfully",
  "data": {
    "classId": "123",
    "teacherId": "789"
  }
}
```

**Frontend Implementation:**
```typescript
// Example React/TypeScript
const assignTeacher = async (classId: string, teacherId: string) => {
  const response = await fetch(`/institute-classes/${classId}/assign-teacher`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ teacherId })
  });
  
  if (response.ok) {
    // Refresh class list to show updated teacher
    refreshClassList();
  }
};
```

---

### 4. **Unassign Teacher from Class** ⭐ NEW
```
PATCH /institute-classes/:id/unassign-teacher
```

**Access:** Institute Admin or SUPERADMIN only

**Response:**
```json
{
  "success": true,
  "message": "Teacher unassigned from class successfully",
  "data": {
    "classId": "123"
  }
}
```

**Frontend Implementation:**
```typescript
const unassignTeacher = async (classId: string) => {
  const response = await fetch(`/institute-classes/${classId}/unassign-teacher`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  if (response.ok) {
    // Refresh class list - teacher will be null
    refreshClassList();
  }
};
```

---

## 🎯 Institute Class Subjects APIs

### Base URL: `/institutes/:instituteId/classes/:classId/subjects`

---

### 5. **Get All Subjects in Class (Paginated)**
```
GET /institutes/:instituteId/classes/:classId/subjects?page=1&limit=10
```

**Access:** Teacher, Student, Attendance Marker, Institute Admin

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| isActive | boolean | No | Filter active/inactive subjects |
| teacherId | string | No | Filter by teacher ID |
| search | string | No | Search by subject name/code |
| page | number | No | Page number (default: 1) |
| limit | number | No | Items per page (default: 10) |

**Response Body:**
```json
{
  "data": [
    {
      "instituteId": "456",
      "classId": "123",
      "subjectId": "789",
      "teacherId": "101",
      "isActive": true,
      "enrollmentEnabled": false,
      "enrollmentKey": null,
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z",
      
      // Subject details
      "subject": {
        "id": "789",
        "code": "MATH101",
        "name": "Advanced Mathematics",
        "description": "Advanced mathematical concepts for grade 10",
        "category": "Science",
        "creditHours": 3,
        "isActive": true,
        "subjectType": "CORE",
        "basketCategory": null,
        "instituteType": "SCHOOL",
        "imgUrl": "https://storage.googleapis.com/bucket/math-subject.jpg",
        "createdAt": "2024-01-01T00:00:00.000Z",
        "updatedAt": "2024-01-01T00:00:00.000Z"
      },
      
      // ✨ NEW: Complete teacher information
      "teacher": {
        "id": "101",
        "firstName": "Jane",
        "lastName": "Doe",
        "email": "jane.doe@school.com",
        "imageUrl": "https://storage.googleapis.com/bucket/teacher-jane.jpg"
      }
    }
  ],
  "total": 25,
  "page": 1,
  "limit": 10,
  "totalPages": 3
}
```

**Note:** If no teacher is assigned to a subject, `teacher` will be `null`.

---

### 6. **Get Single Subject**
```
GET /institutes/:instituteId/classes/:classId/subjects/:subjectId
```

**Access:** Teacher (with subject access), Student, Attendance Marker, Institute Admin

**Response:** Same structure as individual subject object above.

---

### 7. **Assign Teacher to Subject** ⭐ NEW
```
PATCH /institutes/:instituteId/classes/:classId/subjects/:subjectId/assign-teacher
```

**Access:** Institute Admin or SUPERADMIN only

**Request Body:**
```json
{
  "teacherId": "101"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Teacher assigned to subject successfully",
  "data": {
    "instituteId": "456",
    "classId": "123",
    "subjectId": "789",
    "teacherId": "101"
  }
}
```

**Frontend Implementation:**
```typescript
const assignTeacherToSubject = async (
  instituteId: string,
  classId: string,
  subjectId: string,
  teacherId: string
) => {
  const response = await fetch(
    `/institutes/${instituteId}/classes/${classId}/subjects/${subjectId}/assign-teacher`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ teacherId })
    }
  );
  
  if (response.ok) {
    // Refresh subject list to show updated teacher
    refreshSubjectList();
  }
};
```

---

### 8. **Unassign Teacher from Subject** ⭐ NEW
```
PATCH /institutes/:instituteId/classes/:classId/subjects/:subjectId/unassign-teacher
```

**Access:** Institute Admin or SUPERADMIN only

**Response:**
```json
{
  "success": true,
  "message": "Teacher unassigned from subject successfully",
  "data": {
    "instituteId": "456",
    "classId": "123",
    "subjectId": "789"
  }
}
```

**Frontend Implementation:**
```typescript
const unassignTeacherFromSubject = async (
  instituteId: string,
  classId: string,
  subjectId: string
) => {
  const response = await fetch(
    `/institutes/${instituteId}/classes/${classId}/subjects/${subjectId}/unassign-teacher`,
    {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    }
  );
  
  if (response.ok) {
    // Refresh subject list - teacher will be null
    refreshSubjectList();
  }
};
```

---

## 🎨 Frontend UI Implementation Guide

### **Institute Level - All Classes Tab**

#### **UI Components to Add (Institute Admin Only)**

For each class in the list, add these buttons **only for Institute Admins**:

```tsx
interface ClassCardProps {
  classData: {
    id: string;
    name: string;
    classTeacher: {
      id: string;
      firstName: string;
      lastName: string;
      email: string;
      imageUrl: string;
    } | null;
  };
  isInstituteAdmin: boolean;
}

const ClassCard = ({ classData, isInstituteAdmin }: ClassCardProps) => {
  return (
    <div className="class-card">
      <h3>{classData.name}</h3>
      
      {/* Teacher Display */}
      <div className="teacher-section">
        {classData.classTeacher ? (
          <div className="teacher-info">
            <img 
              src={classData.classTeacher.imageUrl} 
              alt={`${classData.classTeacher.firstName} ${classData.classTeacher.lastName}`}
              className="teacher-avatar"
            />
            <div>
              <p className="teacher-name">
                {classData.classTeacher.firstName} {classData.classTeacher.lastName}
              </p>
              <p className="teacher-email">{classData.classTeacher.email}</p>
            </div>
            
            {/* ⭐ ADMIN ONLY: Unassign Button */}
            {isInstituteAdmin && (
              <button 
                onClick={() => unassignTeacher(classData.id)}
                className="btn-unassign"
              >
                Remove Teacher
              </button>
            )}
          </div>
        ) : (
          <div className="no-teacher">
            <p>No teacher assigned</p>
            
            {/* ⭐ ADMIN ONLY: Assign Button */}
            {isInstituteAdmin && (
              <button 
                onClick={() => openTeacherSelector(classData.id)}
                className="btn-assign"
              >
                Assign Teacher
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
```

#### **Teacher Selector Modal (Institute Admin Only)**

```tsx
interface TeacherSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  classId: string;
  availableTeachers: Array<{
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    imageUrl: string;
  }>;
}

const TeacherSelectorModal = ({ 
  isOpen, 
  onClose, 
  classId, 
  availableTeachers 
}: TeacherSelectorModalProps) => {
  const [selectedTeacherId, setSelectedTeacherId] = useState('');
  
  const handleAssign = async () => {
    await assignTeacher(classId, selectedTeacherId);
    onClose();
  };
  
  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <h2>Select Teacher for Class</h2>
      
      <div className="teacher-list">
        {availableTeachers.map(teacher => (
          <div 
            key={teacher.id}
            className={`teacher-item ${selectedTeacherId === teacher.id ? 'selected' : ''}`}
            onClick={() => setSelectedTeacherId(teacher.id)}
          >
            <img src={teacher.imageUrl} alt={teacher.firstName} />
            <div>
              <p>{teacher.firstName} {teacher.lastName}</p>
              <p className="email">{teacher.email}</p>
            </div>
            {selectedTeacherId === teacher.id && <span>✓</span>}
          </div>
        ))}
      </div>
      
      <div className="modal-actions">
        <button onClick={onClose} className="btn-cancel">Cancel</button>
        <button 
          onClick={handleAssign} 
          disabled={!selectedTeacherId}
          className="btn-assign-primary"
        >
          Assign Teacher
        </button>
      </div>
    </Modal>
  );
};
```

---

### **Subject Management UI (Institute Admin Only)**

Similar implementation for subjects within each class:

```tsx
const SubjectCard = ({ subjectData, isInstituteAdmin }: SubjectCardProps) => {
  return (
    <div className="subject-card">
      <div className="subject-header">
        <img src={subjectData.subject.imgUrl} alt={subjectData.subject.name} />
        <h4>{subjectData.subject.name}</h4>
        <span className="subject-code">{subjectData.subject.code}</span>
      </div>
      
      {/* Teacher Info */}
      <div className="subject-teacher">
        {subjectData.teacher ? (
          <>
            <img 
              src={subjectData.teacher.imageUrl} 
              alt={`${subjectData.teacher.firstName} ${subjectData.teacher.lastName}`}
              className="teacher-avatar-small"
            />
            <span>
              {subjectData.teacher.firstName} {subjectData.teacher.lastName}
            </span>
            
            {/* ⭐ ADMIN ONLY: Unassign Button */}
            {isInstituteAdmin && (
              <button 
                onClick={() => unassignTeacherFromSubject(
                  subjectData.instituteId,
                  subjectData.classId,
                  subjectData.subjectId
                )}
                className="btn-icon-remove"
                title="Remove teacher"
              >
                ✕
              </button>
            )}
          </>
        ) : (
          <>
            <span className="no-teacher-text">No teacher</span>
            
            {/* ⭐ ADMIN ONLY: Assign Button */}
            {isInstituteAdmin && (
              <button 
                onClick={() => openSubjectTeacherSelector(
                  subjectData.instituteId,
                  subjectData.classId,
                  subjectData.subjectId
                )}
                className="btn-icon-add"
                title="Assign teacher"
              >
                +
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};
```

---

## 🔒 Access Control Summary

| Endpoint | Institute Admin | SUPERADMIN | Teacher | Student | Other |
|----------|----------------|------------|---------|---------|-------|
| GET Classes | ✅ | ✅ | ✅ | ✅ | ✅ |
| GET Subjects | ✅ | ✅ | ✅ | ✅ | ✅ |
| Assign Teacher to Class | ✅ | ✅ | ❌ | ❌ | ❌ |
| Unassign Teacher from Class | ✅ | ✅ | ❌ | ❌ | ❌ |
| Assign Teacher to Subject | ✅ | ✅ | ❌ | ❌ | ❌ |
| Unassign Teacher from Subject | ✅ | ✅ | ❌ | ❌ | ❌ |

---

## 📋 Frontend Checklist

### **For All Classes Tab (Institute Level)**

- [ ] Display teacher information (name, email, image) for each class
- [ ] Show "No teacher assigned" when `classTeacher` is `null`
- [ ] **Admin Only:** Add "Assign Teacher" button when no teacher assigned
- [ ] **Admin Only:** Add "Remove Teacher" button when teacher is assigned
- [ ] **Admin Only:** Implement teacher selector modal with search/filter
- [ ] **Admin Only:** Handle assign/unassign API calls with loading states
- [ ] **Admin Only:** Show success/error notifications after operations
- [ ] **Admin Only:** Refresh class list after teacher assignment changes
- [ ] Hide assign/unassign buttons for non-admin users

### **For Subjects Management**

- [ ] Display teacher information for each subject
- [ ] Show placeholder when `teacher` is `null`
- [ ] **Admin Only:** Add assign/unassign teacher buttons
- [ ] **Admin Only:** Implement subject teacher selector modal
- [ ] **Admin Only:** Handle API calls with proper error handling
- [ ] **Admin Only:** Update UI after successful operations
- [ ] Hide admin controls for teachers, students, and other roles

---

## 🎯 Key Changes Summary

### **What's Enhanced:**

1. **Response Bodies Now Include:**
   - Complete teacher information (id, firstName, lastName, email, imageUrl)
   - Available in both class and subject responses
   - Teacher field is `null` when no teacher is assigned

2. **New Endpoints Added:**
   - Assign/unassign teacher to class (2 endpoints)
   - Assign/unassign teacher to subject (2 endpoints)
   - All require Institute Admin or SUPERADMIN access

3. **Frontend Changes Required:**
   - Display teacher info in class/subject cards
   - Add assign/unassign buttons (Institute Admin only)
   - Implement teacher selector modals
   - Hide admin controls for non-admin users

### **Previous Behavior:**
- Classes/subjects returned `classTeacherId` / `teacherId` as strings only
- No teacher details in response
- No dedicated assign/unassign endpoints

### **New Behavior:**
- Classes/subjects return complete `classTeacher` / `teacher` objects
- Full teacher details (name, email, image) included
- Dedicated endpoints for teacher management
- Institute Admin can manage teacher assignments via UI

---

## 💡 Example: Complete Frontend Flow

```typescript
// 1. Fetch classes with teacher info
const fetchClasses = async (instituteId: string) => {
  const response = await fetch(
    `/institute-classes?instituteId=${instituteId}&page=1&limit=50`,
    {
      headers: { 'Authorization': `Bearer ${token}` }
    }
  );
  const data = await response.json();
  // data.data contains array of classes with classTeacher populated
  return data;
};

// 2. Check if user is institute admin
const isInstituteAdmin = user.role === 'INSTITUTE_ADMIN' || user.role === 'SUPERADMIN';

// 3. Render UI with conditional admin controls
const renderClassList = (classes, isAdmin) => {
  return classes.map(cls => (
    <ClassCard 
      key={cls.id}
      classData={cls}
      showAdminControls={isAdmin}
    />
  ));
};

// 4. Handle teacher assignment (admin only)
const handleAssignTeacher = async (classId: string, teacherId: string) => {
  try {
    const response = await fetch(
      `/institute-classes/${classId}/assign-teacher`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ teacherId })
      }
    );
    
    if (response.ok) {
      showSuccessNotification('Teacher assigned successfully');
      refreshClassList();
    } else {
      const error = await response.json();
      showErrorNotification(error.message);
    }
  } catch (error) {
    showErrorNotification('Failed to assign teacher');
  }
};
```

---

## 🐛 Error Handling

### Common Error Responses:

```json
// 403 Forbidden (non-admin trying to assign)
{
  "statusCode": 403,
  "message": "Access denied - Institute admin or SUPERADMIN access required",
  "error": "Forbidden"
}

// 404 Not Found (class/subject doesn't exist)
{
  "statusCode": 404,
  "message": "Class not found",
  "error": "Not Found"
}

// 400 Bad Request (invalid teacher ID)
{
  "statusCode": 400,
  "message": "Teacher not found or invalid",
  "error": "Bad Request"
}
```

### Frontend Error Handling:

```typescript
const handleApiError = (error: any) => {
  if (error.statusCode === 403) {
    showNotification('You do not have permission to perform this action', 'error');
  } else if (error.statusCode === 404) {
    showNotification('Resource not found', 'error');
  } else {
    showNotification(error.message || 'An error occurred', 'error');
  }
};
```

---

## 📞 Support

For questions or issues:
- Check that user has Institute Admin or SUPERADMIN role for assignment operations
- Verify teacher exists and is active before assignment
- Ensure class/subject exists before assignment
- Check API response for detailed error messages

---

**Document Version:** 1.0  
**Last Updated:** November 22, 2025  
**API Version:** Compatible with current LMS backend
