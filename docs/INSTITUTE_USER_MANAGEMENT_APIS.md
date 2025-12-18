# Institute User Management APIs Documentation

Complete API documentation for managing users in institutes, including activation, deactivation, role changes, and filtering inactive users.

## Base URL
```
http://localhost:8080/institute-users
```

## Authentication
All endpoints require JWT authentication via Bearer token in the Authorization header:
```
Authorization: Bearer <your_jwt_token>
```

---

## 1. Deactivate User (Soft Delete)

**Endpoint:** `PATCH /institute/:instituteId/users/:userId/deactivate`

**Description:** Soft delete a user from the institute by setting their status to `INACTIVE`. The user relationship is preserved but marked as inactive.

**Access Control:**
- Institute Admins (for their institute)
- Super Admins (for any institute)

**Parameters:**
- `instituteId` (path, required): Institute ID
- `userId` (path, required): User ID to deactivate

**Request Example:**
```http
PATCH /institute-users/institute/1/users/12345/deactivate
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response:**
```json
{
  "success": true,
  "message": "User deactivated successfully in institute",
  "userId": "12345",
  "instituteId": "1",
  "previousStatus": "ACTIVE",
  "newStatus": "INACTIVE"
}
```

**Status Codes:**
- `200` - User deactivated successfully
- `401` - Unauthorized (JWT missing or invalid)
- `403` - Forbidden (not an admin)
- `404` - User not found in this institute

---

## 2. Activate User

**Endpoint:** `PATCH /institute/:instituteId/users/:userId/activate`

**Description:** Activate a previously deactivated user by setting their status to `ACTIVE`.

**Access Control:**
- Institute Admins (for their institute)
- Super Admins (for any institute)

**Parameters:**
- `instituteId` (path, required): Institute ID
- `userId` (path, required): User ID to activate

**Request Example:**
```http
PATCH /institute-users/institute/1/users/12345/activate
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response:**
```json
{
  "success": true,
  "message": "User activated successfully in institute",
  "userId": "12345",
  "instituteId": "1",
  "previousStatus": "INACTIVE",
  "newStatus": "ACTIVE"
}
```

**Status Codes:**
- `200` - User activated successfully
- `401` - Unauthorized (JWT missing or invalid)
- `403` - Forbidden (not an admin)
- `404` - User not found in this institute

---

## 3. Change User Role

**Endpoint:** `PATCH /institute/:instituteId/users/:userId/change-role`

**Description:** Change a user's institute role (e.g., from STUDENT to TEACHER, or TEACHER to INSTITUTE_ADMIN).

**Access Control:**
- Institute Admins (for their institute)
- Super Admins (for any institute)

**Parameters:**
- `instituteId` (path, required): Institute ID
- `userId` (path, required): User ID whose role to change

**Request Body:**
```json
{
  "newRole": "TEACHER"
}
```

**Valid Roles:**
- `STUDENT` - Student role
- `TEACHER` - Teacher/instructor role
- `INSTITUTE_ADMIN` - Institute administrator
- `ACCOUNTANT` - Accountant role
- `LIBRARIAN` - Librarian role
- `PARENT` - Parent role

**Request Example:**
```http
PATCH /institute-users/institute/1/users/12345/change-role
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "newRole": "TEACHER"
}
```

**Response:**
```json
{
  "success": true,
  "message": "User role changed successfully in institute",
  "userId": "12345",
  "instituteId": "1",
  "previousRole": "STUDENT",
  "newRole": "TEACHER"
}
```

**Status Codes:**
- `200` - Role changed successfully
- `400` - Invalid role provided
- `401` - Unauthorized (JWT missing or invalid)
- `403` - Forbidden (not an admin)
- `404` - User not found in this institute

---

## 4. Get Inactive Users

**Endpoint:** `GET /institute/:instituteId/users/inactive`

**Description:** Get a paginated list of all inactive users (status = INACTIVE) in the institute. Returns the same response structure as the regular get users endpoint.

**Access Control:**
- Institute Admins (for their institute)
- Super Admins (for any institute)

**Parameters:**
- `instituteId` (path, required): Institute ID
- `page` (query, optional): Page number (default: 1)
- `limit` (query, optional): Items per page (default: 10, max: 100)
- `search` (query, optional): Search by name, email, or phone

