# Enhanced User Management & Family Unit Creation

## Overview

This system provides enhanced user management capabilities for system administrators:

1. **Enhanced User Profile Fields**
   - Phone/Email verification status
   - Profile completion tracking
   - User settings (preferences)
   - First login flow management

2. **Family Unit Creation API**
   - Create student + parents/guardian in one API call
   - Minimal data requirements (only email OR phone required)
   - Automatic profile completion tracking
   - Welcome notifications with first-login links

---

## New User Entity Fields

| Field | Type | Description |
|-------|------|-------------|
| `isPhoneVerified` | boolean | Whether phone has been verified via OTP |
| `isEmailVerified` | boolean | Whether email has been verified |
| `profileCompletionStatus` | enum | INCOMPLETE, BASIC, COMPLETE |
| `profileCompletionPercentage` | tinyint | 0-100 completion percentage |
| `userSettings` | JSON | User preferences and settings |
| `firstLoginCompleted` | boolean | Has user completed first login setup |
| `passwordSetAt` | timestamp | When password was set |
| `lastLoginAt` | timestamp | Last successful login |
| `createdByAdminId` | bigint | Admin who created this user |

---

## Profile Completion Status

| Status | Description | Can Login? |
|--------|-------------|------------|
| `INCOMPLETE` | Minimal data provided (e.g., only phone) | ❌ No - Must complete first login |
| `BASIC` | Has name, contact, password | ✅ Yes - Limited features |
| `COMPLETE` | Full profile with verified contact | ✅ Yes - Full access |

---

## API Endpoints

### Base URL: `/admin/users`
**Access:** System Admin only (SUPER_ADMIN, ORGANIZATION_MANAGER)

### 1. Create Family Unit

Creates a complete family unit (student + optional parents) in one API call.

```http
POST /admin/users/family-unit
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "student": {
    "firstName": "Kasun",
    "lastName": "Perera",
    "phoneNumber": "+94771234567",
    "email": "kasun@example.com",
    "dateOfBirth": "2010-05-15",
    "gender": "MALE",
    "grade": "10"
  },
  "father": {
    "firstName": "Nimal",
    "lastName": "Perera",
    "phoneNumber": "+94772345678",
    "occupation": "ENGINEER",
    "workplace": "ABC Company"
  },
  "mother": {
    "firstName": "Kumari",
    "email": "kumari@example.com"
  },
  "guardian": null,
  "sendWelcomeNotifications": true,
  "instituteCode": "INST-20260122-001",
  "classId": "40"
}
```

**Minimal Request (only required fields):**
```json
{
  "student": {
    "phoneNumber": "+94771234567"
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Family unit created successfully. 3 user(s) need to complete their profile via first login.",
  "student": {
    "id": "123",
    "firstName": "Kasun",
    "lastName": "Perera",
    "phoneNumber": "+94771234567",
    "profileCompletionStatus": "INCOMPLETE",
    "profileCompletionPercentage": 25,
    "welcomeMessageSent": true,
    "studentId": "STU-2026-00001",
    "firstLoginUrl": "https://app.suraksha.lk/first-login?userId=123"
  },
  "father": {
    "id": "124",
    "firstName": "Nimal",
    "phoneNumber": "+94772345678",
    "profileCompletionStatus": "INCOMPLETE",
    "profileCompletionPercentage": 20,
    "welcomeMessageSent": true,
    "firstLoginUrl": "https://app.suraksha.lk/first-login?userId=124"
  },
  "mother": {
    "id": "125",
    "email": "kumari@example.com",
    "profileCompletionStatus": "INCOMPLETE",
    "profileCompletionPercentage": 10,
    "welcomeMessageSent": true,
    "firstLoginUrl": "https://app.suraksha.lk/first-login?userId=125"
  },
  "instituteEnrollment": {
    "success": true,
    "instituteId": "5",
    "instituteName": "Example Institute",
    "classId": "40",
    "className": "Grade 10 - Science",
    "message": "Student enrolled to Example Institute - Grade 10 - Science"
  },
  "totalUsersCreated": 3,
  "incompleteProfiles": 3,
  "notificationsSent": 3
}
```

### 2. Bulk Create Family Units

```http
POST /admin/users/family-units/bulk
Authorization: Bearer <token>
Content-Type: application/json

{
  "families": [
    {
      "student": { "phoneNumber": "+94771234567" },
      "father": { "phoneNumber": "+94772345678" }
    },
    {
      "student": { "email": "student2@example.com" }
    }
  ],
  "continueOnError": true
}
```

### 3. Complete First Login

Allows users with INCOMPLETE profile to set password and provide missing info.

```http
PATCH /admin/users/first-login/:userId
Authorization: Bearer <token>
Content-Type: application/json

{
  "password": "SecurePassword123!",
  "firstName": "Kasun",
  "lastName": "Perera",
  "dateOfBirth": "2010-05-15",
  "gender": "MALE"
}
```

