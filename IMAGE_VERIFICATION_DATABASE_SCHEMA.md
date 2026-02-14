# 📝 Image Verification System - Database Schema Update

## 🎯 Overview

This document describes the database schema changes made to support the **User Profile Image Verification System**. New columns have been added to the `users` table to track image verification status, approval/rejection metadata, and admin actions.

---

## 📊 Schema Changes

### **Table: `users`**

#### **New Columns Added**

| Column Name | Type | Nullable | Default | Description |
|------------|------|----------|---------|-------------|
| `image_verification_status` | ENUM('PENDING', 'VERIFIED', 'REJECTED') | YES | NULL | Current verification status of the profile image |
| `image_verified_by` | BIGINT | YES | NULL | User ID of the admin who verified/rejected the image |
| `image_verified_at` | TIMESTAMP | YES | NULL | Timestamp when the image was verified or rejected |
| `image_rejection_reason` | TEXT | YES | NULL | Detailed reason provided when image was rejected |

#### **Existing Columns (Reference)**

| Column Name | Type | Description |
|------------|------|-------------|
| `image_url` | VARCHAR(255) | Relative path to user's profile image in cloud storage |
| `updated_at` | TIMESTAMP | Last update timestamp (used for image upload tracking) |

---

## 🔄 Image Verification Status Flow

```
┌─────────────────────────────────────────────────────────┐
│                   USER UPLOADS IMAGE                     │
│              imageVerificationStatus = PENDING           │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
           ┌──────────────────────┐
           │  SYSTEM ADMIN REVIEW │
           └──────────┬───────────┘
                      │
        ┌─────────────┼─────────────┐
        │                           │
        ▼                           ▼
  ┌──────────┐              ┌──────────┐
  │ APPROVE  │              │  REJECT  │
  └──────────┘              └──────────┘
        │                           │
        │                           ├─ Delete from cloud storage
        │                           ├─ Set status = REJECTED
        │                           ├─ Store rejection_reason
        │                           ├─ Send email with re-upload link
        │                           └─ Clear image_url
        │
        ├─ Set status = VERIFIED
        ├─ Store verified_by (admin ID)
        ├─ Store verified_at (timestamp)
        └─ Send approval email
```

---

## 🔍 Status Values Explained

### **PENDING**
- **When Set**: Automatically when user uploads or re-uploads an image
- **Meaning**: Image awaits System Admin review
- **User Visibility**: Image visible to user but may show "Under Review" badge
- **Admin View**: Appears in `/admin/users/unverified` endpoint

### **VERIFIED**
- **When Set**: System Admin approves the image
- **Meaning**: Image meets guidelines and is approved
- **User Visibility**: Image fully visible without restrictions
- **Email Sent**: Approval confirmation email

### **REJECTED**
- **When Set**: System Admin rejects the image
- **Meaning**: Image doesn't meet guidelines
- **Actions Taken**:
  - Image deleted from cloud storage
  - `image_url` field cleared
  - Rejection reason stored
  - Email sent with 7-day re-upload link
- **User Visibility**: No image shown, prompted to re-upload

---

## 📋 Migration Details

### **Migration File**
```
src/migrations/1739400000000-AddImageVerificationToUsers.ts
```

### **How to Run Migration**

#### **Development/Staging**
```bash
# Run migration
npm run typeorm migration:run

# Verify migration
npm run typeorm migration:show
```

#### **Production**
```bash
# Manual SQL execution recommended for production
# See migration file for exact SQL commands
```

### **Migration SQL (Reference)**

```sql
-- Add image_verification_status column
ALTER TABLE `users`
ADD COLUMN `image_verification_status` ENUM('PENDING', 'VERIFIED', 'REJECTED') NULL
COMMENT 'Profile image verification status: PENDING/VERIFIED/REJECTED';

-- Add image_verified_by column
ALTER TABLE `users`
ADD COLUMN `image_verified_by` BIGINT NULL
COMMENT 'Admin user ID who verified/rejected the image';

-- Add image_verified_at column
ALTER TABLE `users`
ADD COLUMN `image_verified_at` TIMESTAMP NULL
COMMENT 'Timestamp when image was verified/rejected';

-- Add image_rejection_reason column
ALTER TABLE `users`
ADD COLUMN `image_rejection_reason` TEXT NULL
COMMENT 'Reason provided when image was rejected';

-- Set existing users with images to PENDING status
UPDATE `users`
SET `image_verification_status` = 'PENDING'
WHERE `image_url` IS NOT NULL 
  AND `image_verification_status` IS NULL;
```

---

## 🔄 Rollback Plan

If you need to rollback the migration:

```bash
# Rollback last migration
npm run typeorm migration:revert
```

