# Account Deletion - Frontend Implementation Guide

## Google Play Compliance URL

**URL for Google Play Console → Data Safety → Account Deletion:**
```
https://app.suraksha.lk/profile?tab=delete-account
```

This URL should load a page in your frontend app that either:
- Shows the delete account UI if logged in
- Redirects to login if not authenticated

---

## API Endpoints

All endpoints require JWT authentication (`Authorization: Bearer <token>`).

Base URL: `https://lmsapi.suraksha.lk`

### 1. Request Account Deletion
```
POST /account/delete
Content-Type: application/json

{
  "confirmDeletion": true,
  "reason": "No longer using the service"  // optional
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Your account has been deactivated and is scheduled for permanent deletion on 2025-08-14. You can cancel this within 30 days by contacting support.",
  "scheduledDeletionDate": "2025-08-14T02:00:00.000Z"
}
```

**Error (409 - already requested):**
```json
{
  "statusCode": 409,
  "message": "Account deletion already requested. Your account is scheduled for permanent deletion on 2025-08-14."
}
```

### 2. Cancel Deletion
```
POST /account/cancel-deletion
```

**Response (200):**
```json
{
  "success": true,
  "message": "Account deletion has been cancelled. Your account is now active again."
}
```

### 3. Check Deletion Status
```
GET /account/deletion-status
```

**Response (200 - has pending deletion):**
```json
{
  "hasPendingDeletion": true,
  "status": "PENDING",
  "scheduledDeletionDate": "2025-08-14T02:00:00.000Z",
  "requestedAt": "2025-07-15T10:30:00.000Z",
  "reason": "No longer using the service"
}
```

**Response (200 - no pending deletion):**
```json
{
  "hasPendingDeletion": false
}
```

---

## Frontend Implementation

### Profile Settings Page

Add a "Delete Account" section at the bottom of the profile/settings page:

```tsx
// React/React Native example

const [showConfirmModal, setShowConfirmModal] = useState(false);
const [reason, setReason] = useState('');
const [deletionStatus, setDeletionStatus] = useState(null);
const [loading, setLoading] = useState(false);

// Check deletion status on mount
useEffect(() => {
  fetchDeletionStatus();
}, []);

const fetchDeletionStatus = async () => {
  const res = await api.get('/account/deletion-status');
  setDeletionStatus(res.data);
};

const handleDeleteAccount = async () => {
  setLoading(true);
  try {
    const res = await api.post('/account/delete', {
      confirmDeletion: true,
      reason: reason || undefined,
    });
    // Show success message
    Alert.alert('Account Deactivated', res.data.message);
    // Log the user out
    await logout();
  } catch (error) {
    Alert.alert('Error', error.response?.data?.message || 'Failed to process request');
  } finally {
    setLoading(false);
  }
};

const handleCancelDeletion = async () => {
  try {
    const res = await api.post('/account/cancel-deletion');
    Alert.alert('Cancelled', res.data.message);
    fetchDeletionStatus();
  } catch (error) {
    Alert.alert('Error', error.response?.data?.message || 'Failed to cancel');
  }
};
```

### UI Components

#### If NO pending deletion:
```
┌─────────────────────────────────────┐
│  ⚠️ Delete Account                  │
│                                     │
│  Permanently delete your account    │
│  and all associated data.           │
│                                     │
│  [Delete My Account]  (red button)  │
└─────────────────────────────────────┘
```

#### Confirmation Modal (after clicking Delete button):
```
┌─────────────────────────────────────┐
│  ⚠️ Are you sure?                   │
│                                     │
│  Your account will be deactivated   │
│  immediately. After 30 days, all    │
│  your data will be permanently      │
│  deleted and cannot be recovered.   │
│                                     │
│  Reason (optional):                 │
│  ┌─────────────────────────────┐    │
│  │                             │    │
│  └─────────────────────────────┘    │
│                                     │
│  [Cancel]     [Delete Account]      │
└─────────────────────────────────────┘
```

#### If PENDING deletion:
```
┌─────────────────────────────────────┐
│  🕐 Account Scheduled for Deletion  │
│                                     │
│  Your account will be permanently   │
│  deleted on: August 14, 2025        │
│                                     │
│  Changed your mind?                 │
│  [Cancel Deletion]  (blue button)   │
└─────────────────────────────────────┘
```

---

## What Happens

| Step | Action | Timing |
|------|--------|--------|
| 1 | User clicks "Delete Account" | Immediate |
| 2 | Account deactivated (`isActive = false`) | Immediate |
| 3 | User logged out from app | Immediate |
| 4 | User cannot log in during grace period | 30 days |
| 5 | Cron job permanently deletes user data | After 30 days (runs daily at 2 AM) |

---

## Data Deleted

When the 30-day grace period expires, the following is permanently removed:
- User profile and credentials
- All associated records linked to the user ID

The `account_deletion_requests` record remains with status `COMPLETED` for audit purposes.

---

## Migration

Run the migration to create the `account_deletion_requests` table:

```bash
npx typeorm migration:run -d src/config/typeorm.config.ts
```

Or manually execute:
```sql
CREATE TABLE `account_deletion_requests` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT NOT NULL,
  `reason` VARCHAR(500) NULL,
  `status` ENUM('PENDING', 'CANCELLED', 'COMPLETED') NOT NULL DEFAULT 'PENDING',
  `scheduled_deletion_date` TIMESTAMP NOT NULL,
  `requester_ip` VARCHAR(45) NULL,
  `cancelled_by` BIGINT NULL,
  `completed_at` TIMESTAMP NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uq_deletion_user_id` (`user_id`),
  INDEX `idx_deletion_status_scheduled` (`status`, `scheduled_deletion_date`),
  INDEX `idx_deletion_user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```
