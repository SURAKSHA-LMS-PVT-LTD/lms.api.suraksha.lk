# Institute Class Lectures — Frontend Implementation Guide

## Overview

Institute class lectures are class-level lectures visible to **all class members** regardless of subject enrollment. When a class is selected but no subject is selected, the frontend uses `/institute-class-lectures` endpoints.

> **Key Difference from Subject Lectures**: No `subjectId` FK. The `subject` field is free-text (display only).

---

## 1. API Client — `lecture.api.ts`

### Import

```typescript
import { lectureApi, Lecture, LectureCreateData } from '@/api/lecture.api';
```

### Data Model

```typescript
interface Lecture {
  id: string;
  instituteId: string;
  classId: string;
  instructorId: string;
  title: string;
  description?: string;
  lectureType: 'online' | 'physical' | 'hybrid';
  venue?: string;
  subject?: string;              // Free-text, for display only
  startTime: string;             // ISO 8601
  endTime: string;               // ISO 8601
  status: 'scheduled' | 'ongoing' | 'completed' | 'cancelled';
  meetingLink?: string;
  meetingId?: string;
  meetingPassword?: string;      // Excluded from API responses
  recordingUrl?: string;
  isRecorded: boolean;
  maxParticipants?: number;
  isActive: boolean;
  thumbnailUrl?: string;         // Relative S3 path (stored) or full URL (in response)
  materials?: LectureMaterial[];
  createdAt?: string;
  updatedAt?: string;
}

interface LectureMaterial {
  documentName: string;
  documentUrl: string;
  driveFileId?: string;
  driveWebViewLink?: string;
  source?: 'S3' | 'GOOGLE_DRIVE' | 'GOOGLE_DRIVE_INSTITUTE' | 'EXTERNAL_LINK';
}
```

### Available Methods (Class Lectures)

| Method | HTTP | Endpoint | Description |
|--------|------|----------|-------------|
| `lectureApi.getClassLectures(params)` | GET | `/institute-class-lectures` | Paginated list with filters |
| `lectureApi.getClassLecturesByClass(classId, instituteId)` | GET | `/institute-class-lectures/class/:classId` | All lectures for a class |
| `lectureApi.createClassLecture(data)` | POST | `/institute-class-lectures` | Create a lecture |
| `lectureApi.updateClassLecture(id, data, context)` | PATCH | `/institute-class-lectures/:id` | Update a lecture |
| `lectureApi.updateClassLectureStatus(id, status, context)` | PATCH | `/institute-class-lectures/:id/status` | Quick status change |
| `lectureApi.rescheduleClassLecture(id, startTime, endTime, context)` | PATCH | `/institute-class-lectures/:id/reschedule` | Reschedule only |
| `lectureApi.deleteClassLecture(id, context)` | PATCH | `/institute-class-lectures/:id` | Soft delete (sets isActive=false) |
| `lectureApi.deleteClassLecturePermanent(id, context)` | DELETE | `/institute-class-lectures/:id/permanent` | Permanent delete |

### Get Lecture with Full Details

```typescript
// Direct API call for full details with relations (institute, class, instructor)
const response = await cachedApiClient.get(`/institute-class-lectures/${id}/details`);
```

**Response includes hydrated relations:**

```json
{
  "id": "123",
  "instituteId": "109",
  "classId": "1004",
  "instructorId": "42",
  "title": "Introduction to Class Orientation",
  "institute": {
    "id": "109",
    "name": "Sample Institute"
  },
  "class": {
    "id": "1004",
    "name": "Grade 10 A",
    "grade": 10
  },
  "instructor": {
    "id": "42",
    "firstName": "John",
    "lastName": "Doe",
    "email": "john@example.com"
  },
  "lectureType": "physical",
  "venue": "Room 101",
  "subject": "Mathematics",
  "startTime": "2026-04-12T09:00:00.000Z",
  "endTime": "2026-04-12T10:30:00.000Z",
  "status": "scheduled",
  "isActive": true,
  "thumbnailUrl": "https://storage.suraksha.lk/lecture-thumbnails/abc123.jpg",
  "materials": [
    {
      "documentName": "Chapter 1 Notes",
      "documentUrl": "https://storage.suraksha.lk/materials/chapter1.pdf",
      "source": "S3"
    }
  ],
  "recordingUrl": null,
  "isRecorded": false,
  "maxParticipants": 50,
  "createdAt": "2026-04-11T08:00:00.000Z",
  "updatedAt": "2026-04-11T08:00:00.000Z"
}
```