**Request Example:**
```http
GET /institute-users/institute/1/users/inactive?page=1&limit=20&search=john
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response:**
```json
{
  "data": [
    {
      "id": "12345",
      "name": "John Doe",
      "email": "j***@example.com",
      "addressLine1": "123 Main Street",
      "addressLine2": "Apt 4B",
      "imageUrl": "https://storage.example.com/users/12345.jpg",
      "dateOfBirth": "1995-05-15",
      "gender": "MALE",
      "status": "INACTIVE",
      "verifiedAt": "2024-01-15T10:30:00Z",
      "verifierName": "Admin User",
      "createdAt": "2023-09-01T08:00:00Z",
      "updatedAt": "2024-11-20T14:30:00Z"
    },
    {
      "id": "67890",
      "name": "Jane Smith",
      "email": "j***@example.com",
      "addressLine1": "456 Oak Avenue",
      "imageUrl": "https://storage.example.com/users/67890.jpg",
      "dateOfBirth": "1998-08-22",
      "gender": "FEMALE",
      "status": "INACTIVE",
      "createdAt": "2023-10-05T09:15:00Z",
      "updatedAt": "2024-11-18T11:20:00Z"
    }
  ],
  "meta": {
    "total": 45,
    "page": 1,
    "limit": 20,
    "totalPages": 3
  }
}
```

**Response Fields:**
- `data` - Array of user objects with the same structure as regular institute user queries
- `meta.total` - Total number of inactive users
- `meta.page` - Current page number
- `meta.limit` - Items per page
- `meta.totalPages` - Total number of pages

**Status Codes:**
- `200` - Inactive users retrieved successfully
- `401` - Unauthorized (JWT missing or invalid)
- `403` - Forbidden (not an admin)

---

## Common Response Fields

All user response objects include:

**Basic Information:**
- `id` - User ID
- `name` - Full name (firstName + lastName)
- `email` - Email address (masked if IS_EMAILS_MASKED=true)
- `addressLine1`, `addressLine2` - Address information
- `imageUrl` - Profile image URL
- `dateOfBirth` - Date of birth
- `gender` - Gender (MALE, FEMALE, OTHER)

**Institute Relationship:**
- `status` - User status in institute (ACTIVE, INACTIVE, PENDING, SUSPENDED, FORMER, INVITED)
- `verifiedAt` - When the user was verified in the institute
- `verifierName` - Name of the admin who verified the user
- `userIdByInstitute` - Institute-specific user ID (if assigned)
- `instituteUserImageUrl` - Institute-specific profile image
- `instituteCardId` - Institute card ID (if assigned)
- `imageVerificationStatus` - Status of image verification

**Timestamps:**
- `createdAt` - When user was added to institute
- `updatedAt` - Last update timestamp

---

## Error Responses

All endpoints use consistent error response format:

**401 Unauthorized:**
```json
{
  "statusCode": 401,
  "message": "Unauthorized",
  "error": "Unauthorized"
}
```

**403 Forbidden:**
```json
{
  "statusCode": 403,
  "message": "You do not have permission to access this resource",
  "error": "Forbidden"
}
```

**404 Not Found:**
```json
{
  "statusCode": 404,
  "message": "User 12345 is not assigned to institute 1",
  "error": "Not Found"
}
```

**400 Bad Request:**
```json
{
  "statusCode": 400,
  "message": "Invalid role. Valid roles are: STUDENT, TEACHER, INSTITUTE_ADMIN, ACCOUNTANT, LIBRARIAN, PARENT",
  "error": "Bad Request"
}
```

---

## User Status Flow

The user status lifecycle in an institute:

```
PENDING → ACTIVE → INACTIVE → ACTIVE (reactivation)
    ↓        ↓
SUSPENDED  FORMER
```

**Status Definitions:**
- `PENDING` - User assigned but not verified yet
- `ACTIVE` - User is active and can access institute resources
- `INACTIVE` - User is deactivated (soft deleted) but relationship preserved
- `SUSPENDED` - Temporarily suspended by admin
- `FORMER` - Previously active user who left the institute
- `INVITED` - User invited but hasn't joined yet

---

## Frontend Integration Examples

### React/TypeScript Example

```typescript
// API Service
class InstituteUserAPI {
  private baseURL = 'http://localhost:8080/institute-users';
  
