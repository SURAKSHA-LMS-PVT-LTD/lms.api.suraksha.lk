# Homework API - Frontend Implementation Guide

## 📋 Table of Contents
- [Complete URL Examples](#complete-url-examples)
- [Response Structure](#response-structure)
- [Pagination Implementation](#pagination-implementation)
- [TypeScript Types](#typescript-types)
- [React/Vue Examples](#reactvue-examples)
- [Error Handling](#error-handling)
- [Best Practices](#best-practices)

---

## 🔗 Complete URL Examples

### Base Endpoint
```
GET /institute-class-subject-homeworks
```

### 1. Basic Pagination
```
GET /institute-class-subject-homeworks?page=1&limit=10
```
**Use Case:** Default homepage listing

### 2. Filter by Institute & Class
```
GET /institute-class-subject-homeworks?instituteId=44&classId=40&page=1&limit=20
```
**Use Case:** Class-specific homework list

### 3. Search with Pagination
```
GET /institute-class-subject-homeworks?search=mathematics&page=1&limit=10&sortBy=startDate&sortOrder=DESC
```
**Use Case:** Search functionality with newest first

### 4. Complete with All Filters
```
GET /institute-class-subject-homeworks?instituteId=44&classId=40&subjectId=2&page=1&limit=20&sortBy=startDate&sortOrder=DESC&includeReferences=true&includeSubmissions=true
```
**Use Case:** Full homework detail view with references and submissions

### 5. Date Range Filter
```
GET /institute-class-subject-homeworks?fromDate=2025-08-01&toDate=2025-08-31&page=1&limit=10
```
**Use Case:** Monthly homework calendar

### 6. Student View (Auto JWT Filtered)
```
GET /institute-class-subject-homeworks?instituteId=101&classId=1000&subjectId=2&includeSubmissions=true&page=1&limit=10
```
**Use Case:** Student dashboard showing their submissions
**Note:** `mySubmissions` automatically filtered by JWT token userId

### 7. Class/Subject Specific Endpoint
```
GET /institute-class-subject-homeworks/class/40/subject/2?page=1&limit=10
GET /institute-class-subject-homeworks/class/40/subject/2?includeSubmissions=true&fromDate=2025-08-01&toDate=2025-08-31&page=1&limit=10
```
**Use Case:** Subject-specific homework list for students

### 8. Institute Specific Endpoint
```
GET /institute-class-subject-homeworks/institute/44?page=1&limit=20
GET /institute-class-subject-homeworks/institute/44?classId=40&subjectId=2&search=math&sortBy=startDate&sortOrder=DESC&page=1&limit=10
```
**Use Case:** Institute admin dashboard

---

## 📦 Response Structure

### Success Response (200 OK)
```json
{
  "data": [
    {
      "id": "123",
      "title": "Mathematics Homework 1",
      "description": "Solve problems 1-10",
      "startDate": "2025-08-01T00:00:00.000Z",
      "endDate": "2025-08-10T23:59:59.000Z",
      "instituteId": "44",
      "classId": "40",
      "subjectId": "2",
      "teacherId": "15",
      "isActive": true,
      "createdAt": "2025-07-25T10:30:00.000Z",
      "updatedAt": "2025-07-25T10:30:00.000Z",
      
      // Only if includeReferences=true
      "references": [
        {
          "id": "1",
          "title": "Video Tutorial",
          "type": "video",
          "url": "https://...",
          "mimeType": "video/mp4"
        }
      ],
      
      // Only if includeSubmissions=true (JWT filtered)
      // Teacher corrections ALWAYS included automatically
      "mySubmissions": [
        {
          "id": "456",
          "submissionDate": "2025-08-09T15:30:00.000Z",
          
          // Student's submission
          "fileUrl": "https://...",
          "driveFileId": "abc123",
          "driveViewUrl": "https://drive.google.com/file/d/abc123/view",
          "submissionType": "UPLOAD",
          
          // Teacher's corrections (automatically included)
          "teacherCorrectionFileUrl": "https://...",  // null if not corrected
          "remarks": "Good work, but review problem 5",  // null if no feedback
          
          // Correction status metadata
          "hasCorrectionFile": true,
          "hasRemarks": true,
          "isCorrected": true,
          "correctionStatus": "corrected",  // "corrected" or "pending"
          
          "isActive": true,
          "createdAt": "2025-08-09T15:30:00.000Z",
          "updatedAt": "2025-08-10T10:00:00.000Z"
        }
      ],
      
      // Submission statistics
      "hasSubmitted": true,
      "submissionCount": 1,
      "correctedCount": 1,
      "pendingCorrectionCount": 0
    }
  ],
  "meta": {
    "total": 45,        // Total records across all pages
    "page": 1,          // Current page
    "limit": 10,        // Items per page
    "totalPages": 5     // Total number of pages
  }
}
```

### Key Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `data` | Array | Array of homework objects |
| `meta.total` | Number | Total records (all pages) |
| `meta.page` | Number | Current page number |
| `meta.limit` | Number | Items per page |
| `meta.totalPages` | Number | Total pages available |

---

## 🔢 Pagination Implementation

### Query Parameters

| Parameter | Type | Default | Max | Description |
|-----------|------|---------|-----|-------------|
| `page` | Number | 1 | - | Page number (1-indexed) |
| `limit` | Number | 10 | 100 | Items per page |

### Calculating Pagination

```typescript
// From response meta
const currentPage = response.meta.page;        // 1
const totalPages = response.meta.totalPages;   // 5
const totalRecords = response.meta.total;      // 45
const itemsPerPage = response.meta.limit;      // 10

// Calculate display info
const startItem = (currentPage - 1) * itemsPerPage + 1;  // 1
const endItem = Math.min(currentPage * itemsPerPage, totalRecords);  // 10
// Display: "Showing 1-10 of 45 results"

// Check navigation state
const hasNextPage = currentPage < totalPages;
const hasPrevPage = currentPage > 1;
```

### Frontend Pagination Logic

```typescript
const buildPaginationUrl = (baseUrl: string, page: number, filters: any) => {
  const params = new URLSearchParams({
    ...filters,
    page: page.toString(),
    limit: '10'
  });
  return `${baseUrl}?${params.toString()}`;
};

// Example usage
const nextPageUrl = buildPaginationUrl(
  '/institute-class-subject-homeworks',
  currentPage + 1,
  { instituteId: '44', classId: '40' }
);
// Result: /institute-class-subject-homeworks?instituteId=44&classId=40&page=2&limit=10
```

---

## 📝 TypeScript Types

```typescript
// Homework Item Type
interface Homework {
  id: string;
  title: string;
  description: string | null;
  startDate: string;  // ISO 8601 date string
  endDate: string;    // ISO 8601 date string
  instituteId: string;
  classId: string;
  subjectId: string;
  teacherId: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  references?: Reference[];
  mySubmissions?: Submission[];
}

// Reference Type
interface Reference {
  id: string;
  title: string;
  type: 'video' | 'pdf' | 'link' | 'image';
  url: string;
  mimeType: string;
  fileSize?: number;
}

// Submission Type
interface Submission {
  id: string;
  studentId: string;
  submissionDate: string;
  submissionType: 'UPLOAD' | 'GOOGLE_DRIVE';
  
  // Student's submission
  // For UPLOAD: Full cloud storage URL (https://storage.googleapis.com/...)
  // For GOOGLE_DRIVE: May be null, use driveViewUrl instead
  fileUrl: string | null;
  
  // Google Drive specific fields (only populated for GOOGLE_DRIVE submissions)
  driveFileId: string | null;
  driveViewUrl: string | null;  // https://drive.google.com/file/d/{id}/view
  driveFileName: string | null;
  driveMimeType: string | null;
  driveFileSize: number | null;
  
  // Teacher's corrections (always cloud storage URLs, never Drive)
  teacherCorrectionFileUrl: string | null;  // Full S3/GCS URL
  remarks: string | null;
  
  // Correction status metadata
  hasCorrectionFile: boolean;
  hasRemarks: boolean;
  isCorrected: boolean;
  correctionStatus: 'corrected' | 'pending';
  
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// Paginated Response Type
interface PaginatedHomeworkResponse {
  data: Homework[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// Query Parameters Type
interface HomeworkQueryParams {
  instituteId?: string;
  classId?: string;
  subjectId?: string;
  teacherId?: string;
  search?: string;
  isActive?: boolean;
  fromDate?: string;  // YYYY-MM-DD
  toDate?: string;    // YYYY-MM-DD
  page?: number;
  limit?: number;
  sortBy?: 'title' | 'startDate' | 'endDate' | 'createdAt';
  sortOrder?: 'ASC' | 'DESC';
  includeReferences?: boolean;
  includeSubmissions?: boolean;
}
```

---

## ⚛️ React/Vue Examples

### React with Hooks

```typescript
import { useState, useEffect } from 'react';
import axios from 'axios';

interface HomeworkListProps {
  classId: string;
  subjectId: string;
}

const HomeworkList: React.FC<HomeworkListProps> = ({ classId, subjectId }) => {
  const [homeworks, setHomeworks] = useState<Homework[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const fetchHomeworks = async (page: number) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await axios.get<PaginatedHomeworkResponse>(
        '/institute-class-subject-homeworks',
        {
          params: {
            classId,
            subjectId,
            page,
            limit: 10,
            sortBy: 'startDate',
            sortOrder: 'DESC',
            includeSubmissions: true,
          },
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`
          }
        }
      );

      setHomeworks(response.data.data);
      setCurrentPage(response.data.meta.page);
      setTotalPages(response.data.meta.totalPages);
      setTotal(response.data.meta.total);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to fetch homeworks');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHomeworks(currentPage);
  }, [currentPage, classId, subjectId]);

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
    }
  };

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div>
      <h2>Homework Assignments</h2>
      
      {/* Results Info */}
      <p>
        Showing {(currentPage - 1) * 10 + 1}-
        {Math.min(currentPage * 10, total)} of {total} results
      </p>

      {/* Homework List */}
      <ul>
        {homeworks.map(hw => (
          <li key={hw.id}>
            <h3>{hw.title}</h3>
            <p>{hw.description}</p>
            <p>Due: {new Date(hw.endDate).toLocaleDateString()}</p>
            
            {/* Show submission status with corrections */}
            {hw.mySubmissions && hw.mySubmissions.length > 0 ? (
              <div className="submission-info">
                {hw.mySubmissions[0].isCorrected ? (
                  <>
                    <span className="badge badge-success">✅ Corrected</span>
                    {hw.mySubmissions[0].hasCorrectionFile && (
                      <a 
                        href={hw.mySubmissions[0].teacherCorrectionFileUrl!} 
                        target="_blank"
                        className="btn-link"
                      >
                        📄 View Corrections
                      </a>
                    )}
                    {hw.mySubmissions[0].hasRemarks && (
                      <p className="remarks">
                        Feedback: {hw.mySubmissions[0].remarks}
                      </p>
                    )}
                  </>
                ) : (
                  <span className="badge badge-info">📝 Submitted - Awaiting Correction</span>
                )}
              </div>
            ) : (
              <span className="badge badge-warning">⚠️ Not Submitted</span>
            )}
          </li>
        ))}
      </ul>

      {/* Pagination Controls */}
      <div className="pagination">
        <button 
          onClick={() => handlePageChange(currentPage - 1)}
          disabled={currentPage === 1}
        >
          Previous
        </button>
        
        <span>Page {currentPage} of {totalPages}</span>
        
        <button 
          onClick={() => handlePageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
        >
          Next
        </button>
      </div>
    </div>
  );
};