**Response:**
```json
{
  "success": true,
  "message": "First login completed successfully. You can now access the system.",
  "canLogin": true
}
```

### 4. Get Incomplete Profiles

Lists users who need to complete their registration.

```http
GET /admin/users/incomplete-profiles?page=1&limit=20
Authorization: Bearer <token>
```

**Response:**
```json
{
  "data": [
    {
      "id": "123",
      "firstName": null,
      "lastName": null,
      "phoneNumber": "+94771234567",
      "profileCompletionStatus": "INCOMPLETE",
      "profileCompletionPercentage": 10,
      "createdAt": "2026-01-22T10:00:00.000Z"
    }
  ],
  "total": 50,
  "page": 1,
  "limit": 20
}
```

### 5. Resend Welcome Notification

```http
POST /admin/users/:userId/resend-welcome
Authorization: Bearer <token>
```

---

## First Login Flow

```
┌──────────────────────────────────────────────────────────────┐
│                    ADMIN CREATES USER                         │
│              (with only phone or email)                       │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│              USER RECEIVES WELCOME MESSAGE                    │
│     (Email/SMS with first-login link)                        │
│     Status: INCOMPLETE, Cannot login                         │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│              USER CLICKS FIRST-LOGIN LINK                     │
│     Opens: /first-login?userId=123                           │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│              USER SETS PASSWORD                               │
│     + Optionally fills name, DOB, etc.                       │
│     API: PATCH /admin/users/first-login/:userId              │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│              PROFILE STATUS UPDATED                           │
│     INCOMPLETE → BASIC (if has name + password)              │
│     INCOMPLETE → COMPLETE (if fully verified)                │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│              USER CAN NOW LOGIN                               │
│     Using email/phone + password                             │
└──────────────────────────────────────────────────────────────┘
```

---

## Frontend Implementation Guide

### First Login Page Component

```typescript
// pages/first-login.tsx
import { useState } from 'react';
import { useRouter } from 'next/router';

export default function FirstLoginPage() {
  const router = useRouter();
  const { userId } = router.query;
  
  const [formData, setFormData] = useState({
    password: '',
    confirmPassword: '',
    firstName: '',
    lastName: '',
    dateOfBirth: '',
    gender: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (formData.password !== formData.confirmPassword) {
      alert('Passwords do not match');
      return;
    }

    try {
      const response = await fetch(`/api/admin/users/first-login/${userId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          // Note: First login doesn't require auth
        },
        body: JSON.stringify({
          password: formData.password,
          firstName: formData.firstName || undefined,
          lastName: formData.lastName || undefined,
          dateOfBirth: formData.dateOfBirth || undefined,
          gender: formData.gender || undefined
        })
      });

      const result = await response.json();
      
      if (result.success && result.canLogin) {
        // Redirect to login page
        router.push('/login?firstLogin=true');
      }
    } catch (error) {
      console.error('First login error:', error);
    }
  };

  return (
    <div className="first-login-container">
      <h1>Complete Your Registration</h1>
      <p>Please set your password to access the system.</p>
      
      <form onSubmit={handleSubmit}>
        <div>
          <label>Password *</label>
          <input 
            type="password" 
            required 
            minLength={8}
            value={formData.password}
            onChange={(e) => setFormData({...formData, password: e.target.value})}
          />
        </div>
        
        <div>
          <label>Confirm Password *</label>
          <input 
            type="password" 
            required
            value={formData.confirmPassword}
            onChange={(e) => setFormData({...formData, confirmPassword: e.target.value})}
          />
        </div>

        <hr />
        <p>Optional: Complete your profile now</p>

        <div>
          <label>First Name</label>
          <input 
            type="text"
            value={formData.firstName}
            onChange={(e) => setFormData({...formData, firstName: e.target.value})}
          />
        </div>

        <div>
          <label>Last Name</label>
          <input 
            type="text"
            value={formData.lastName}
            onChange={(e) => setFormData({...formData, lastName: e.target.value})}
          />
        </div>

        <div>
          <label>Date of Birth</label>
          <input 
            type="date"
            value={formData.dateOfBirth}
            onChange={(e) => setFormData({...formData, dateOfBirth: e.target.value})}
          />
        </div>

        <div>
          <label>Gender</label>
          <select 
            value={formData.gender}
            onChange={(e) => setFormData({...formData, gender: e.target.value})}
          >
            <option value="">Select...</option>
            <option value="MALE">Male</option>
            <option value="FEMALE">Female</option>
            <option value="OTHER">Other</option>
          </select>
        </div>

        <button type="submit">Complete Registration</button>
      </form>
    </div>
  );
}
```

### Admin Family Creation Component

```typescript
// components/admin/CreateFamilyUnit.tsx
import { useState } from 'react';