  async getActiveStudents(
    instituteId: string, 
    page = 1, 
    limit = 20, 
    filters?: {
      search?: string;
      minAge?: number;
      maxAge?: number;
      gender?: 'MALE' | 'FEMALE' | 'OTHER';
      city?: string;
      includeParent?: boolean;
    }
  ) {
    const params = new URLSearchParams({
      isActive: 'true',
      page: page.toString(),
      limit: limit.toString(),
      ...(filters?.search && { search: filters.search }),
      ...(filters?.minAge && { minAge: filters.minAge.toString() }),
      ...(filters?.maxAge && { maxAge: filters.maxAge.toString() }),
      ...(filters?.gender && { gender: filters.gender }),
      ...(filters?.city && { city: filters.city }),
      ...(filters?.includeParent && { parent: 'true' })
    });
    
    const response = await fetch(
      `${this.baseURL}/institute/${instituteId}/users/STUDENT?${params}`,
      {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        }
      }
    );
    return response.json();
  }
  
  async getClassStudents(
    instituteId: string,
    classId: string,
    page = 1,
    limit = 20,
    activeOnly = true
  ) {
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
      activeOnly: activeOnly.toString()
    });
    
    const response = await fetch(
      `http://localhost:8080/institutes/${instituteId}/classes/${classId}/students?${params}`,
      {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        }
      }
    );
    return response.json();
  }
  
  async getClassParents(
    instituteId: string,
    classId: string,
    filters?: {
      page?: number;
      limit?: number;
      studentId?: string;
      relationship?: 'father' | 'mother' | 'guardian';
      parentName?: string;
      studentName?: string;
    }
  ) {
    const params = new URLSearchParams({
      page: (filters?.page || 1).toString(),
      limit: (filters?.limit || 20).toString(),
      ...(filters?.studentId && { studentId: filters.studentId }),
      ...(filters?.relationship && { relationship: filters.relationship }),
      ...(filters?.parentName && { parentName: filters.parentName }),
      ...(filters?.studentName && { studentName: filters.studentName })
    });
    
    const response = await fetch(
      `http://localhost:8080/institutes/${instituteId}/classes/${classId}/students/parents?${params}`,
      {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        }
      }
    );
    return response.json();
  }
  
  async getClassSubjectStudents(
    instituteId: string,
    classId: string,
    subjectId: string
  ) {
    const response = await fetch(
      `http://localhost:8080/institute-class-subject-students/class-subject/${instituteId}/${classId}/${subjectId}`,
      {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        }
      }
    );
    return response.json();
  }
  
  async getClassSubjectParents(
    filters: {
      instituteId: string;
      classId: string;
      subjectId: string;
      page?: number;
      limit?: number;
      studentId?: string;
      relationship?: 'father' | 'mother' | 'guardian';
    }
  ) {
    const params = new URLSearchParams({
      instituteId: filters.instituteId,
      classId: filters.classId,
      subjectId: filters.subjectId,
      page: (filters?.page || 1).toString(),
      limit: (filters?.limit || 20).toString(),
      ...(filters?.studentId && { studentId: filters.studentId }),
      ...(filters?.relationship && { relationship: filters.relationship })
    });
    
    const response = await fetch(
      `http://localhost:8080/institute-class-subject-students/parents?${params}`,
      {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        }
      }
    );
    return response.json();
  }
  
  async deactivateUser(instituteId: string, userId: string) {
    const response = await fetch(
      `${this.baseURL}/institute/${instituteId}/users/${userId}/deactivate`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
          'Content-Type': 'application/json'
        }
      }
    );
    return response.json();
  }
  
  async activateUser(instituteId: string, userId: string) {
    const response = await fetch(
      `${this.baseURL}/institute/${instituteId}/users/${userId}/activate`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
          'Content-Type': 'application/json'
        }
      }
    );
    return response.json();
  }
  
  async changeUserRole(instituteId: string, userId: string, newRole: string) {
    const response = await fetch(
      `${this.baseURL}/institute/${instituteId}/users/${userId}/change-role`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ newRole })
      }
    );
    return response.json();
  }
  
  async getInactiveUsers(instituteId: string, page = 1, limit = 10, search = '') {
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
      ...(search && { search })
    });
    
    const response = await fetch(
      `${this.baseURL}/institute/${instituteId}/users/inactive?${params}`,
      {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        }
      }
    );
    return response.json();
  }
  
  async deleteLecturePermanent(lectureId: string) {
    const response = await fetch(
      `http://localhost:8080/institute-class-subject-lectures/${lectureId}/permanent`,
      {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        }
      }
    );
    return response.json();
  }
}

// Usage in Component
const api = new InstituteUserAPI();

// Get active students
const loadActiveStudents = async (page: number) => {
  try {
    const response = await api.getActiveStudents('1', page, 20);
    console.log(`Found ${response.meta.total} active students`);
    // Display response.data in UI
  } catch (error) {
    console.error('Failed to load students:', error);
  }
};

// Get students in a class
const loadClassStudents = async (classId: string) => {
  try {
    const response = await api.getClassStudents('1', classId, 1, 20);
    console.log(`Found ${response.meta.total} students in class`);
    // Display response.data in UI
  } catch (error) {
    console.error('Failed to load class students:', error);
  }
};

// Get parents of students in a class
const loadClassParents = async (classId: string) => {
  try {
    const response = await api.getClassParents('1', classId, {
      page: 1,
      limit: 20
    });
    
    // Group parents by student
    const parentsByStudent = response.data.reduce((acc: any, parent: any) => {
      if (!acc[parent.studentId]) {
        acc[parent.studentId] = {
          studentName: parent.studentName,
          parents: []
        };
      }
      acc[parent.studentId].parents.push({
        name: parent.name,
        relationship: parent.relationship,
        imageUrl: parent.imageUrl,
        email: parent.email,
        phone: parent.phoneNumber
      });
      return acc;
    }, {});
    
    console.log('Parents grouped by student:', parentsByStudent);
  } catch (error) {
    console.error('Failed to load class parents:', error);
  }
};

// Get only fathers in a class
const loadClassFathers = async (classId: string) => {
  try {
    const response = await api.getClassParents('1', classId, {
      relationship: 'father',
      page: 1,
      limit: 50
    });
    console.log(`Found ${response.meta.total} fathers`);
  } catch (error) {
    console.error('Failed to load fathers:', error);
  }
};