export default HomeworkList;
```

### Vue 3 Composition API

```vue
<template>
  <div class="homework-list">
    <h2>Homework Assignments</h2>
    
    <!-- Loading State -->
    <div v-if="loading">Loading...</div>
    
    <!-- Error State -->
    <div v-if="error" class="error">{{ error }}</div>
    
    <!-- Results Info -->
    <p v-if="!loading && !error">
      Showing {{ startItem }}-{{ endItem }} of {{ total }} results
    </p>

    <!-- Homework List -->
    <ul v-if="!loading && !error">
      <li v-for="hw in homeworks" :key="hw.id">
        <h3>{{ hw.title }}</h3>
        <p>{{ hw.description }}</p>
        <p>Due: {{ formatDate(hw.endDate) }}</p>
        
        <!-- Submission Status with Corrections -->
        <div v-if="hw.mySubmissions?.length > 0" class="submission-info">
          <template v-if="hw.mySubmissions[0].isCorrected">
            <span class="badge-success">✅ Corrected</span>
            
            <!-- Correction File -->
            <a 
              v-if="hw.mySubmissions[0].hasCorrectionFile"
              :href="hw.mySubmissions[0].teacherCorrectionFileUrl"
              target="_blank"
              class="btn-link"
            >
              📄 View Corrections
            </a>
            
            <!-- Teacher Remarks -->
            <p v-if="hw.mySubmissions[0].hasRemarks" class="remarks">
              Feedback: {{ hw.mySubmissions[0].remarks }}
            </p>
          </template>
          
          <span v-else class="badge-info">📝 Submitted - Awaiting Correction</span>
        </div>
        
        <span v-else class="badge-warning">⚠️ Not Submitted</span>
      </li>
    </ul>

    <!-- Pagination -->
    <div class="pagination">
      <button 
        @click="goToPage(currentPage - 1)"
        :disabled="currentPage === 1"
      >
        Previous
      </button>
      
      <span>Page {{ currentPage }} of {{ totalPages }}</span>
      
      <button 
        @click="goToPage(currentPage + 1)"
        :disabled="currentPage === totalPages"
      >
        Next
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import axios from 'axios';