### Cache Strategy

All GET methods use `enhancedCachedClient` with **10-minute TTL** and context isolation:

```typescript
// Cache is keyed by: endpoint + params + userId + role + instituteId + classId
enhancedCachedClient.get('/institute-class-lectures', params, {
  ttl: 10,
  userId: user.id,
  role: userRole,
  instituteId: context.instituteId,
  classId: context.classId
});
```

All mutating methods (`create`, `update`, `delete`) **automatically invalidate** the cached list.

---

## 2. Endpoint Selection Logic

The `Lectures.tsx` page dynamically selects the correct endpoint based on user context:

```typescript
const endpoint = useMemo(() => {
  if (userRole === 'Student') {
    // Student with subject selected → subject-level lectures
    if (currentInstituteId && currentClassId && currentSubjectId)
      return '/institute-class-subject-lectures';
    // Student with class but no subject → class-level lectures
    if (currentInstituteId && currentClassId)
      return '/institute-class-lectures';
    return '/institute-class-subject-lectures';
  } else if (userRole === 'InstituteAdmin' || userRole === 'Teacher') {
    if (currentInstituteId && currentClassId && currentSubjectId)
      return '/institute-class-subject-lectures';
    // Class selected but no subject → class-level lectures
    if (currentInstituteId && currentClassId)
      return '/institute-class-lectures';
  }
  return '/lectures';
}, [userRole, currentInstituteId, currentClassId, currentSubjectId]);
```

**Rule**: When `currentSubjectId` is empty/null and a class is selected → uses `/institute-class-lectures`.

---

## 3. Data Loading — `useTableData` Hook

```typescript
import { useTableData } from '@/hooks/useTableData';

const tableData = useTableData({
  endpoint,                                     // '/institute-class-lectures'
  defaultParams: {
    instituteId: currentInstituteId,
    classId: currentClassId,
    instructorId: userRole === 'Teacher' ? user.id : undefined,
  },
  dependencies: [currentInstituteId, currentClassId, currentSubjectId],
  pagination: {
    defaultLimit: 50,
    availableLimits: [25, 50, 100],
  },
  autoLoad: true,
});

const {
  state: { data: lecturesData, loading, error, lastRefresh },
  pagination,        // { page, limit, totalCount, setPage, setLimit }
  actions: {
    refresh,         // Force refresh from server
    loadData,        // Load with optional forceRefresh
    updateFilters,   // Merge new filter values
  },
} = tableData;
```

### Filter Parameters

| Param | Type | Description |
|-------|------|-------------|
| `instituteId` | string | Required — filter by institute |
| `classId` | string | Optional — filter by class |
| `instructorId` | string | Optional — filter by teacher |
| `lectureType` | string | `online`, `physical`, `hybrid` |
| `status` | string | `scheduled`, `ongoing`, `completed`, `cancelled` |
| `dateFrom` | string | Start date `YYYY-MM-DD` |
| `dateTo` | string | End date `YYYY-MM-DD` |
| `isActive` | boolean | Active status filter |
| `search` | string | Search title/description |
| `page` | number | Page number (1-based) |
| `limit` | number | Results per page |

---

## 4. Create Lecture — `CreateClassLectureForm`

### Import & Usage

```tsx
import CreateClassLectureForm from '@/components/forms/CreateClassLectureForm';

<Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
  <DialogContent className="max-w-4xl max-h-[95vh] overflow-y-auto">
    <DialogHeader>
      <DialogTitle>Create Class Lecture</DialogTitle>
    </DialogHeader>
    <CreateClassLectureForm
      onClose={() => setIsCreateDialogOpen(false)}
      onSuccess={handleCreateLecture}
    />
  </DialogContent>
</Dialog>
```

