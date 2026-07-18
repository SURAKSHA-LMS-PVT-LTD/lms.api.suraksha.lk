# Backend API Technical Documentation (`lms-api-suraksha-lk`)

This directory contains the comprehensive technical documentation, API specifications, module architectures, and developer guides for the **Suraksha LMS Backend NestJS API**.

---

## 📁 Technical Documentation Index

### 🔐 1. Authentication & Security (`docs/auth/`)
* **Auth Complete Implementation Guide**: Multi-identifier login, JWT token rotation, and password reset flows.
* **Mobile Authentication Guide**: Native app API tokens, biometric authentication integration, and persistent sessions.
* **First Login & SSO**: First login force password change and Google SSO integration.

### 📊 2. Attendance & Calendar (`docs/attendance/`)
* **Attendance System Complete Guide**: QR code, RFID smart-cards, manual attendance, and bulk attendance marking APIs.
* **Calendar & Operating Config**: Institute operational calendars, holidays, and lecture schedule attendance tracking.
* **Attendance Reporting & Analytics**: Daily/monthly attendance counts, student attendance summaries, and matrix views.

### 📝 3. Homework & Assignments (`docs/homework/`)
* **Homework System Complete Guide**: Homework creation, submission tracking, grading, and teacher feedback.
* **Reference & Attachments**: Upload flows, Google Drive attachment links, and submission storage.

### 🔔 4. Notifications (`docs/notifications/`)
* **Firebase Push Notifications Guide**: FCM push token registration, topic broadcast, and payload formatting.
* **Notification Credit System**: SMS credit tracking, cost calculation, and dispatch logs.

### 🖼️ 5. User & Institute Media (`docs/profile-images/`)
* **Profile Image Management**: Single-tenant/global image uploads, verification statuses, and Cloud Storage integration.
* **Image Verification Workflows**: Admin verification, pending status approvals, and ID card generation triggers.

### 👤 6. User Management & RBAC (`docs/user-management/`)
* **Enhanced User Management**: User registration, role assignments, house memberships, and profile editing.
* **Smart Cards & RFID**: Student smart-card allocation, barcode generation, and card management.

### ⏰ 7. Timezone & Timestamp Handling (`docs/timezones/`)
* **Sri Lanka Timezone Verification**: ISO timestamp formatting (`Asia/Colombo` / UTC offset), database entity timestamp decorators, and null date fixes.

### ☁️ 8. Cloud Integrations (`docs/drive/`)
* **Google Drive Integration**: OAuth2 authorization, persistent access token refresh, folder structures, and file upload streams.

### 🏫 9. Institute Management (`docs/institutes/`)
* **Institute Creation & Settings**: Multi-tenant onboarding, custom branding, subdomains, and public registration links.

### 📚 10. Lectures & Academics (`docs/lectures-academics/`)
* **Class & Subject Lectures**: Live lecture streaming URLs, watch session tracking, recordings, and subject enrollment.

### 💳 11. Payments & Billing (`docs/payments/`)
* **Payment Management**: Bank transfer receipts, online payments, subscription tiers, and payment verifications.

### 📢 12. Advertisements (`docs/advertisements/`)
* **Advertisement Delivery System**: In-app banners, login popups, and delivery mode targeted ads.

### 🛠️ 13. General Specifications (`docs/general/`)
* **System Config & Architecture**: Microservice communication, API error handling standards, and database models.