// Get students in a class subject
const loadClassSubjectStudents = async (classId: string, subjectId: string) => {
  try {
    const students = await api.getClassSubjectStudents('1', classId, subjectId);
    console.log(`Found ${students.length} students in this subject`);
  } catch (error) {
    console.error('Failed to load subject students:', error);
  }
};

// Get parents of students in a class subject
const loadClassSubjectParents = async (classId: string, subjectId: string) => {
  try {
    const response = await api.getClassSubjectParents({
      instituteId: '1',
      classId,
      subjectId,
      page: 1,
      limit: 20
    });
    console.log(`Found ${response.meta.total} parent records`);
  } catch (error) {
    console.error('Failed to load subject parents:', error);
  }
};

// Get students with filters
const loadFilteredStudents = async () => {
  try {
    const response = await api.getActiveStudents('1', 1, 20, {
      minAge: 15,
      maxAge: 18,
      gender: 'FEMALE',
      city: 'Colombo'
    });
    console.log(`Found ${response.meta.total} filtered students`);
  } catch (error) {
    console.error('Failed to load filtered students:', error);
  }
};

// Get students with parent details
const loadStudentsWithParents = async () => {
  try {
    const response = await api.getActiveStudents('1', 1, 10, {
      includeParent: true
    });
    response.data.forEach((student: any) => {
      if (student.parentDetails) {
        console.log(`${student.name}'s father: ${student.parentDetails.father?.name}`);
        console.log(`Father image: ${student.parentDetails.father?.imageUrl}`);
      }
    });
  } catch (error) {
    console.error('Failed to load students with parents:', error);
  }
};

// Deactivate user
const handleDeactivate = async (userId: string) => {
  try {
    const result = await api.deactivateUser('1', userId);
    console.log(result.message); // "User deactivated successfully in institute"
    // Refresh user list
  } catch (error) {
    console.error('Failed to deactivate user:', error);
  }
};

// Change role from STUDENT to TEACHER
const handlePromoteToTeacher = async (userId: string) => {
  try {
    const result = await api.changeUserRole('1', userId, 'TEACHER');
    console.log(`Role changed from ${result.previousRole} to ${result.newRole}`);
  } catch (error) {
    console.error('Failed to change role:', error);
  }
};

// Get inactive users with pagination
const loadInactiveUsers = async (page: number) => {
  try {
    const response = await api.getInactiveUsers('1', page, 20);
    console.log(`Found ${response.meta.total} inactive users`);
    // Display response.data in UI
  } catch (error) {
    console.error('Failed to load inactive users:', error);
  }
};

// Permanently delete lecture with all files
const handleDeleteLecture = async (lectureId: string) => {
  try {
    // Show confirmation dialog first
    const confirmed = confirm(
      'Are you sure you want to permanently delete this lecture? ' +
      'This action cannot be undone.'
    );
    
    if (!confirmed) return;
    
    const result = await api.deleteLecturePermanent(lectureId);
    
    if (result.success) {
      console.log(result.message);
      console.log(`Deleted lecture ${result.lectureId} from institute ${result.instituteId}`);
      
      // Refresh lecture list
      alert('Lecture permanently deleted successfully');
    }
  } catch (error) {
    console.error('Failed to delete lecture:', error);
    alert('Failed to delete lecture. Please try again.');
  }
};
```

### Vue.js Example

```javascript
// composables/useInstituteUsers.js
import { ref } from 'vue';