### Form Fields

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| Title | text | Yes | — | Min 3 chars |
| Description | textarea | No | — | Max 5000 chars |
| Subject | text | No | — | Free-text (display only) |
| Mode | select | Yes | `physical` | `online`, `physical`, `hybrid` |
| Venue | text | No | — | Physical/hybrid only |
| Start Time | datetime-local | Yes | — | ISO format |
| End Time | datetime-local | Yes | — | Must be after start |
| Status | select | No | `scheduled` | `scheduled`, `ongoing`, `completed`, `cancelled` |
| Meeting Link | url | No | — | Online/hybrid only |
| Meeting ID | text | No | — | Online/hybrid only |
| Meeting Password | text | No | — | Online/hybrid only |
| Recording URL | url | No | — | Sets `isRecorded` automatically |
| Max Participants | number | No | `50` | 1–10000 |
| Is Active | toggle | No | `true` | — |
| Thumbnail | upload/url | No | — | See Thumbnail section |
| Materials | multi-source | No | — | See Materials section |

### Submission Payload

```typescript
await lectureApi.createClassLecture({
  instituteId: selectedInstitute.id,
  classId: selectedClass.id,
  instructorId: user.id,
  title: formData.title,
  description: formData.description || '',
  lectureType: formData.mode,
  venue: formData.venue || undefined,
  subject: formData.subject || undefined,
  startTime: formData.timeStart,
  endTime: formData.timeEnd,
  status: formData.status,
  meetingLink: formData.liveLink || undefined,
  meetingId: formData.meetingId || undefined,
  meetingPassword: formData.meetingPassword || undefined,
  recordingUrl: formData.recordingUrl || undefined,
  isRecorded: !!formData.recordingUrl,
  maxParticipants: formData.maxParticipants,
  isActive: formData.isActive,
  materials: materials.length > 0 ? materials : undefined,
  thumbnailUrl: thumbnailUrl || undefined,
});
```

### After Success

```typescript
toast({ title: "Success", description: "Class lecture created successfully" });
if (onSuccess) await onSuccess();  // Closes dialog + refreshes list
// Form auto-resets all fields, materials, and thumbnailUrl
```

---

## 5. Update Lecture — `UpdateClassLectureForm`

### Import & Usage

```tsx
import UpdateClassLectureForm from '@/components/forms/UpdateClassLectureForm';

<Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
  <DialogContent className="max-w-4xl max-h-[95vh] overflow-y-auto">
    <DialogHeader>
      <DialogTitle>Update Class Lecture</DialogTitle>
    </DialogHeader>
    {selectedLectureData && (
      <UpdateClassLectureForm
        lecture={selectedLectureData}
        onClose={() => setIsEditDialogOpen(false)}
        onSuccess={handleUpdateLecture}
      />
    )}
  </DialogContent>
</Dialog>
```

### Form Initialization

```typescript
// State is populated from the lecture prop via useEffect:
setFormData({
  title: lecture.title || '',
  description: lecture.description || '',
  venue: lecture.venue || '',
  lectureType: lecture.lectureType || 'physical',    // Validated & lowercased
  subject: lecture.subject || '',
  startTime: lecture.startTime?.slice(0, 16) || '',  // Trim to datetime-local format
  endTime: lecture.endTime?.slice(0, 16) || '',
  status: lecture.status || 'scheduled',
  meetingLink: lecture.meetingLink || '',
  meetingId: lecture.meetingId || '',
  meetingPassword: lecture.meetingPassword || '',
  recordingUrl: lecture.recordingUrl || '',
  maxParticipants: lecture.maxParticipants || 50,
  isActive: lecture.isActive ?? true,
  isRecorded: lecture.isRecorded ?? false,
});
setMaterials(lecture.materials || []);
setThumbnailUrl(lecture.thumbnailUrl || '');
```

### Validation