interface Props {
  classId: string;
  subjectId: string;
}

const props = defineProps<Props>();

const homeworks = ref<Homework[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const currentPage = ref(1);
const totalPages = ref(1);
const total = ref(0);
const limit = 10;

const startItem = computed(() => (currentPage.value - 1) * limit + 1);
const endItem = computed(() => Math.min(currentPage.value * limit, total.value));

const fetchHomeworks = async (page: number) => {
  loading.value = true;
  error.value = null;
  
  try {
    const response = await axios.get<PaginatedHomeworkResponse>(
      '/institute-class-subject-homeworks',
      {
        params: {
          classId: props.classId,
          subjectId: props.subjectId,
          page,
          limit,
          sortBy: 'startDate',
          sortOrder: 'DESC',
          includeSubmissions: true,
        },
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`
        }
      }
    );

    homeworks.value = response.data.data;
    currentPage.value = response.data.meta.page;
    totalPages.value = response.data.meta.totalPages;
    total.value = response.data.meta.total;
  } catch (err: any) {
    error.value = err.response?.data?.message || 'Failed to fetch homeworks';
  } finally {
    loading.value = false;
  }
};

const goToPage = (page: number) => {
  if (page >= 1 && page <= totalPages.value) {
    currentPage.value = page;
  }
};

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString();
};

// Watch for page changes
watch(currentPage, (newPage) => {
  fetchHomeworks(newPage);
});

// Watch for prop changes
watch([() => props.classId, () => props.subjectId], () => {
  currentPage.value = 1;
  fetchHomeworks(1);
});

onMounted(() => {
  fetchHomeworks(1);
});
</script>
```

### Axios Service (Reusable)

```typescript
// services/homeworkService.ts
import axios, { AxiosInstance } from 'axios';

class HomeworkService {
  private api: AxiosInstance;

  constructor() {
    this.api = axios.create({
      baseURL: process.env.REACT_APP_API_URL || 'http://localhost:3000',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add auth token interceptor
    this.api.interceptors.request.use((config) => {
      const token = localStorage.getItem('token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });
  }

  async getHomeworks(params: HomeworkQueryParams): Promise<PaginatedHomeworkResponse> {
    const response = await this.api.get<PaginatedHomeworkResponse>(
      '/institute-class-subject-homeworks',
      { params }
    );
    return response.data;
  }

  async getHomeworksByClass(
    classId: string,
    subjectId: string,
    params?: Omit<HomeworkQueryParams, 'classId' | 'subjectId'>
  ): Promise<PaginatedHomeworkResponse> {
    const response = await this.api.get<PaginatedHomeworkResponse>(
      `/institute-class-subject-homeworks/class/${classId}/subject/${subjectId}`,
      { params }
    );
    return response.data;
  }

  async getHomeworksByInstitute(
    instituteId: string,
    params?: Omit<HomeworkQueryParams, 'instituteId'>
  ): Promise<PaginatedHomeworkResponse> {
    const response = await this.api.get<PaginatedHomeworkResponse>(
      `/institute-class-subject-homeworks/institute/${instituteId}`,
      { params }
    );
    return response.data;
  }
}

export default new HomeworkService();
```

---

## 🎓 Teacher Corrections - Complete Guide

### What Are Teacher Corrections?

When `includeSubmissions=true`, the API **ALWAYS includes teacher corrections automatically**:
- `teacherCorrectionFileUrl` - Corrected file uploaded by teacher
- `remarks` - Teacher's feedback/comments
- `correctionStatus` - Whether corrected or pending
- Correction metadata (hasCorrectionFile, hasRemarks, isCorrected)

**No separate parameter needed** - corrections are included automatically when available.

### Correction Data Structure

```typescript
interface Submission {
  // Student's submission
  fileUrl: string | null;
  submissionDate: string;
  
  // Teacher's corrections (ALWAYS included when available)
  teacherCorrectionFileUrl: string | null;  // Corrected file
  remarks: string | null;                   // Teacher's feedback
  hasCorrectionFile: boolean;               // Has correction file?
  hasRemarks: boolean;                      // Has feedback?
  isCorrected: boolean;                     // Corrected at all?
  correctionStatus: 'corrected' | 'pending'; // Status
  updatedAt: string;                        // Last update date
}
```

### Displaying Corrections - Complete Component

```tsx
import React from 'react';

interface CorrectionDisplayProps {
  homework: Homework;
}

const HomeworkWithCorrections: React.FC<CorrectionDisplayProps> = ({ homework }) => {
  const latestSubmission = homework.mySubmissions?.[0];

  return (
    <div className="homework-card">
      {/* Homework Details */}
      <div className="homework-header">
        <h3>{homework.title}</h3>
        <p>{homework.description}</p>
        <p className="due-date">
          Due: {new Date(homework.endDate).toLocaleDateString()}
        </p>
      </div>

      {/* Submission Status */}
      <div className="submission-section">
        {!latestSubmission ? (
          // Not submitted
          <div className="alert alert-warning">
            <span className="icon">⚠️</span>
            <span>Not Submitted</span>
            <button className="btn-submit">Submit Now</button>
          </div>
        ) : latestSubmission.isCorrected ? (
          // Submitted and corrected
          <div className="alert alert-success">
            <span className="icon">✅</span>
            <span>Corrected by Teacher</span>
          </div>
        ) : (
          // Submitted but pending correction
          <div className="alert alert-info">
            <span className="icon">📝</span>
            <span>Submitted - Awaiting Correction</span>
          </div>
        )}
      </div>

      {/* Submission Details */}
      {latestSubmission && (
        <div className="submission-details">
          {/* Student's Submission */}
          <div className="student-submission-box">
            <h4>Your Submission</h4>
            <p className="submission-date">
              Submitted: {new Date(latestSubmission.submissionDate).toLocaleString()}
            </p>
            
            {latestSubmission.fileUrl && (
              <a 
                href={latestSubmission.fileUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                className="btn btn-outline"
              >
                📄 View Your Submission
              </a>
            )}
            
            {latestSubmission.driveViewUrl && (
              <a 
                href={latestSubmission.driveViewUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                className="btn btn-outline"
              >
                📁 View on Google Drive
              </a>
            )}
          </div>

          {/* Teacher's Corrections */}
          {latestSubmission.isCorrected && (
            <div className="teacher-corrections-box">
              <h4 className="corrections-header">
                <span className="icon">✅</span>
                Teacher's Corrections
              </h4>

              {/* Correction File Download */}
              {latestSubmission.hasCorrectionFile && (
                <div className="correction-file-download">
                  <a 
                    href={latestSubmission.teacherCorrectionFileUrl!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-primary btn-large"
                  >
                    <span className="icon">📥</span>
                    Download Corrected File
                  </a>
                  <p className="helper-text">
                    This is your homework with teacher's corrections marked
                  </p>
                </div>
              )}

              {/* Teacher's Remarks/Feedback */}
              {latestSubmission.hasRemarks && (
                <div className="teacher-remarks">
                  <label className="remarks-label">Teacher's Feedback:</label>
                  <div className="remarks-content">
                    <p>{latestSubmission.remarks}</p>
                  </div>
                </div>
              )}

              {/* Correction Date */}
              <p className="correction-date">
                <span className="icon">📅</span>
                Corrected on: {new Date(latestSubmission.updatedAt).toLocaleString()}
              </p>
            </div>
          )}

          {/* Pending Correction Message */}
          {!latestSubmission.isCorrected && (
            <div className="pending-correction-box">
              <p className="pending-message">
                <span className="icon">⏳</span>
                Your teacher is reviewing your submission. 
                You'll be notified when corrections are available.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Submission Statistics */}
      {homework.submissionCount > 0 && (
        <div className="submission-stats">
          <span className="stat">
            Total Submissions: {homework.submissionCount}
          </span>
          <span className="stat">
            Corrected: {homework.correctedCount}
          </span>
          <span className="stat">
            Pending: {homework.pendingCorrectionCount}
          </span>
        </div>
      )}
    </div>
  );
};

export default HomeworkWithCorrections;
```

### Correction Status Helper Functions

```typescript
// Check if homework has corrections
const hasCorrectionAvailable = (homework: Homework): boolean => {
  const submission = homework.mySubmissions?.[0];
  return submission?.isCorrected || false;
};

// Get correction status for display
const getCorrectionStatusBadge = (homework: Homework) => {
  const submission = homework.mySubmissions?.[0];
  
  if (!submission) {
    return {
      text: 'Not Submitted',
      className: 'badge-warning',
      icon: '⚠️'
    };
  }
  
  if (submission.isCorrected) {
    return {
      text: 'Corrected',
      className: 'badge-success',
      icon: '✅',
      details: {
        hasFile: submission.hasCorrectionFile,
        hasFeedback: submission.hasRemarks
      }
    };
  }
  
  return {
    text: 'Pending Correction',
    className: 'badge-info',
    icon: '⏳'
  };
};

// Get correction download link
const getCorrectionFileUrl = (homework: Homework): string | null => {
  const submission = homework.mySubmissions?.[0];
  return submission?.teacherCorrectionFileUrl || null;
};

// Get teacher's feedback
const getTeacherFeedback = (homework: Homework): string | null => {
  const submission = homework.mySubmissions?.[0];
  return submission?.remarks || null;
};
```

### Vue 3 Corrections Component

```vue
<template>
  <div class="homework-corrections">
    <h3>{{ homework.title }}</h3>
    
    <!-- Submission Status -->
    <div v-if="!submission" class="alert-warning">
      ⚠️ Not Submitted
    </div>
    
    <div v-else-if="submission.isCorrected" class="corrections-available">
      <!-- Corrections Header -->
      <div class="alert-success">
        ✅ Teacher has corrected your homework
      </div>
      
      <!-- Download Corrected File -->
      <a 
        v-if="submission.hasCorrectionFile"
        :href="submission.teacherCorrectionFileUrl"
        target="_blank"
        class="btn-download"
      >
        📥 Download Corrected File
      </a>
      
      <!-- Teacher Feedback -->
      <div v-if="submission.hasRemarks" class="feedback-box">
        <h4>Teacher's Feedback:</h4>
        <p>{{ submission.remarks }}</p>
      </div>
      
      <!-- Correction Date -->
      <p class="text-muted">
        Corrected: {{ formatDate(submission.updatedAt) }}
      </p>
    </div>
    
    <div v-else class="alert-info">
      ⏳ Submitted - Awaiting teacher's correction
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

interface Props {
  homework: Homework;
}

const props = defineProps<Props>();

const submission = computed(() => props.homework.mySubmissions?.[0]);

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleString();
};
</script>
```

### Filtering Homeworks by Correction Status

```typescript
// Get only corrected homeworks
const getCorrectedHomeworks = (homeworks: Homework[]): Homework[] => {
  return homeworks.filter(hw => 
    hw.mySubmissions?.[0]?.isCorrected
  );
};

// Get pending corrections
const getPendingCorrections = (homeworks: Homework[]): Homework[] => {
  return homeworks.filter(hw => 
    hw.mySubmissions?.length > 0 && 
    !hw.mySubmissions[0].isCorrected
  );
};

// Get unsubmitted homeworks
const getUnsubmittedHomeworks = (homeworks: Homework[]): Homework[] => {
  return homeworks.filter(hw => 
    !hw.mySubmissions || hw.mySubmissions.length === 0
  );
};

// Get correction statistics
const getCorrectionStats = (homeworks: Homework[]) => {
  const total = homeworks.length;
  const corrected = getCorrectedHomeworks(homeworks).length;
  const pending = getPendingCorrections(homeworks).length;
  const unsubmitted = getUnsubmittedHomeworks(homeworks).length;
  
  return {
    total,
    corrected,
    pending,
    unsubmitted,
    correctionRate: total > 0 ? (corrected / total * 100).toFixed(1) : '0.0'
  };
};
```

### Example API Call with Corrections

```typescript
// Fetch homeworks with corrections
const fetchHomeworksWithCorrections = async () => {
  const response = await axios.get<PaginatedHomeworkResponse>(
    '/institute-class-subject-homeworks',
    {
      params: {
        instituteId: '101',
        classId: '1000',
        subjectId: '2',
        includeSubmissions: true,  // Corrections included automatically!
        page: 1,
        limit: 10
      },
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  );
  
  // Process corrections
  response.data.data.forEach(homework => {
    const submission = homework.mySubmissions?.[0];
    
    if (submission?.isCorrected) {
      console.log('✅ Homework corrected:', homework.title);
      
      if (submission.hasCorrectionFile) {
        console.log('📄 Correction file:', submission.teacherCorrectionFileUrl);
      }
      
      if (submission.hasRemarks) {
        console.log('💬 Teacher feedback:', submission.remarks);
      }
    }
  });
  
  return response.data;
};
```

### Notifications for New Corrections

```typescript
// Check for new corrections (compare with previous data)
const checkForNewCorrections = (
  previousHomeworks: Homework[],
  currentHomeworks: Homework[]
): Homework[] => {
  const newCorrections: Homework[] = [];
  
  currentHomeworks.forEach(current => {
    const previous = previousHomeworks.find(p => p.id === current.id);
    const currentSubmission = current.mySubmissions?.[0];
    const previousSubmission = previous?.mySubmissions?.[0];
    
    // Check if this is a new correction
    if (
      currentSubmission?.isCorrected && 
      !previousSubmission?.isCorrected
    ) {
      newCorrections.push(current);
    }
  });
  
  return newCorrections;
};

// Show notification for new corrections
const notifyNewCorrections = (newCorrections: Homework[]) => {
  newCorrections.forEach(homework => {
    // Use your notification system
    showNotification({
      title: 'New Correction Available',
      message: `Teacher has corrected "${homework.title}"`,
      type: 'success',
      action: {
        label: 'View',
        onClick: () => navigateToHomework(homework.id)
      }
    });
  });
};
```

### CSS Styling Example

```css
/* Correction Status Badges */
.badge-success {
  background: #28a745;
  color: white;
  padding: 4px 12px;
  border-radius: 12px;
  font-weight: 600;
}

.badge-info {
  background: #17a2b8;
  color: white;
  padding: 4px 12px;
  border-radius: 12px;
}

.badge-warning {
  background: #ffc107;
  color: #212529;
  padding: 4px 12px;
  border-radius: 12px;
  font-weight: 600;
}

/* Teacher Corrections Box */
.teacher-corrections-box {
  border: 2px solid #28a745;
  border-radius: 8px;
  padding: 20px;
  margin-top: 16px;
  background: #f0fff4;
}

.corrections-header {
  color: #28a745;
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  gap: 8px;
}

/* Correction File Download */
.correction-file-download {
  margin: 16px 0;
}

.btn-large {
  padding: 12px 24px;
  font-size: 16px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

/* Teacher Remarks */
.teacher-remarks {
  background: white;
  border-left: 4px solid #28a745;
  padding: 16px;
  margin: 16px 0;
  border-radius: 4px;
}

.remarks-label {
  font-weight: 600;
  color: #28a745;
  display: block;
  margin-bottom: 8px;
}

.remarks-content p {
  margin: 0;
  line-height: 1.6;
  color: #495057;
}

/* Pending Correction */
.pending-correction-box {
  background: #e7f3ff;
  border: 1px solid #17a2b8;
  border-radius: 8px;
  padding: 16px;
  margin-top: 16px;
}

.pending-message {
  margin: 0;
  color: #0c5460;
  display: flex;
  align-items: center;
  gap: 8px;
}
```

---

## ⚠️ Error Handling

### Common Errors

| Status Code | Error | Cause | Solution |
|-------------|-------|-------|----------|
| 401 | Unauthorized | Missing/invalid JWT token | Re-authenticate user |
| 403 | Forbidden | User lacks permission | Check user role/access |
| 404 | Not Found | Invalid endpoint/resource | Verify URL and IDs |
| 400 | Bad Request | Invalid parameters | Validate input before sending |
| 500 | Server Error | Backend issue | Show error message, retry |

### Error Handling Example

```typescript
const fetchHomeworks = async (params: HomeworkQueryParams) => {
  try {
    const response = await homeworkService.getHomeworks(params);
    return response;
  } catch (error: any) {
    // Handle specific errors
    if (error.response) {
      switch (error.response.status) {
        case 401:
          // Redirect to login
          window.location.href = '/login';
          break;
        case 403:
          console.error('Access denied:', error.response.data.message);
          break;
        case 404:
          console.error('Resource not found');
          break;
        case 400:
          console.error('Invalid request:', error.response.data.message);
          break;
        default:
          console.error('Server error:', error.response.data.message);
      }
    } else if (error.request) {
      // Network error
      console.error('Network error - please check your connection');
    } else {
      console.error('Error:', error.message);
    }
    throw error;
  }
};
```

---

## ✅ Best Practices

### 1. Always Include JWT Token
```typescript
axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
```

### 2. Use Pagination Defaults
```typescript
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;
```

### 3. Cache Responses (Optional)
```typescript
import { useQuery } from '@tanstack/react-query';

const { data, isLoading, error } = useQuery({
  queryKey: ['homeworks', classId, subjectId, currentPage],
  queryFn: () => fetchHomeworks({ classId, subjectId, page: currentPage }),
  staleTime: 5 * 60 * 1000, // 5 minutes
});
```

### 4. Debounce Search Queries
```typescript
import { debounce } from 'lodash';

const debouncedSearch = debounce((searchTerm: string) => {
  fetchHomeworks({ search: searchTerm, page: 1 });
}, 500);
```

### 5. Handle Date Formats Properly
```typescript
// Always use YYYY-MM-DD format for API
const formatDateForAPI = (date: Date): string => {
  return date.toISOString().split('T')[0];
};

// Display format for users
const formatDateForDisplay = (dateString: string): string => {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
};
```

### 6. Build URLs Safely
```typescript
const buildQueryParams = (params: HomeworkQueryParams): string => {
  const searchParams = new URLSearchParams();
  
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.append(key, value.toString());
    }
  });
  
  return searchParams.toString();
};
```

### 7. Show Submission Status Clearly
```typescript
const getSubmissionStatus = (homework: Homework) => {
  if (!homework.mySubmissions || homework.mySubmissions.length === 0) {
    return { 
      status: 'not-submitted', 
      label: 'Not Submitted', 
      color: 'warning',
      icon: '⚠️'
    };
  }
  
  const latestSubmission = homework.mySubmissions[0];
  
  // Check if teacher has corrected
  if (latestSubmission.isCorrected) {
    return { 
      status: 'corrected', 
      label: 'Corrected by Teacher', 
      color: 'success',
      icon: '✅',
      hasCorrectionFile: latestSubmission.hasCorrectionFile,
      hasRemarks: latestSubmission.hasRemarks
    };
  }
  
  // Submitted but not corrected yet
  return { 
    status: 'submitted', 
    label: 'Submitted - Awaiting Correction', 
    color: 'info',
    icon: '📝'
  };
};
```

### 8. Handle Different URL Types Properly
```typescript
// Display submission file based on type
const getSubmissionFileUrl = (submission: Submission): string | null => {
  if (submission.submissionType === 'GOOGLE_DRIVE') {
    // For Google Drive submissions, use Drive view URL
    return submission.driveViewUrl;
  } else if (submission.submissionType === 'UPLOAD') {
    // For uploaded files, use cloud storage URL (already full URL)
    return submission.fileUrl;
  }
  return null;
};

// Download or view submission
const viewSubmission = (submission: Submission) => {
  const url = getSubmissionFileUrl(submission);
  if (url) {
    window.open(url, '_blank');
  }
};

// Get file metadata for display
const getFileMetadata = (submission: Submission) => {
  if (submission.submissionType === 'GOOGLE_DRIVE') {
    return {
      name: submission.driveFileName || 'Untitled',
      size: submission.driveFileSize || 0,
      mimeType: submission.driveMimeType || 'application/octet-stream',
      source: 'Google Drive'
    };
  } else {
    // For uploads, extract from fileUrl or use defaults
    const fileName = submission.fileUrl?.split('/').pop() || 'submission';
    return {
      name: fileName,
      size: null,  // Size not available for S3 URLs without additional API call
      mimeType: null,
      source: 'Upload'
    };
  }
};

// Display in component
const SubmissionFileLink: React.FC<{ submission: Submission }> = ({ submission }) => {
  const url = getSubmissionFileUrl(submission);
  const metadata = getFileMetadata(submission);
  
  if (!url) return <span className="text-muted">No file</span>;
  
  return (
    <div className="submission-file">
      <a href={url} target="_blank" rel="noopener noreferrer">
        {metadata.source === 'Google Drive' && <span>📁</span>}
        {metadata.source === 'Upload' && <span>📄</span>}
        {metadata.name}
      </a>
      {metadata.size && (
        <span className="file-size">
          ({(metadata.size / 1024).toFixed(2)} KB)
        </span>
      )}
    </div>
  );
};

// Teacher corrections are ALWAYS cloud storage URLs
const viewCorrectionFile = (submission: Submission) => {
  if (submission.teacherCorrectionFileUrl) {
    // This is always a full cloud storage URL, no special handling needed
    window.open(submission.teacherCorrectionFileUrl, '_blank');
  }
};
```

### 9. Display Teacher Corrections
```tsx
const SubmissionWithCorrections: React.FC<{ submission: Submission }> = ({ submission }) => {
  return (
    <div className="submission-details">
      {/* Student's Submission */}
      <div className="student-submission">
        <h4>Your Submission</h4>
        <p>Submitted: {new Date(submission.submissionDate).toLocaleString()}</p>
        {submission.fileUrl && (
          <a href={submission.fileUrl} target="_blank" rel="noopener noreferrer">
            View Submission File
          </a>
        )}
        {submission.driveViewUrl && (
          <a href={submission.driveViewUrl} target="_blank" rel="noopener noreferrer">
            View on Google Drive
          </a>
        )}
      </div>

      {/* Teacher's Corrections */}
      {submission.isCorrected && (
        <div className="teacher-corrections">
          <h4>✅ Teacher's Corrections</h4>
          
          {submission.hasCorrectionFile && (
            <div className="correction-file">
              <a 
                href={submission.teacherCorrectionFileUrl!} 
                target="_blank" 
                rel="noopener noreferrer"
                className="btn btn-primary"
              >
                📄 Download Corrected File
              </a>
            </div>
          )}
          
          {submission.hasRemarks && (
            <div className="teacher-remarks">
              <label>Teacher's Feedback:</label>
              <p className="remarks-text">{submission.remarks}</p>
            </div>
          )}
          
          <p className="correction-date">
            Corrected: {new Date(submission.updatedAt).toLocaleString()}
          </p>
        </div>
      )}

      {/* Pending Correction */}
      {!submission.isCorrected && (
        <div className="pending-correction">
          <p className="text-muted">
            ⏳ Awaiting teacher's correction...
          </p>
        </div>
      )}
    </div>
  );
};
```

### 10. Optimize Performance
```typescript
// Lazy load references only when needed
const [showReferences, setShowReferences] = useState(false);

const fetchHomeworkWithReferences = async (id: string) => {
  const response = await axios.get(
    `/institute-class-subject-homeworks`,
    { 
      params: { 
        id, 
        includeReferences: true  // Only fetch when needed
      } 
    }
  );
  return response.data;
};
```

---

## 🚀 Quick Start Checklist

- [ ] Set up Axios with JWT token interceptor
- [ ] Create TypeScript interfaces for Homework, Submission, Reference
- [ ] Implement pagination component
- [ ] Add error handling for 401/403/500 errors
- [ ] Test with complete URLs including pagination
- [ ] Verify `mySubmissions` auto-filters by JWT token
- [ ] **Implement teacher corrections display (teacherCorrectionFileUrl, remarks)**
- [ ] **Add correction status badges (corrected/pending/not submitted)**
- [ ] **Handle correction file downloads**
- [ ] Handle date formatting (YYYY-MM-DD for API)
- [ ] Add loading states for better UX
- [ ] Implement search with debouncing
- [ ] Cache responses for performance (optional)
- [ ] **Add notifications for new corrections (optional)**

---

## 📞 Support

For backend API issues, check:
- [HOMEWORK_COMPLETE_API_GUIDE.md](./HOMEWORK_COMPLETE_API_GUIDE.md)
- [HOMEWORK_SYSTEM_FRONTEND_GUIDE.md](./HOMEWORK_SYSTEM_FRONTEND_GUIDE.md)

**Important Notes:**
- Submissions are ALWAYS filtered by JWT token userId for security
- Never pass `userId` parameter - it will be ignored
- **Teacher corrections are ALWAYS included automatically** when `includeSubmissions=true`
- No separate parameter needed for corrections - they come with submissions
- Correction fields: `teacherCorrectionFileUrl`, `remarks`, `correctionStatus`