export function useInstituteUsers() {
  const baseURL = 'http://localhost:8080/institute-users';
  const loading = ref(false);
  const error = ref(null);
  
  const deactivateUser = async (instituteId, userId) => {
    loading.value = true;
    error.value = null;
    try {
      const response = await fetch(
        `${baseURL}/institute/${instituteId}/users/${userId}/deactivate`,
        {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('access_token')}`
          }
        }
      );
      const data = await response.json();
      return data;
    } catch (err) {
      error.value = err.message;
      throw err;
    } finally {
      loading.value = false;
    }
  };
  
  const getInactiveUsers = async (instituteId, page = 1) => {
    loading.value = true;
    error.value = null;
    try {
      const response = await fetch(
        `${baseURL}/institute/${instituteId}/users/inactive?page=${page}&limit=20`,
        {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('access_token')}`
          }
        }
      );
      const data = await response.json();
      return data;
    } catch (err) {
      error.value = err.message;
      throw err;
    } finally {
      loading.value = false;
    }
  };
  
  return {
    loading,
    error,
    deactivateUser,
    getInactiveUsers
  };
}
```

---

## 5. Get Active Students in Institute

**Endpoint:** `GET /institute/:instituteId/users/:userType`

**Description:** Get all active users in an institute filtered by user type. This is a more general endpoint that can retrieve STUDENTS, TEACHERS, PARENTS, or other user types with advanced filtering options.

**Access Control:**
- Institute Admins (for their institute)
- Super Admins (for any institute)
- Teachers (read-only access)

**Parameters:**
- `instituteId` (path, required): Institute ID
- `userType` (path, required): User type to filter
  - `STUDENT` - Students
  - `TEACHER` - Teachers
  - `INSTITUTE_ADMIN` - Institute administrators
  - `ACCOUNTANT` - Accountants
  - `LIBRARIAN` - Librarians
  - `PARENT` - Parents (retrieved via student relationships)

**Query Parameters (Optional):**
- `page` (default: 1): Page number
- `limit` (default: 10, max: 50): Items per page
- `search`: Search by name or email
- `isActive` (true/false): Filter by active status
- `gender` (MALE/FEMALE/OTHER): Filter by gender
- `minAge`, `maxAge`: Filter by age range
- `city`: Filter by city/address
- `sortBy` (createdAt/name/email/dateOfBirth): Sort field
- `sortOrder` (ASC/DESC): Sort direction

**Student-Specific Filters:**
- `studentId`: Filter by student ID
- `emergencyContact`: Filter by emergency contact
- `hasMedicalConditions` (true/false): Students with medical conditions
- `hasAllergies` (true/false): Students with allergies
- `parent=true`: Include parent details in response

**Request Example - Get Active Students:**
```http
GET /institute-users/institute/1/users/STUDENT?isActive=true&page=1&limit=20
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Request Example - Students with Filters:**
```http
GET /institute-users/institute/1/users/STUDENT?minAge=15&maxAge=18&gender=FEMALE&city=Colombo&page=1&limit=20
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Request Example - Students with Parent Info:**
```http
GET /institute-users/institute/1/users/STUDENT?parent=true&page=1&limit=10
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response:**
```json
{
  "data": [
    {
      "id": "12345",
      "name": "John Doe",
      "email": "john.doe@example.com",
      "phoneNumber": "+94771234567",
      "addressLine1": "123 Main Street",
      "addressLine2": "Colombo 03",
      "imageUrl": "https://storage.example.com/users/12345.jpg",
      "dateOfBirth": "2008-05-15",
      "gender": "MALE",
      "status": "ACTIVE",
      "instituteUserType": "STUDENT",
      "userIdByInstitute": "STU2024001",
      "verifiedAt": "2024-01-15T10:30:00Z",
      "verifierName": "Admin User",
      "createdAt": "2023-09-01T08:00:00Z",
      "updatedAt": "2024-11-20T14:30:00Z"
    },
    {
      "id": "67890",
      "name": "Jane Smith",
      "email": "jane.smith@example.com",
      "phoneNumber": "+94772345678",
      "addressLine1": "456 Oak Avenue",
      "addressLine2": "Kandy",
      "imageUrl": "https://storage.example.com/users/67890.jpg",
      "dateOfBirth": "2009-08-22",
      "gender": "FEMALE",
      "status": "ACTIVE",
      "instituteUserType": "STUDENT",
      "userIdByInstitute": "STU2024002",
      "createdAt": "2023-10-05T09:15:00Z",
      "updatedAt": "2024-11-18T11:20:00Z"
    }
  ],
  "meta": {
    "total": 150,
    "page": 1,
    "limit": 20,
    "totalPages": 8
  }
}
```

**Response with Parent Details (when parent=true):**
```json
{
  "data": [
    {
      "id": "12345",
      "name": "John Doe",
      "email": "john.doe@example.com",
      "phoneNumber": "+94771234567",
      "status": "ACTIVE",
      "instituteUserType": "STUDENT",
      "userIdByInstitute": "STU2024001",
      "studentDetails": {
        "emergencyContact": "+94778888888",
        "medicalConditions": "Asthma",
        "allergies": "Peanuts"
      },
      "parentDetails": {
        "father": {
          "id": "99001",
          "name": "Robert Doe",
          "email": "robert.doe@example.com",
          "phoneNumber": "+94771111111",
          "imageUrl": "https://storage.example.com/users/99001.jpg",
          "occupation": "Engineer",
          "workplace": "Tech Company Ltd"
        },
        "mother": {
          "id": "99002",
          "name": "Mary Doe",
          "email": "mary.doe@example.com",
          "phoneNumber": "+94772222222",
          "imageUrl": "https://storage.example.com/users/99002.jpg",
          "occupation": "Doctor",
          "workplace": "General Hospital"
        }
      },
      "verifiedAt": "2024-01-15T10:30:00Z",
      "createdAt": "2023-09-01T08:00:00Z"
    }
  ],
  "meta": {
    "total": 150,
    "page": 1,
    "limit": 20,
    "totalPages": 8
  }
}
```

**Common Use Cases:**

1. **Get all active students:**
```http
GET /institute-users/institute/1/users/STUDENT?isActive=true
```

2. **Get students by age range (e.g., 15-18 years old):**
```http
GET /institute-users/institute/1/users/STUDENT?minAge=15&maxAge=18
```

3. **Get female students from Colombo:**
```http
GET /institute-users/institute/1/users/STUDENT?gender=FEMALE&city=Colombo
```

4. **Get students with medical conditions:**
```http
GET /institute-users/institute/1/users/STUDENT?hasMedicalConditions=true
```