```typescript
const errors: Record<string, string> = {};
if (!formData.title.trim()) errors.title = 'Title is required';
if (!formData.startTime) errors.startTime = 'Start time is required';
if (!formData.endTime) errors.endTime = 'End time is required';
if (formData.startTime && formData.endTime && formData.endTime <= formData.startTime)
  errors.endTime = 'End time must be after start time';
```

### Update Payload

```typescript
const payload = {
  title: formData.title,
  description: formData.description || null,
  venue: formData.venue || null,
  subject: formData.subject || null,
  lectureType: formData.lectureType,
  startTime: new Date(formData.startTime).toISOString(),
  endTime: new Date(formData.endTime).toISOString(),
  status: formData.status,
  meetingLink: formData.meetingLink || null,
  meetingId: formData.meetingId || null,
  meetingPassword: formData.meetingPassword || null,
  recordingUrl: formData.recordingUrl || null,
  maxParticipants: formData.maxParticipants,
  isActive: formData.isActive,
  isRecorded: !!formData.recordingUrl,
  materials: materials.length > 0 ? materials : [],
  thumbnailUrl: thumbnailUrl || null,         // null clears the thumbnail
};

await lectureApi.updateClassLecture(lecture.id, payload, {
  instituteId: lecture.instituteId,
  classId: lecture.classId,
});
```

---

## 6. Delete Lecture

### Soft Delete (Default — Teachers & Admins)

Sets `isActive = false`. Lecture is hidden but preserved in the database.

```typescript
// In Lectures.tsx:
const handleDeleteLecture = (lectureData: any) => {
  setDeleteDialog({ open: true, item: lectureData });
};

const confirmDeleteLecture = async () => {
  if (!deleteDialog.item) return;
  setIsDeleting(true);
  try {
    // Uses the same endpoint as the data source
    await cachedApiClient.patch(`${endpoint}/${deleteDialog.item.id}`, { isActive: false });
    toast({ title: "Lecture Deleted", description: "Lecture has been deactivated." });
    actions.refresh();            // Reload the list
  } catch (error) {
    toast({ title: "Error", description: "Failed to delete lecture", variant: "destructive" });
  } finally {
    setIsDeleting(false);
    setDeleteDialog({ open: false, item: null });
  }
};
```

### Confirmation Dialog

```tsx
<AlertDialog open={deleteDialog.open} onOpenChange={(open) => !open && setDeleteDialog({ open: false, item: null })}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Delete Lecture</AlertDialogTitle>
      <AlertDialogDescription>
        Are you sure you want to delete "{deleteDialog.item?.title}"? This will hide the lecture from all class members.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction onClick={confirmDeleteLecture} disabled={isDeleting}>
        {isDeleting ? 'Deleting...' : 'Delete'}
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

### Permanent Delete (Admin Only)

Permanently removes from the database. **Cannot be undone.**

```typescript
// Using lecture.api.ts:
await lectureApi.deleteClassLecturePermanent(lectureId, {
  instituteId: lecture.instituteId,
  classId: lecture.classId,
});
```

**Backend Response:**

```json
{
  "success": true,
  "message": "Lecture permanently deleted successfully",
  "lectureId": "123",
  "instituteId": "109",
  "classId": "1004"
}
```

### Role-Based Delete Access

| Role | Soft Delete | Permanent Delete |
|------|-------------|------------------|
| Teacher | Yes | No |
| Institute Admin | Yes | Yes |
| Super Admin | Yes | Yes |
| Student | No | No |

```typescript
// Permission check in Lectures.tsx:
const canDelete = userRole === 'Teacher'
  ? true
  : AccessControl.hasPermission(userRole, 'delete-lecture');
```

---

## 7. Thumbnail Upload — `LectureThumbnailUpload`

### Import & Usage

```tsx
import LectureThumbnailUpload from '@/components/common/LectureThumbnailUpload';

<LectureThumbnailUpload
  thumbnailUrl={thumbnailUrl}         // State: relative S3 path or ''
  onChange={setThumbnailUrl}          // Receives relative S3 path after upload
  disabled={isLoading}               // Disable during form submission