**Rollback SQL:**
```sql
-- Remove columns in reverse order
ALTER TABLE `users` DROP COLUMN `image_rejection_reason`;
ALTER TABLE `users` DROP COLUMN `image_verified_at`;
ALTER TABLE `users` DROP COLUMN `image_verified_by`;
ALTER TABLE `users` DROP COLUMN `image_verification_status`;
```

⚠️ **Warning**: Rolling back will permanently delete all verification history data.

---

## 📊 Sample Data Queries

### **Check Verification Status Distribution**
```sql
SELECT 
  image_verification_status,
  COUNT(*) as count
FROM users
WHERE image_url IS NOT NULL
GROUP BY image_verification_status;
```

### **Find Recent Pending Images**
```sql
SELECT 
  id,
  name_with_initials,
  email,
  image_url,
  updated_at as uploaded_at
FROM users
WHERE image_verification_status = 'PENDING'
ORDER BY updated_at DESC
LIMIT 20;
```

### **Admin Verification Activity**
```sql
SELECT 
  u.id as user_id,
  u.name_with_initials,
  u.image_verification_status,
  u.image_verified_at,
  admin.name_with_initials as verified_by_admin
FROM users u
LEFT JOIN users admin ON u.image_verified_by = admin.id
WHERE u.image_verified_by IS NOT NULL
ORDER BY u.image_verified_at DESC
LIMIT 50;
```

### **Rejected Images with Reasons**
```sql
SELECT 
  id,
  name_with_initials,
  email,
  image_rejection_reason,
  image_verified_at as rejected_at
FROM users
WHERE image_verification_status = 'REJECTED'
ORDER BY image_verified_at DESC;
```

---

## 🔐 Security & Privacy Notes

### **Data Retention**
- Rejected images are **physically deleted** from cloud storage
- Rejection reasons are **retained** for audit purposes
- Verification timestamps are **permanently stored**
- Admin IDs who performed verifications are **logged**

### **Personal Data**
- Rejection reasons may contain feedback to users
- Admin IDs are internal references only
- Email/phone masking applies when displayed to admins

### **Audit Trail**
Every verification action is traceable:
- **Who**: `image_verified_by` (admin user ID)
- **When**: `image_verified_at` (timestamp)
- **What**: `image_verification_status` (action taken)
- **Why**: `image_rejection_reason` (if rejected)

---

## 📈 Performance Considerations

### **Indexes**
Consider adding indexes for common queries:

```sql
-- Index for pending images query
CREATE INDEX idx_users_image_verification 
ON users(image_verification_status, updated_at);

-- Index for admin verification lookup
CREATE INDEX idx_users_verified_by 
ON users(image_verified_by, image_verified_at);
```

### **Query Optimization**
- The `/admin/users/unverified` endpoint uses filtered queries
- Pagination is applied to limit result sets
- Email/phone masking happens in application layer

---

## 🧪 Testing Checklist

After running the migration:

- [ ] Verify all 4 columns exist in `users` table
- [ ] Check existing users with images have `PENDING` status
- [ ] Test image upload sets status to `PENDING`
- [ ] Test admin approval updates status and timestamps
- [ ] Test admin rejection clears image and stores reason
- [ ] Verify admin ID is correctly stored in `image_verified_by`
- [ ] Check email notifications are sent after verification
- [ ] Test re-upload after rejection resets to `PENDING`

---

## 🆘 Troubleshooting

### **Migration Fails**

**Error**: "Column already exists"
```bash
# Check if columns were manually added
DESCRIBE users;

# If columns exist but migration didn't run, mark as executed
npm run typeorm migration:fake
```

**Error**: "ENUM type mismatch"
```sql
-- Check existing enum definition
SHOW COLUMNS FROM users LIKE 'image_verification_status';

-- Fix enum if needed
ALTER TABLE users 
MODIFY COLUMN image_verification_status 
ENUM('PENDING', 'VERIFIED', 'REJECTED') NULL;
```

### **Existing Images Not Set to PENDING**

```sql
-- Manually set existing images to PENDING
UPDATE users
SET image_verification_status = 'PENDING'
WHERE image_url IS NOT NULL 
  AND (image_verification_status IS NULL OR image_verification_status = '');
```

---

## 📚 Related Documentation

- **Entity Definition**: [user.entity.ts](../src/modules/user/entities/user.entity.ts)
- **Service Implementation**: [system-admin-user.service.ts](../src/modules/user/services/system-admin-user.service.ts)
- **Enum Definition**: [image-verification-status.enum.ts](../src/modules/institute_mudules/institue_user/enums/image-verification-status.enum.ts)
- **Frontend Guide**: [IMAGE_VERIFICATION_FRONTEND_GUIDE.md](./IMAGE_VERIFICATION_FRONTEND_GUIDE.md)

---

**Migration Created**: February 14, 2026  
**Migration Version**: 1739400000000  
**Author**: System Development Team