5. **Search student by ID with parent info:**
```http
GET /institute-users/institute/1/users/STUDENT?studentId=STU2024&parent=true
```

6. **Get all teachers:**
```http
GET /institute-users/institute/1/users/TEACHER?isActive=true
```

**Status Codes:**
- `200` - Users retrieved successfully
- `400` - Invalid user type or parameters
- `401` - Unauthorized (JWT missing or invalid)
- `403` - Forbidden (insufficient permissions)

---

## 6. Get Students in Institute Class

**Endpoint:** `GET /institutes/:instituteId/classes/:classId/students`

**Description:** Get all students enrolled in a specific class with pagination and filtering options.

**Access Control:**
- Anyone with an institute role (Students, Teachers, Admins)

**Parameters:**
- `instituteId` (path, required): Institute ID
- `classId` (path, required): Class ID
- `page` (query, optional): Page number (default: 1)
- `limit` (query, optional): Items per page (default: 10)
- `activeOnly` (query, optional): Filter active students only (default: true)

**Request Example:**
```http
GET /institutes/1/classes/5/students?page=1&limit=20&activeOnly=true
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response:**
```json
{
  "data": [
    {
      "studentUserId": "12345",
      "studentName": "John Doe",
      "studentEmail": "john.doe@example.com",
      "studentImageUrl": "https://storage.example.com/users/12345.jpg",
      "studentIdByInstitute": "STU2024001",
      "isActive": true,
      "isVerified": true,
      "enrollmentMethod": "admin_assigned",
      "enrolledAt": "2024-01-15T10:30:00Z"
    },
    {
      "studentUserId": "67890",
      "studentName": "Jane Smith",
      "studentEmail": "jane.smith@example.com",
      "studentImageUrl": "https://storage.example.com/users/67890.jpg",
      "studentIdByInstitute": "STU2024002",
      "isActive": true,
      "isVerified": true,
      "enrollmentMethod": "self_enrollment",
      "enrolledAt": "2024-02-20T14:15:00Z"
    }
  ],
  "meta": {
    "total": 35,
    "page": 1,
    "limit": 20,
    "totalPages": 2
  }
}
```

**Status Codes:**
- `200` - Students retrieved successfully
- `401` - Unauthorized (JWT missing or invalid)
- `403` - Forbidden (no institute role)
- `404` - Institute or class not found

---

## 7. Get Parents of Students in Class

**Endpoint:** `GET /institutes/:instituteId/classes/:classId/students/parents`

**Description:** Get all parent details for students enrolled in a specific class. Includes father, mother, and guardian information with profile images and contact details.

**Access Control:**
- Institute Admins
- Super Admins
- Teachers (for their classes)

**Parameters:**
- `instituteId` (path, required): Institute ID
- `classId` (path, required): Class ID
- `page` (query, optional): Page number (default: 1)
- `limit` (query, optional): Items per page (default: 10, max: 100)
- `studentId` (query, optional): Filter by specific student ID
- `relationship` (query, optional): Filter by relationship (father/mother/guardian)
- `parentName` (query, optional): Search by parent name
- `studentName` (query, optional): Search by student name

**Request Example:**
```http
GET /institutes/1/classes/5/students/parents?page=1&limit=20
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Request Example - Filter by Relationship:**
```http
GET /institutes/1/classes/5/students/parents?relationship=father&page=1&limit=20
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response:**
```json
{
  "data": [
    {
      "id": "99001",
      "name": "Robert Doe",
      "email": "robert.doe@example.com",
      "phoneNumber": "+94****111",
      "imageUrl": "https://storage.example.com/users/99001.jpg",
      "occupation": "Engineer",
      "workplace": "Tech Company Ltd",
      "relationship": "father",
      "studentId": "12345",
      "studentName": "John Doe",
      "studentIdByInstitute": "STU2024001"
    },
    {
      "id": "99002",
      "name": "Mary Doe",
      "email": "mary.doe@example.com",
      "phoneNumber": "+94****222",
      "imageUrl": "https://storage.example.com/users/99002.jpg",
      "occupation": "Doctor",
      "workplace": "General Hospital",
      "relationship": "mother",
      "studentId": "12345",
      "studentName": "John Doe",
      "studentIdByInstitute": "STU2024001"
    },
    {
      "id": "99003",
      "name": "Sarah Smith",
      "email": "sarah.smith@example.com",
      "phoneNumber": "+94****333",
      "imageUrl": "https://storage.example.com/users/99003.jpg",
      "occupation": "Teacher",
      "workplace": "ABC School",
      "relationship": "mother",
      "studentId": "67890",
      "studentName": "Jane Smith",
      "studentIdByInstitute": "STU2024002"
    }
  ],
  "meta": {
    "total": 70,
    "page": 1,
    "limit": 20,
    "totalPages": 4
  }
}
```

**Response Fields:**
- `id` - Parent user ID
- `name` - Parent full name
- `email` - Parent email address
- `phoneNumber` - Masked phone number (last 3 digits visible)
- `imageUrl` - Parent profile image URL
- `occupation` - Parent's occupation
- `workplace` - Parent's workplace
- `relationship` - Relationship to student (father/mother/guardian)
- `studentId` - Student user ID
- `studentName` - Student full name
- `studentIdByInstitute` - Institute-specific student ID

**Status Codes:**
- `200` - Parents retrieved successfully
- `400` - Invalid parameters
- `401` - Unauthorized (JWT missing or invalid)
- `403` - Forbidden (insufficient permissions)
- `404` - Institute or class not found

---

## 8. Get Students in Class Subject

**Endpoint:** `GET /institute-class-subject-students/class-subject/:instituteId/:classId/:subjectId`

**Description:** Get all students enrolled in a specific class subject (e.g., Grade 10 Mathematics).

**Access Control:**
- Anyone with an institute role (Students, Teachers, Admins)

**Parameters:**
- `instituteId` (path, required): Institute ID
- `classId` (path, required): Class ID
- `subjectId` (path, required): Subject ID

**Request Example:**
```http
GET /institute-class-subject-students/class-subject/1/5/12
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response:**
```json
[
  {
    "studentId": "12345",
    "studentName": "John Doe",
    "studentEmail": "john.doe@example.com",
    "studentImageUrl": "https://storage.example.com/users/12345.jpg",
    "instituteId": "1",
    "classId": "5",
    "subjectId": "12",
    "subjectName": "Mathematics",
    "isActive": true,
    "enrolledAt": "2024-01-15T10:30:00Z"
  },
  {
    "studentId": "67890",
    "studentName": "Jane Smith",
    "studentEmail": "jane.smith@example.com",
    "studentImageUrl": "https://storage.example.com/users/67890.jpg",
    "instituteId": "1",
    "classId": "5",
    "subjectId": "12",
    "subjectName": "Mathematics",
    "isActive": true,
    "enrolledAt": "2024-02-20T14:15:00Z"
  }
]
```