/>
```

### Props

```typescript
interface LectureThumbnailUploadProps {
  thumbnailUrl: string;                // Current value (relative S3 path or full URL)
  onChange: (url: string) => void;     // Callback — receives relative S3 path
  disabled?: boolean;                  // Disable interactions
}
```

### Upload Flow (File Upload Mode)

```
1. User clicks "Choose Image"
2. File input opens (accepts: image/*, max 5 MB)
3. Selected image opens in CROP DIALOG:
   - Aspect Ratio: 16:9 (standard video thumbnail)
   - Library: react-image-crop
   - Real-time crop preview
4. User clicks "Upload & Save"
5. Cropped image → JPEG Blob (quality: 0.92)
6. getSignedUrl('lecture-thumbnails', fileName, 'image/jpeg', blob.size)
    → Returns: { uploadUrl, relativePath, fields }
7. uploadToSignedUrl(uploadUrl, blob, fields)
    → AWS S3 POST with FormData
8. verifyAndPublish(relativePath)
    → POST /upload/verify-and-publish
9. Local blob URL created for INSTANT preview (avoids CDN delay)
10. onChange(relativePath) → Form state updated
11. Toast: "Thumbnail uploaded"
```

### Upload Flow (URL Mode)

```
1. User switches to "URL" tab
2. Enters full image URL (e.g., https://example.com/image.jpg)
3. URL validated (must be valid URL format)
4. onChange(url) → Form state updated
```

### Signed Upload API

```typescript
// Step 1: Get signed URL
GET /upload/get-signed-url?folder=lecture-thumbnails&fileName=photo.jpg&contentType=image/jpeg&fileSize=102400
Authorization: Bearer <jwt>

// Response:
{
  "success": true,
  "uploadUrl": "https://s3-bucket-url...",
  "publicUrl": "https://storage.suraksha.lk/lecture-thumbnails/abc123.jpg",
  "relativePath": "lecture-thumbnails/abc123.jpg",
  "fields": {
    "key": "lecture-thumbnails/abc123.jpg",
    "Content-Type": "image/jpeg",
    "X-Amz-Algorithm": "...",
    "X-Amz-Credential": "...",
    "Policy": "...",
    "X-Amz-Signature": "..."
  }
}

// Step 2: Upload to S3 (POST with FormData)
POST <uploadUrl>
Content-Type: multipart/form-data
// Add ALL fields from response FIRST, then add file as 'file' field LAST

// Step 3: Verify and publish
POST /upload/verify-and-publish
Authorization: Bearer <jwt>
Content-Type: application/json
{ "relativePath": "lecture-thumbnails/abc123.jpg" }
```

### Displaying Thumbnails

```typescript
import { getImageUrl } from '@/utils/imageUrlHelper';

// Converts relative paths to full CDN URLs:
// Input:  'lecture-thumbnails/abc123.jpg'
// Output: 'https://storage.suraksha.lk/lecture-thumbnails/abc123.jpg'

const thumbnailSrc = rawThumbUrl ? getImageUrl(rawThumbUrl) : '';
```

### In Card View (Lectures.tsx)

```tsx
const rawThumbUrl = item.thumbnailUrl || item.thumbnail_url;
const thumbnailSrc = rawThumbUrl ? getImageUrl(rawThumbUrl) : '';

{/* 16:9 aspect container */}
<div className="relative aspect-video bg-muted group">
  {thumbnailSrc ? (
    <img
      src={thumbnailSrc}
      alt={item.title}
      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
      loading="lazy"
    />
  ) : (
    <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground/50 gap-2">
      <ImageIcon className="h-10 w-10" />
      <span className="text-xs font-medium">No Thumbnail</span>
    </div>
  )}
  {/* Gradient overlay for text readability */}
  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
  {/* Status badge top-left */}
  <Badge className="absolute top-2 left-2 ...">{statusConfig.label}</Badge>
  {/* Type badge top-right */}
  <Badge className="absolute top-2 right-2 ...">{item.lectureType}</Badge>
  {/* Title overlay bottom */}
  <h3 className="absolute bottom-0 left-0 right-0 p-3 font-semibold text-white">{item.title}</h3>