interface FamilyMember {
  firstName?: string;
  lastName?: string;
  email?: string;
  phoneNumber?: string;
  dateOfBirth?: string;
  gender?: string;
}

export default function CreateFamilyUnit() {
  const [student, setStudent] = useState<FamilyMember>({});
  const [father, setFather] = useState<FamilyMember | null>(null);
  const [mother, setMother] = useState<FamilyMember | null>(null);
  const [instituteCode, setInstituteCode] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    // Validate student has email or phone
    if (!student.email && !student.phoneNumber) {
      alert('Student must have email or phone number');
      return;
    }

    setLoading(true);
    
    try {
      const response = await fetch('/api/admin/users/family-unit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          student,
          father: father?.email || father?.phoneNumber ? father : undefined,
          mother: mother?.email || mother?.phoneNumber ? mother : undefined,
          sendWelcomeNotifications: true,
          instituteCode: instituteCode || undefined
        })
      });

      const result = await response.json();
      
      if (result.success) {
        alert(`Family created! ${result.incompleteProfiles} users need to complete registration.`);
        // Show created user IDs and first-login URLs
        console.log(result);
      }
    } catch (error) {
      console.error('Error creating family:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="create-family-unit">
      <h2>Create Family Unit</h2>
      
      <section>
        <h3>Student Information (Required)</h3>
        <MemberForm member={student} setMember={setStudent} />
      </section>

      <section>
        <h3>
          Father Information (Optional)
          <button onClick={() => setFather(father ? null : {})}>
            {father ? 'Remove' : 'Add Father'}
          </button>
        </h3>
        {father && <MemberForm member={father} setMember={setFather} />}
      </section>

      <section>
        <h3>
          Mother Information (Optional)
          <button onClick={() => setMother(mother ? null : {})}>
            {mother ? 'Remove' : 'Add Mother'}
          </button>
        </h3>
        {mother && <MemberForm member={mother} setMember={setMother} />}
      </section>

      <section>
        <h3>Institute Enrollment (Optional)</h3>
        <input 
          placeholder="Institute Code (e.g., INST-20260122-001)"
          value={instituteCode}
          onChange={(e) => setInstituteCode(e.target.value)}
        />
      </section>

      <button onClick={handleSubmit} disabled={loading}>
        {loading ? 'Creating...' : 'Create Family Unit'}
      </button>
    </div>
  );
}

function MemberForm({ member, setMember }: { 
  member: FamilyMember; 
  setMember: (m: FamilyMember) => void;
}) {
  return (
    <div className="member-form">
      <input 
        placeholder="First Name"
        value={member.firstName || ''}
        onChange={(e) => setMember({...member, firstName: e.target.value})}
      />
      <input 
        placeholder="Last Name"
        value={member.lastName || ''}
        onChange={(e) => setMember({...member, lastName: e.target.value})}
      />
      <input 
        placeholder="Email"
        type="email"
        value={member.email || ''}
        onChange={(e) => setMember({...member, email: e.target.value})}
      />
      <input 
        placeholder="Phone (+94XXXXXXXXX)"
        value={member.phoneNumber || ''}
        onChange={(e) => setMember({...member, phoneNumber: e.target.value})}
      />
    </div>
  );
}
```

---

## Database Migration

The following columns were added to the `users` table:

```sql
ALTER TABLE users 
  ADD COLUMN is_phone_verified tinyint(1) DEFAULT 0,
  ADD COLUMN is_email_verified tinyint(1) DEFAULT 0,
  ADD COLUMN profile_completion_status enum('INCOMPLETE','BASIC','COMPLETE') DEFAULT 'COMPLETE',
  ADD COLUMN profile_completion_percentage tinyint DEFAULT 100,
  ADD COLUMN user_settings json DEFAULT NULL,
  ADD COLUMN first_login_completed tinyint(1) DEFAULT 1,
  ADD COLUMN password_set_at timestamp DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN last_login_at timestamp DEFAULT NULL,
  ADD COLUMN created_by_admin_id bigint DEFAULT NULL;

CREATE INDEX idx_users_profile_completion ON users (profile_completion_status);

ALTER TABLE users 
  ADD CONSTRAINT FK_users_created_by_admin FOREIGN KEY (created_by_admin_id) 
  REFERENCES users (id) ON DELETE SET NULL;
```

---

## Summary

✅ **Enhanced User Entity** with verification status, profile completion tracking  
✅ **Family Unit Creation API** - Create student + parents in one call  
✅ **Minimal Data Requirements** - Only email OR phone needed  
✅ **First Login Flow** - Users complete profile before accessing system  
✅ **Welcome Notifications** - Email/SMS with first-login links  
✅ **Institute Enrollment** - Auto-enroll student to institute/class  
✅ **Bulk Creation** - Create multiple families at once  
✅ **Profile Tracking** - Monitor incomplete profiles  

For questions or issues, contact the development team.