**Status Codes:**
- `200` - Students retrieved successfully
- `401` - Unauthorized (JWT missing or invalid)
- `403` - Forbidden (no institute role)
- `404` - Institute, class, or subject not found

---

## 9. Get Parents of Students in Class Subject

**Endpoint:** `GET /institute-class-subject-students/parents`

**Description:** Get all parent details for students enrolled in a specific class subject. Similar to the class parents endpoint but filtered by subject enrollment.

**Access Control:**
- Institute Admins
- Super Admins
- Teachers (for their subjects)

**Query Parameters:**
- `instituteId` (required): Institute ID
- `classId` (required): Class ID
- `subjectId` (required): Subject ID
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 10, max: 100)
- `studentId` (optional): Filter by specific student ID
- `relationship` (optional): Filter by relationship (father/mother/guardian)
- `parentName` (optional): Search by parent name
- `studentName` (optional): Search by student name

**Request Example:**
```http
GET /institute-class-subject-students/parents?instituteId=1&classId=5&subjectId=12&page=1&limit=20
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Request Example - Filter by Student:**
```http
GET /institute-class-subject-students/parents?instituteId=1&classId=5&subjectId=12&studentId=12345
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response:**
```json
{
  "data": [
    {
      "id": "99001",
      "name": "Robert Doe",
      "email": "robert.doe@example.com",
      "phoneNumber": "+94****111",
      "imageUrl": "https://storage.example.com/users/99001.jpg",
      "occupation": "Engineer",
      "workplace": "Tech Company Ltd",
      "relationship": "father",
      "studentId": "12345",
      "studentName": "John Doe",
      "studentIdByInstitute": "STU2024001",
      "subjectId": "12",
      "subjectName": "Mathematics"
    },
    {
      "id": "99002",
      "name": "Mary Doe",
      "email": "mary.doe@example.com",
      "phoneNumber": "+94****222",
      "imageUrl": "https://storage.example.com/users/99002.jpg",
      "occupation": "Doctor",
      "workplace": "General Hospital",
      "relationship": "mother",
      "studentId": "12345",
      "studentName": "John Doe",
      "studentIdByInstitute": "STU2024001",
      "subjectId": "12",
      "subjectName": "Mathematics"
    }
  ],
  "meta": {
    "total": 40,
    "page": 1,
    "limit": 20,
    "totalPages": 2
  }
}
```

**Response Fields:**
- `id` - Parent user ID
- `name` - Parent full name
- `email` - Parent email address
- `phoneNumber` - Masked phone number (last 3 digits visible)
- `imageUrl` - Parent profile image URL
- `occupation` - Parent's occupation
- `workplace` - Parent's workplace
- `relationship` - Relationship to student (father/mother/guardian)
- `studentId` - Student user ID
- `studentName` - Student full name
- `studentIdByInstitute` - Institute-specific student ID
- `subjectId` - Subject ID
- `subjectName` - Subject name