</div>
```

### Local Blob Preview (After Upload)

The component uses `URL.createObjectURL(blob)` for instant preview after upload to avoid CDN propagation delay:

```typescript
// After S3 upload completes:
if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);    // Cleanup old
setLocalPreviewUrl(URL.createObjectURL(blob));                 // Instant local preview

// Preview priority:
const previewSrc = localPreviewUrl || (thumbnailUrl ? getImageUrl(thumbnailUrl) : '');
// localPreviewUrl (blob URL) takes priority → shows immediately after upload
// Falls back to getImageUrl(thumbnailUrl) for existing thumbnails loaded from API
```

---

## 8. Materials — `LectureMaterialsSection`

### Import & Usage

```tsx
import LectureMaterialsSection, { LectureMaterial } from '@/components/common/LectureMaterialsSection';

<LectureMaterialsSection
  materials={materials}                    // LectureMaterial[] state
  onChange={setMaterials}                  // State setter
  instituteId={selectedInstitute?.id}      // For institute Drive access
  className={selectedClass?.name}          // For Drive folder structure
  disabled={isLoading}                     // During submission
/>
```

### Material Sources

| Source | Description | How to Add |
|--------|-------------|------------|
| `S3` | Direct cloud storage file | Cloud tab → Upload file |
| `GOOGLE_DRIVE` | Personal Google Drive | Drive tab → Personal Drive toggle |
| `GOOGLE_DRIVE_INSTITUTE` | Institute shared Drive | Drive tab → Institute Drive toggle |
| `EXTERNAL_LINK` | YouTube, websites, etc. | Link tab → Enter URL |

### Material Data Structure

```typescript
interface LectureMaterial {
  documentName: string;                    // Display name
  documentUrl: string;                     // URL or S3 relative path
  driveFileId?: string;                    // Google Drive file ID
  driveWebViewLink?: string;               // Google Drive view link
  source?: 'S3' | 'GOOGLE_DRIVE' | 'GOOGLE_DRIVE_INSTITUTE' | 'EXTERNAL_LINK';
}
```

### External Link Addition

```typescript
// User enters name and URL:
const newMaterial: LectureMaterial = {
  documentName: materialName,
  documentUrl: materialUrl,
  source: 'EXTERNAL_LINK',
};
onChange([...materials, newMaterial]);
```

### Institute Drive Upload

```typescript
const result = await uploadToInstituteDrive({
  file,
  instituteId,
  purpose: 'LECTURE_DOCUMENT',
  folderParams: { grade, className: subjectClassName, subjectName },
});

const newMaterial: LectureMaterial = {
  documentName: result.fileName,
  documentUrl: result.viewUrl,
  driveFileId: result.driveFileId,
  driveWebViewLink: result.driveWebViewLink,
  source: 'GOOGLE_DRIVE_INSTITUTE',
};
```

### Materials Display

Each material shows:
- **Icon**: Cloud (S3), HardDrive (Institute Drive), HardDrive (Personal Drive), Link (External)
- **Name**: Truncated with tooltip
- **Source label**: "Cloud Storage", "Institute Drive", "Personal Drive", "External Link"
- **Actions**: Open (external link), Delete (remove from array)

---

## 9. Lecture Card View — Display Reference

### Card Layout (Grid: 1/2/3 cols responsive)

```
┌──────────────────────────────────────┐
│  ┌──────────────────────────────┐    │
│  │    16:9 THUMBNAIL IMAGE      │    │
│  │  [Status]            [Type]  │    │
│  │  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  │    │
│  │  Title text on gradient      │    │
│  └──────────────────────────────┘    │
│                                      │
│  📅 Apr 12, 2026 • 09:00            │
│  📍 Room 101  👥 50  📎 3 files     │
│  Description text (2 lines max)...   │
│                                      │
│  [▶ Join]  [📹 Recording]           │
│  [✏ Edit]  [🗑 Delete]              │
└──────────────────────────────────────┘
```

### Expanded Detail Panel (Click Card to Toggle)

When a card is clicked, an expanded panel appears below with:

```
┌──────────────────────────────────────┐
│  START TIME          END TIME        │
│  ┌────────────┐    ┌────────────┐   │
│  │ 📅 Apr 12  │    │ 📅 Apr 12  │   │
│  │ ⏰ 09:00   │    │ ⏰ 10:30   │   │
│  └────────────┘    └────────────┘   │
│                                      │
│  📎 MATERIALS                        │
│  ┌──────────────────────────────┐   │
│  │ 📄 Chapter 1 Notes    [View] │   │
│  │ 📄 Practice Problems  [View] │   │
│  └──────────────────────────────┘   │
│                                      │
│  [✏ Edit]  [🗑 Delete]              │
└──────────────────────────────────────┘
```

### Status Badge Colors

```typescript
const getStatusConfig = (status: string) => {
  switch (status) {
    case 'scheduled':  return { label: 'Scheduled',  className: 'border-blue-500/50 text-blue-700' };
    case 'ongoing':    return { label: '● Live',     className: 'border-green-500/50 text-green-700 animate-pulse' };
    case 'completed':  return { label: 'Completed',  className: 'border-gray-500/50 text-gray-700' };
    case 'cancelled':  return { label: 'Cancelled',  className: 'border-red-500/50 text-red-700' };
    default:           return { label: status,       className: 'border-gray-500/50' };
  }
};
```

---

## 10. Permissions

### Role-Based Access Control

```typescript
const userRole = useInstituteRole();  // 'InstituteAdmin' | 'Teacher' | 'Student'

// Create
const canAdd = AccessControl.hasPermission(userRole, 'create-lecture');
// Returns true for: InstituteAdmin, Teacher

// Edit
const canEdit = userRole === 'Teacher'
  ? true
  : AccessControl.hasPermission(userRole, 'edit-lecture');

// Delete
const canDelete = userRole === 'Teacher'
  ? true
  : AccessControl.hasPermission(userRole, 'delete-lecture');