**Status Codes:**
- `200` - Parents retrieved successfully
- `400` - Invalid or missing required parameters
- `401` - Unauthorized (JWT missing or invalid)
- `403` - Forbidden (insufficient permissions)
- `404` - Institute, class, or subject not found

---

## 10. Permanently Delete Institute Lecture

**Endpoint:** `DELETE /institute-class-subject-lectures/:id/permanent`

**Description:** Permanently delete a lecture from the database. This action cannot be undone.

**Access Control:**
- Institute Admins (for their institute)
- Super Admins (for any institute)

**Parameters:**
- `id` (path, required): Lecture ID to delete

**Request Example:**
```http
DELETE /institute-class-subject-lectures/123/permanent
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response:**
```json
{
  "success": true,
  "message": "Lecture permanently deleted successfully",
  "lectureId": "123",
  "instituteId": "1"
}
```

**Response Fields:**
- `success` - Whether the operation succeeded (true/false)
- `message` - Success message
- `lectureId` - ID of the deleted lecture
- `instituteId` - Institute ID the lecture belonged to

**Important Notes:**
1. **Permanent Action**: This operation permanently deletes the lecture and cannot be undone
2. **Database Only**: Only removes the database record (no file deletion as lectures don't support file uploads)
3. **Institute Access**: Institute admins can only delete lectures from their own institute
4. **Super Admin Access**: Super admins can delete lectures from any institute

**Status Codes:**
- `200` - Lecture deleted successfully
- `401` - Unauthorized (JWT missing or invalid)
- `403` - Forbidden (not an institute admin or trying to delete from another institute)
- `404` - Lecture not found

---

## Testing with cURL

```bash
# Get active students in institute
curl -X GET \
  'http://localhost:8080/institute-users/institute/1/users/STUDENT?isActive=true&page=1&limit=20' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN'

# Get students with age filter
curl -X GET \
  'http://localhost:8080/institute-users/institute/1/users/STUDENT?minAge=15&maxAge=18' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN'

# Get students with parent info
curl -X GET \
  'http://localhost:8080/institute-users/institute/1/users/STUDENT?parent=true&limit=10' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN'

# Get all teachers
curl -X GET \
  'http://localhost:8080/institute-users/institute/1/users/TEACHER?isActive=true' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN'

# Get students in a specific class
curl -X GET \
  'http://localhost:8080/institutes/1/classes/5/students?page=1&limit=20&activeOnly=true' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN'

# Get parents of students in a class
curl -X GET \
  'http://localhost:8080/institutes/1/classes/5/students/parents?page=1&limit=20' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN'

# Get parents filtered by relationship (fathers only)
curl -X GET \
  'http://localhost:8080/institutes/1/classes/5/students/parents?relationship=father&page=1&limit=20' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN'

# Get students in a class subject
curl -X GET \
  'http://localhost:8080/institute-class-subject-students/class-subject/1/5/12' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN'

# Get parents of students in a class subject
curl -X GET \
  'http://localhost:8080/institute-class-subject-students/parents?instituteId=1&classId=5&subjectId=12&page=1&limit=20' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN'

# Permanently delete lecture with files
curl -X DELETE \
  http://localhost:8080/institute-class-subject-lectures/123/permanent \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN'

# Deactivate a user
curl -X PATCH \
  http://localhost:8080/institute-users/institute/1/users/12345/deactivate \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN'

# Activate a user
curl -X PATCH \
  http://localhost:8080/institute-users/institute/1/users/12345/activate \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN'

# Change user role
curl -X PATCH \
  http://localhost:8080/institute-users/institute/1/users/12345/change-role \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"newRole": "TEACHER"}'

# Get inactive users (paginated)
curl -X GET \
  'http://localhost:8080/institute-users/institute/1/users/inactive?page=1&limit=20&search=john' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN'
```

---

## Security Notes

1. **Authentication Required:** All endpoints require valid JWT tokens
2. **Access Control:** Only Institute Admins and Super Admins can manage users
3. **Cache Invalidation:** All status/role changes automatically invalidate user access cache
4. **Data Masking:** Email and phone fields are masked based on environment variables:
   - `IS_EMAILS_MASKED=true` → Emails are masked (e.g., j***@example.com)
   - `IS_PHONENUMBERS_MASKED=true` → Phone numbers are masked (e.g., +94****567)
5. **Audit Trail:** All changes are tracked with timestamps and associated admin IDs

---

## Best Practices

1. **Soft Delete First:** Always use deactivate (soft delete) instead of hard delete to preserve history
2. **Check Status:** Verify current status before attempting activation/deactivation
3. **Validate Roles:** Ensure the new role is appropriate for the user before changing
4. **Handle Errors:** Always implement proper error handling for failed API calls
5. **Cache Management:** User access cache is automatically invalidated, but you may need to refresh UI
6. **Pagination:** Use pagination for inactive users list to avoid loading too much data

---

## Support

For issues or questions, please contact the backend team or refer to the main API documentation.

**Swagger UI:** http://localhost:8080/api
**API Version:** 1.0
**Last Updated:** November 22, 2025