```

| Action | InstituteAdmin | Teacher | Student |
|--------|---------------|---------|---------|
| View lectures | ✅ | ✅ | ✅ |
| Create lecture | ✅ | ✅ | ❌ |
| Edit lecture | ✅ | ✅ | ❌ |
| Soft delete | ✅ | ✅ | ❌ |
| Permanent delete | ✅ | ❌ | ❌ |
| Status update | ✅ | ✅ | ❌ |
| Reschedule | ✅ | ✅ | ❌ |

### Student Payment Gate

Students must have verified payment before accessing lectures:

```typescript
if (userRole === 'Student') {
  const vStatus = verificationStatus;
  if (vStatus && !['verified', 'enrolled_free_card'].includes(vStatus)) {
    // Show lock screen with reason and "Go to Fees & Payments" button
    return <PaymentGateScreen reason={vStatus} />;
  }
}
```

---

## 11. Full Page Flow

```
┌─────────────────────────────────────────────────────┐
│  LECTURES                                           │
│  ┌─────────────────────────────────────────────┐   │
│  │  [🔄 Refresh] [🔍 Search...] [⊞ Card ▪ Table] │ │
│  │  [📊 Filters ▼]              [+ Create]     │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  ┌─── Filter Bar (toggle) ────────────────────┐    │
│  │ Status: [All ▼]  Type: [All ▼]  [Clear]   │    │
│  └────────────────────────────────────────────┘    │
│                                                     │
│  ┌────────┐  ┌────────┐  ┌────────┐               │
│  │ Card 1 │  │ Card 2 │  │ Card 3 │               │
│  │        │  │        │  │        │               │
│  └────────┘  └────────┘  └────────┘               │
│                                                     │
│  Page 1 of 3  [< Prev] [Next >]  Showing 50/page  │
└─────────────────────────────────────────────────────┘
```

### Data Refresh Triggers

| Action | Method | Force? |
|--------|--------|--------|
| Page load (auto) | `loadData(false)` | No (uses cache) |
| Refresh button | `loadData(false)` | No (uses cache) |
| After create | `actions.refresh()` | Yes (force) |
| After update | `actions.refresh()` | Yes (force) |
| After delete | `actions.refresh()` | Yes (force) |
| Context change | `loadData(false)` | No (auto via deps) |

---

## 12. Complete API Endpoints Reference

### CRUD Operations

```
POST   /institute-class-lectures                    → Create lecture
GET    /institute-class-lectures                    → List (paginated + filtered)
GET    /institute-class-lectures/:id                → Get single lecture
GET    /institute-class-lectures/:id/details        → Get with institute/class/instructor relations
PATCH  /institute-class-lectures/:id                → Update lecture
PATCH  /institute-class-lectures/:id/status         → Status-only update
PATCH  /institute-class-lectures/:id/reschedule     → Reschedule (startTime + endTime)
DELETE /institute-class-lectures/:id                → Hard delete (Super Admin only)
DELETE /institute-class-lectures/:id/permanent      → Permanent delete (Admin+)
```

### Specialized Queries

```
GET    /institute-class-lectures/class/:classId           → All lectures for a class
GET    /institute-class-lectures/institute/:instituteId   → All lectures for an institute
GET    /institute-class-lectures/upcoming/:classId        → Future scheduled lectures
GET    /institute-class-lectures/ongoing/:classId         → Currently active lectures
GET    /institute-class-lectures/completed/:classId       → Completed lectures archive
GET    /institute-class-lectures/schedule/:date           → All lectures on a date (YYYY-MM-DD)
```

### Bulk Operation

```
POST   /institute-class-lectures/bulk               → Create multiple lectures
```

### Signed Upload (Thumbnails)

```
GET    /upload/get-signed-url?folder=lecture-thumbnails&fileName=X&contentType=X&fileSize=X
POST   /upload/verify-and-publish    { "relativePath": "lecture-thumbnails/X.jpg" }
```

---

## 13. URL Transformation Reference

### Storage → Display (Backend & Frontend)

The backend transforms S3/relative paths to full CDN URLs before returning:

```
DB:       lecture-thumbnails/abc123.jpg
API:      https://storage.suraksha.lk/lecture-thumbnails/abc123.jpg
```

The frontend also has `getImageUrl()` as a safety net:

```typescript
import { getImageUrl } from '@/utils/imageUrlHelper';

getImageUrl('lecture-thumbnails/abc123.jpg')
// → 'https://storage.suraksha.lk/lecture-thumbnails/abc123.jpg'

getImageUrl('https://storage.suraksha.lk/lecture-thumbnails/abc123.jpg')
// → 'https://storage.suraksha.lk/lecture-thumbnails/abc123.jpg' (no change)

getImageUrl('https://bucket.s3.us-east-1.amazonaws.com/lecture-thumbnails/abc123.jpg')
// → 'https://storage.suraksha.lk/lecture-thumbnails/abc123.jpg' (normalized)
```

### Display → Storage (Frontend → Backend)

When creating/updating, send the **relative path** (received from `getSignedUrl()`):

```
Send:     lecture-thumbnails/abc123.jpg       ← Relative path
NOT:      https://storage.suraksha.lk/...     ← Don't send full URL
```

---

## 14. Important Notes

1. **Thumbnail field name**: Backend uses `thumbnail_url` column → TypeORM maps to `thumbnailUrl` (camelCase). Frontend should check **both** `item.thumbnailUrl` and `item.thumbnail_url` as fallback.

2. **Status values differ from subject lectures**: Class lectures use `ongoing` instead of `live`.

3. **Soft delete is the default**: Frontend `deleteClassLecture()` patches `isActive=false`. Only admins can permanently delete.

4. **Materials are replaced on update**: Sending `materials: []` on update **clears all materials**. Send the full array to preserve existing ones.

5. **Cache invalidation**: All create/update/delete methods in `lecture.api.ts` automatically invalidate the `/institute-class-lectures` cache prefix, so the list refreshes with fresh data.

6. **Meeting password security**: `meetingPassword` is excluded from all GET responses (`select: false` in entity). It can only be set on create/update but never read back.
