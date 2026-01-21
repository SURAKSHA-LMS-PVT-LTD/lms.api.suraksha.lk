# 💰 Payment Management System - Comprehensive Enhancement Proposal

## 📋 Executive Summary

This document outlines a comprehensive enhancement plan for the LMS Payment Management System to provide institute-wide and class-wise payment flexibility with advanced scheduling, access control, and monetization features.

---

## 🎯 Current System Analysis

### ✅ Existing Features (What We Have)

1. **Institute-Class-Subject Payment System**
   - Payment requests by teachers/admins
   - Student/parent payment submissions
   - Payment verification workflow
   - Receipt upload functionality
   - Payment status tracking (ACTIVE, INACTIVE, EXPIRED)
   - Payment priorities (MANDATORY, OPTIONAL, DONATION)
   - Target types (PARENTS, STUDENTS)

2. **Access Control**
   - Role-based permissions (Institute Admin, Teacher, Student, Parent)
   - Subject-level access control
   - JWT-based authentication

3. **Current Limitations**
   - ❌ No class-level access control based on payment
   - ❌ No scheduled content unlocking
   - ❌ No grace periods or payment plans
   - ❌ No automatic enrollment/access management
   - ❌ Limited payment type options
   - ❌ No subscription-based access
   - ❌ No trial periods
   - ❌ No bulk discount management

---

## 🚀 Proposed Enhancements

### 1. 💳 Advanced Payment Types & Modes

#### 1.1 Payment Type Expansion

```typescript
export enum PaymentMode {
  FREE = 'FREE',                    // Completely free access
  ONE_TIME = 'ONE_TIME',            // Single payment for lifetime access
  SUBSCRIPTION = 'SUBSCRIPTION',     // Recurring payments
  PAY_PER_CLASS = 'PAY_PER_CLASS',  // Per-session payment
  DONATION_BASED = 'DONATION_BASED', // Pay what you want
  TIERED = 'TIERED'                 // Multiple payment tiers
}

export enum PaymentRequirement {
  REQUIRED = 'REQUIRED',            // Payment mandatory for access
  OPTIONAL = 'OPTIONAL',            // Payment optional but encouraged
  FREE = 'FREE',                    // No payment required
  FREEMIUM = 'FREEMIUM'             // Basic free, premium paid
}

export enum SubscriptionPeriod {
  DAILY = 'DAILY',
  WEEKLY = 'WEEKLY',
  MONTHLY = 'MONTHLY',
  QUARTERLY = 'QUARTERLY',
  SEMESTER = 'SEMESTER',
  YEARLY = 'YEARLY',
  CUSTOM = 'CUSTOM'
}
```

**Use Cases:**
- **FREE**: Trial classes, promotional content, community classes
- **ONE_TIME**: Course enrollment fees, registration fees
- **SUBSCRIPTION**: Monthly class fees, yearly subscriptions
- **PAY_PER_CLASS**: Individual lecture access, special workshops
- **DONATION_BASED**: Community support, optional contributions
- **TIERED**: Basic/Premium/Pro class access levels

---

### 2. 🔐 Access Control Based on Payment Status

#### 2.1 Enhanced Access Rules

```typescript
export interface PaymentAccessRule {
  // Basic Settings
  paymentRequired: boolean;
  paymentMode: PaymentMode;
  
  // Access Control
  allowAccessBeforePayment: boolean;
  gracePeriodDays: number;
  trialPeriodDays: number;
  
  // Scheduling
  contentUnlockDate: Date | null;
  accessStartDate: Date;
  accessEndDate: Date | null;
  
  // Auto-enrollment
  autoEnrollOnPayment: boolean;
  autoUnenrollOnExpiry: boolean;
  
  // Restrictions
  maxStudentsAllowed: number | null;
  restrictNewEnrollments: boolean;
  allowPartialAccess: boolean; // Access to some features without payment
}
```

#### 2.2 Payment-Based Class Visibility

**Scenarios:**

1. **Pre-Payment Restriction**
   - Class not visible until payment confirmed
   - Show "locked" indicator on class list
   - Redirect to payment page on access attempt

2. **Grace Period Access**
   - Allow X days of access after enrollment
   - Display payment reminder notices
   - Restrict access after grace period expires

3. **Trial Period**
   - First N days free access
   - Automatic conversion to paid after trial
   - Option to cancel before trial ends

4. **Scheduled Unlock**
   - Content becomes available on specific date
   - Payment accepted in advance
   - Early bird discounts for pre-payment

---

### 3. 📅 Scheduling & Automation

#### 3.1 Content Scheduling

```typescript
export interface ContentSchedule {
  // Pre-launch Settings
  announcementDate: Date;           // When class is announced
  enrollmentStartDate: Date;        // When enrollment opens
  enrollmentEndDate: Date;          // When enrollment closes
  
  // Access Schedule
  classStartDate: Date;             // When class content becomes available
  classEndDate: Date | null;        // When access expires
  
  // Payment Schedule
  earlyBirdDeadline: Date | null;   // Discount deadline
  paymentDeadline: Date;            // Last payment date
  latePaymentDeadline: Date | null; // Extended deadline with penalty
  
  // Automation
  autoArchiveAfterEnd: boolean;
  autoRefundIfCancelled: boolean;
  notifyBeforeExpiry: boolean;
  notifyDaysBeforeExpiry: number;
}
```

#### 3.2 Automated Actions

```typescript
export interface AutomatedAction {
  actionType: ActionType;
  triggerCondition: TriggerCondition;
  triggerDate: Date | null;
  daysOffset: number | null;
  enabled: boolean;
}

export enum ActionType {
  SEND_PAYMENT_REMINDER = 'SEND_PAYMENT_REMINDER',
  RESTRICT_ACCESS = 'RESTRICT_ACCESS',
  GRANT_ACCESS = 'GRANT_ACCESS',
  SEND_EXPIRY_WARNING = 'SEND_EXPIRY_WARNING',
  AUTO_UNENROLL = 'AUTO_UNENROLL',
  SEND_RENEWAL_REMINDER = 'SEND_RENEWAL_REMINDER',
  ARCHIVE_CLASS = 'ARCHIVE_CLASS',
  GENERATE_REPORT = 'GENERATE_REPORT'
}

export enum TriggerCondition {
  ON_ENROLLMENT = 'ON_ENROLLMENT',
  BEFORE_START_DATE = 'BEFORE_START_DATE',
  AFTER_START_DATE = 'AFTER_START_DATE',
  PAYMENT_RECEIVED = 'PAYMENT_RECEIVED',
  PAYMENT_OVERDUE = 'PAYMENT_OVERDUE',
  BEFORE_EXPIRY = 'BEFORE_EXPIRY',
  ON_EXPIRY = 'ON_EXPIRY',
  AFTER_EXPIRY = 'AFTER_EXPIRY'
}
```

---

### 4. 💰 Advanced Pricing Models

#### 4.1 Tiered Pricing

```typescript
export interface PricingTier {
  id: string;
  tierName: string;                 // e.g., "Basic", "Premium", "VIP"
  price: number;
  currency: string;
  
  // Features
  features: string[];               // List of included features
  maxLectures: number | null;       // Limit lecture access
  allowDownloads: boolean;
  allowOfflineAccess: boolean;
  prioritySupport: boolean;
  certificateIncluded: boolean;
  
  // Limits
  maxAttendance: number | null;     // Max classes can attend
  resourceAccessLevel: ResourceAccessLevel;
  
  // Visibility
  isPublic: boolean;
  displayOrder: number;
  recommended: boolean;             // Mark as "Most Popular"
}

export enum ResourceAccessLevel {
  NONE = 'NONE',
  BASIC = 'BASIC',                  // PDFs only
  STANDARD = 'STANDARD',             // PDFs + Videos
  PREMIUM = 'PREMIUM',               // All resources + extras
  UNLIMITED = 'UNLIMITED'            // Everything
}
```

#### 4.2 Discounts & Promotions

```typescript
export interface DiscountRule {
  id: string;
  code: string;                     // Promo code
  discountType: DiscountType;
  discountValue: number;
  
  // Conditions
  minStudents: number | null;       // Bulk discount
  earlyBirdDeadline: Date | null;
  applicableFor: DiscountApplicability[];
  
  // Limits
  maxUsagePerUser: number;
  maxTotalUsage: number | null;
  currentUsageCount: number;
  
  // Validity
  validFrom: Date;
  validUntil: Date;
  isActive: boolean;
  
  // Restrictions
  applicableClasses: string[];      // Class IDs
  applicableInstitutes: string[];   // Institute IDs
  newUsersOnly: boolean;
  firstTimePaymentOnly: boolean;
}

export enum DiscountType {
  PERCENTAGE = 'PERCENTAGE',        // 20% off
  FIXED_AMOUNT = 'FIXED_AMOUNT',    // $50 off
  BUY_X_GET_Y = 'BUY_X_GET_Y',     // Buy 3 get 1 free
  BUNDLE = 'BUNDLE',                // Package deals
  REFERRAL = 'REFERRAL',            // Refer a friend
  SCHOLARSHIP = 'SCHOLARSHIP'        // Merit/need-based
}

export enum DiscountApplicability {
  NEW_ENROLLMENTS = 'NEW_ENROLLMENTS',
  RENEWALS = 'RENEWALS',
  ALL = 'ALL'
}
```

#### 4.3 Payment Plans & Installments

```typescript
export interface PaymentPlan {
  id: string;
  planName: string;
  totalAmount: number;
  
  // Installments
  numberOfInstallments: number;
  installmentAmount: number;
  installmentFrequency: SubscriptionPeriod;
  
  // Schedule
  firstPaymentDate: Date;
  installmentSchedule: InstallmentSchedule[];
  
  // Settings
  autoChargeEnabled: boolean;
  penaltyForLatePayment: number;
  gracePeriodDays: number;
  allowEarlyCompletion: boolean;
  earlyCompletionDiscount: number;
  
  // Status
  isActive: boolean;
}

export interface InstallmentSchedule {
  installmentNumber: number;
  dueDate: Date;
  amount: number;
  status: InstallmentStatus;
  paidDate: Date | null;
  paidAmount: number | null;
}

export enum InstallmentStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  OVERDUE = 'OVERDUE',
  WAIVED = 'WAIVED',
  CANCELLED = 'CANCELLED'
}
```

---

### 5. 🎓 Institute & Class Level Configuration

#### 5.1 Hierarchical Payment Settings

```typescript
export interface InstitutePaymentSettings {
  instituteId: string;
  
  // Global Settings
  defaultPaymentMode: PaymentMode;
  defaultCurrency: string;
  taxRate: number;
  
  // Payment Methods
  acceptedPaymentMethods: PaymentMethod[];
  bankAccountDetails: BankDetails | null;
  onlinePaymentEnabled: boolean;
  paymentGatewayConfig: PaymentGatewayConfig | null;
  
  // Policies
  refundPolicy: RefundPolicy;
  cancellationPolicy: CancellationPolicy;
  latePaymentPenaltyPercent: number;
  
  // Features
  allowDiscountCodes: boolean;
  allowPaymentPlans: boolean;
  allowScholarships: boolean;
  allowPartialPayments: boolean;
  
  // Overrides
  allowClassLevelOverride: boolean;
  allowSubjectLevelOverride: boolean;
}

export interface ClassPaymentSettings {
  classId: string;
  instituteId: string;
  
  // Override parent settings
  overrideInstituteSetting: boolean;
  paymentMode: PaymentMode | null;
  
  // Class-specific
  basePrice: number;
  minimumStudents: number;        // Minimum for class to run
  maximumStudents: number | null; // Class capacity
  
  // Access Control
  allowFreeAudit: boolean;        // Sit in without payment
  freeAuditLimits: AuditLimits | null;
  
  // Scheduling
  enrollmentSchedule: ContentSchedule;
  accessRules: PaymentAccessRule;
  
  // Status
  isPublished: boolean;
  acceptingEnrollments: boolean;
}

export interface SubjectPaymentSettings {
  subjectId: string;
  classId: string;
  instituteId: string;
  
  // Override class settings
  overrideClassSetting: boolean;
  paymentMode: PaymentMode | null;
  subjectPrice: number | null;
  
  // Subject-specific
  isStandalone: boolean;          // Can be purchased separately
  isBundleOnly: boolean;          // Only with class purchase
  bundleDiscount: number | null;
  
  // Access
  accessRules: PaymentAccessRule;
  allowGuestPreview: boolean;     // Preview lectures without payment
  previewLectureCount: number;
}
```

#### 5.2 Payment Method Configuration

```typescript
export enum PaymentMethod {
  CASH = 'CASH',
  BANK_TRANSFER = 'BANK_TRANSFER',
  ONLINE_CARD = 'ONLINE_CARD',
  DIGITAL_WALLET = 'DIGITAL_WALLET',
  INSTALLMENT_PLAN = 'INSTALLMENT_PLAN',
  SCHOLARSHIP = 'SCHOLARSHIP',
  WAIVER = 'WAIVER'
}

export interface BankDetails {
  bankName: string;
  accountName: string;
  accountNumber: string;
  branchCode: string;
  swiftCode: string;
  notes: string;
}

export interface PaymentGatewayConfig {
  provider: string;               // e.g., "Stripe", "PayPal", "Local Gateway"
  apiKey: string;
  webhookSecret: string;
  currency: string;
  enabled: boolean;
}
```

---

### 6. 📊 Student Payment Tracking

#### 6.1 Student Payment Status

```typescript
export interface StudentPaymentStatus {
  studentId: string;
  instituteId: string;
  classId: string;
  subjectId: string | null;
  
  // Payment Info
  paymentMode: PaymentMode;
  totalAmountDue: number;
  amountPaid: number;
  amountPending: number;
  
  // Status
  paymentStatus: StudentPaymentStatus;
  accessStatus: StudentAccessStatus;
  
  // Dates
  enrollmentDate: Date;
  firstPaymentDate: Date | null;
  lastPaymentDate: Date | null;
  nextPaymentDue: Date | null;
  accessExpiryDate: Date | null;
  
  // Grace & Trial
  inTrialPeriod: boolean;
  trialExpiryDate: Date | null;
  inGracePeriod: boolean;
  gracePeriodExpiryDate: Date | null;
  
  // Restrictions
  hasAccess: boolean;
  accessRestrictions: AccessRestriction[];
  canAttendLectures: boolean;
  canAccessResources: boolean;
  canSubmitAssignments: boolean;
}

export enum StudentPaymentStatus {
  NOT_PAID = 'NOT_PAID',
  PARTIALLY_PAID = 'PARTIALLY_PAID',
  FULLY_PAID = 'FULLY_PAID',
  OVERDUE = 'OVERDUE',
  REFUNDED = 'REFUNDED',
  WAIVED = 'WAIVED',
  SCHOLARSHIP = 'SCHOLARSHIP'
}

export enum StudentAccessStatus {
  FULL_ACCESS = 'FULL_ACCESS',
  TRIAL_ACCESS = 'TRIAL_ACCESS',
  GRACE_PERIOD_ACCESS = 'GRACE_PERIOD_ACCESS',
  LIMITED_ACCESS = 'LIMITED_ACCESS',
  NO_ACCESS = 'NO_ACCESS',
  SUSPENDED = 'SUSPENDED',
  EXPIRED = 'EXPIRED'
}

export interface AccessRestriction {
  restrictionType: RestrictionType;
  reason: string;
  appliedDate: Date;
  canBeLifted: boolean;
  liftCondition: string;
}

export enum RestrictionType {
  PAYMENT_PENDING = 'PAYMENT_PENDING',
  PAYMENT_OVERDUE = 'PAYMENT_OVERDUE',
  SUBSCRIPTION_EXPIRED = 'SUBSCRIPTION_EXPIRED',
  MANUALLY_SUSPENDED = 'MANUALLY_SUSPENDED',
  MAXIMUM_CAPACITY_REACHED = 'MAXIMUM_CAPACITY_REACHED',
  SCHEDULED_START_NOT_REACHED = 'SCHEDULED_START_NOT_REACHED'
}
```

---

### 7. 🔔 Notifications & Reminders

#### 7.1 Automated Notifications

```typescript
export interface PaymentNotificationRule {
  id: string;
  notificationType: NotificationType;
  
  // Trigger
  triggerCondition: TriggerCondition;
  daysBeforeAfter: number;
  
  // Targets
  notifyStudent: boolean;
  notifyParent: boolean;
  notifyTeacher: boolean;
  notifyAdmin: boolean;
  
  // Channels
  sendEmail: boolean;
  sendSMS: boolean;
  sendPushNotification: boolean;
  sendInAppNotification: boolean;
  
  // Content
  messageTemplate: string;
  customMessage: string | null;
  
  // Status
  isActive: boolean;
  lastSent: Date | null;
}

export enum NotificationType {
  PAYMENT_REMINDER = 'PAYMENT_REMINDER',
  PAYMENT_RECEIVED = 'PAYMENT_RECEIVED',
  PAYMENT_OVERDUE = 'PAYMENT_OVERDUE',
  TRIAL_EXPIRING = 'TRIAL_EXPIRING',
  ACCESS_EXPIRING = 'ACCESS_EXPIRING',
  ACCESS_GRANTED = 'ACCESS_GRANTED',
  ACCESS_REVOKED = 'ACCESS_REVOKED',
  DISCOUNT_AVAILABLE = 'DISCOUNT_AVAILABLE',
  EARLY_BIRD_REMINDER = 'EARLY_BIRD_REMINDER',
  INSTALLMENT_DUE = 'INSTALLMENT_DUE',
  REFUND_PROCESSED = 'REFUND_PROCESSED'
}
```

---

### 8. 📈 Reporting & Analytics

#### 8.1 Financial Reports

```typescript
export interface PaymentReport {
  // Summary
  reportPeriod: DateRange;
  instituteId: string | null;
  classId: string | null;
  
  // Metrics
  totalRevenue: number;
  totalPendingPayments: number;
  totalOverduePayments: number;
  totalRefunds: number;
  netRevenue: number;
  
  // Breakdowns
  revenueByClass: ClassRevenue[];
  revenueBySubject: SubjectRevenue[];
  revenueByPaymentMode: PaymentModeRevenue[];
  revenueByMonth: MonthlyRevenue[];
  
  // Student Metrics
  totalEnrolledStudents: number;
  paidStudents: number;
  unpaidStudents: number;
  scholarshipStudents: number;
  averagePaymentPerStudent: number;
  
  // Collection Efficiency
  collectionRate: number;           // Percentage collected on time
  overdueRate: number;
  averageDaysToPayment: number;
}

export interface ClassRevenue {
  classId: string;
  className: string;
  totalStudents: number;
  paidStudents: number;
  totalRevenue: number;
  pendingAmount: number;
}
```

---

### 9. 🏗️ Database Schema Enhancements

#### 9.1 New Tables Required

```sql
-- Enhanced payment settings at class level
CREATE TABLE class_payment_configurations (
    id BIGSERIAL PRIMARY KEY,
    institute_id BIGINT NOT NULL,
    class_id BIGINT NOT NULL,
    
    -- Payment Mode
    payment_mode VARCHAR(50) NOT NULL DEFAULT 'ONE_TIME',
    payment_requirement VARCHAR(50) NOT NULL DEFAULT 'REQUIRED',
    
    -- Pricing
    base_price DECIMAL(10, 2) NOT NULL DEFAULT 0,
    currency VARCHAR(10) NOT NULL DEFAULT 'LKR',
    
    -- Access Control
    allow_access_before_payment BOOLEAN DEFAULT FALSE,
    grace_period_days INT DEFAULT 0,
    trial_period_days INT DEFAULT 0,
    
    -- Scheduling
    content_unlock_date TIMESTAMP,
    access_start_date TIMESTAMP,
    access_end_date TIMESTAMP,
    enrollment_start_date TIMESTAMP,
    enrollment_end_date TIMESTAMP,
    
    -- Automation
    auto_enroll_on_payment BOOLEAN DEFAULT TRUE,
    auto_unenroll_on_expiry BOOLEAN DEFAULT FALSE,
    
    -- Capacity
    max_students_allowed INT,
    restrict_new_enrollments BOOLEAN DEFAULT FALSE,
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(institute_id, class_id)
);

-- Subject-level payment configuration
CREATE TABLE subject_payment_configurations (
    id BIGSERIAL PRIMARY KEY,
    institute_id BIGINT NOT NULL,
    class_id BIGINT NOT NULL,
    subject_id BIGINT NOT NULL,
    
    -- Override settings
    override_class_setting BOOLEAN DEFAULT FALSE,
    payment_mode VARCHAR(50),
    subject_price DECIMAL(10, 2),
    
    -- Standalone options
    is_standalone BOOLEAN DEFAULT FALSE,
    is_bundle_only BOOLEAN DEFAULT FALSE,
    bundle_discount DECIMAL(5, 2),
    
    -- Preview
    allow_guest_preview BOOLEAN DEFAULT FALSE,
    preview_lecture_count INT DEFAULT 0,
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(institute_id, class_id, subject_id)
);

-- Pricing tiers
CREATE TABLE pricing_tiers (
    id BIGSERIAL PRIMARY KEY,
    institute_id BIGINT NOT NULL,
    class_id BIGINT,
    subject_id BIGINT,
    
    tier_name VARCHAR(100) NOT NULL,
    tier_description TEXT,
    price DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(10) DEFAULT 'LKR',
    
    -- Features
    features JSONB,
    max_lectures INT,
    allow_downloads BOOLEAN DEFAULT FALSE,
    allow_offline_access BOOLEAN DEFAULT FALSE,
    priority_support BOOLEAN DEFAULT FALSE,
    certificate_included BOOLEAN DEFAULT FALSE,
    resource_access_level VARCHAR(50) DEFAULT 'BASIC',
    
    -- Visibility
    is_public BOOLEAN DEFAULT TRUE,
    display_order INT DEFAULT 0,
    is_recommended BOOLEAN DEFAULT FALSE,
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Student payment tracking
CREATE TABLE student_payment_tracking (
    id BIGSERIAL PRIMARY KEY,
    student_id BIGINT NOT NULL,
    institute_id BIGINT NOT NULL,
    class_id BIGINT NOT NULL,
    subject_id BIGINT,
    
    -- Payment Info
    payment_mode VARCHAR(50) NOT NULL,
    pricing_tier_id BIGINT,
    total_amount_due DECIMAL(10, 2) NOT NULL,
    amount_paid DECIMAL(10, 2) DEFAULT 0,
    amount_pending DECIMAL(10, 2),
    
    -- Status
    payment_status VARCHAR(50) NOT NULL DEFAULT 'NOT_PAID',
    access_status VARCHAR(50) NOT NULL DEFAULT 'NO_ACCESS',
    
    -- Dates
    enrollment_date TIMESTAMP NOT NULL,
    first_payment_date TIMESTAMP,
    last_payment_date TIMESTAMP,
    next_payment_due TIMESTAMP,
    access_expiry_date TIMESTAMP,
    
    -- Trial & Grace
    in_trial_period BOOLEAN DEFAULT FALSE,
    trial_expiry_date TIMESTAMP,
    in_grace_period BOOLEAN DEFAULT FALSE,
    grace_period_expiry_date TIMESTAMP,
    
    -- Access Flags
    has_access BOOLEAN DEFAULT FALSE,
    can_attend_lectures BOOLEAN DEFAULT FALSE,
    can_access_resources BOOLEAN DEFAULT FALSE,
    can_submit_assignments BOOLEAN DEFAULT FALSE,
    
    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(student_id, institute_id, class_id, subject_id)
);

-- Discount codes
CREATE TABLE discount_codes (
    id BIGSERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    discount_type VARCHAR(50) NOT NULL,
    discount_value DECIMAL(10, 2) NOT NULL,
    
    -- Conditions
    min_students INT,
    early_bird_deadline TIMESTAMP,
    applicable_for VARCHAR(50)[],
    
    -- Limits
    max_usage_per_user INT DEFAULT 1,
    max_total_usage INT,
    current_usage_count INT DEFAULT 0,
    
    -- Validity
    valid_from TIMESTAMP NOT NULL,
    valid_until TIMESTAMP NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Restrictions
    applicable_classes BIGINT[],
    applicable_institutes BIGINT[],
    new_users_only BOOLEAN DEFAULT FALSE,
    first_time_payment_only BOOLEAN DEFAULT FALSE,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Payment plans and installments
CREATE TABLE payment_plans (
    id BIGSERIAL PRIMARY KEY,
    plan_name VARCHAR(100) NOT NULL,
    total_amount DECIMAL(10, 2) NOT NULL,
    number_of_installments INT NOT NULL,
    installment_amount DECIMAL(10, 2) NOT NULL,
    installment_frequency VARCHAR(50) NOT NULL,
    
    first_payment_date TIMESTAMP NOT NULL,
    
    auto_charge_enabled BOOLEAN DEFAULT FALSE,
    penalty_for_late_payment DECIMAL(10, 2) DEFAULT 0,
    grace_period_days INT DEFAULT 0,
    allow_early_completion BOOLEAN DEFAULT TRUE,
    early_completion_discount DECIMAL(5, 2) DEFAULT 0,
    
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Automated actions
CREATE TABLE automated_payment_actions (
    id BIGSERIAL PRIMARY KEY,
    institute_id BIGINT NOT NULL,
    class_id BIGINT,
    
    action_type VARCHAR(50) NOT NULL,
    trigger_condition VARCHAR(50) NOT NULL,
    trigger_date TIMESTAMP,
    days_offset INT,
    
    notification_template TEXT,
    enabled BOOLEAN DEFAULT TRUE,
    
    last_executed TIMESTAMP,
    execution_count INT DEFAULT 0,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

### 10. 🔌 API Endpoints Enhancement

#### 10.1 New Configuration Endpoints

```typescript
// Class Payment Configuration
POST   /api/institutes/:instituteId/classes/:classId/payment-config
GET    /api/institutes/:instituteId/classes/:classId/payment-config
PUT    /api/institutes/:instituteId/classes/:classId/payment-config
DELETE /api/institutes/:instituteId/classes/:classId/payment-config

// Subject Payment Configuration
POST   /api/institutes/:instituteId/classes/:classId/subjects/:subjectId/payment-config
GET    /api/institutes/:instituteId/classes/:classId/subjects/:subjectId/payment-config
PUT    /api/institutes/:instituteId/classes/:classId/subjects/:subjectId/payment-config

// Pricing Tiers
POST   /api/institutes/:instituteId/classes/:classId/pricing-tiers
GET    /api/institutes/:instituteId/classes/:classId/pricing-tiers
PUT    /api/institutes/:instituteId/classes/:classId/pricing-tiers/:tierId
DELETE /api/institutes/:instituteId/classes/:classId/pricing-tiers/:tierId

// Student Payment Tracking
GET    /api/students/:studentId/payment-status
GET    /api/students/:studentId/payment-history
GET    /api/institutes/:instituteId/classes/:classId/payment-overview
POST   /api/students/:studentId/request-access  // Request access without payment

// Discount Management
POST   /api/discount-codes
GET    /api/discount-codes
POST   /api/discount-codes/:code/validate
POST   /api/students/:studentId/apply-discount

// Payment Plans
POST   /api/payment-plans
GET    /api/payment-plans/:planId
POST   /api/students/:studentId/enroll-payment-plan

// Reporting
GET    /api/institutes/:instituteId/payment-reports
GET    /api/institutes/:instituteId/classes/:classId/revenue-report
GET    /api/institutes/:instituteId/overdue-payments
```

---

### 11. 🎨 Frontend Components & UI

#### 11.1 Teacher/Admin Dashboard

**Payment Configuration Panel:**
```
┌─────────────────────────────────────────────┐
│ Class Payment Settings                       │
├─────────────────────────────────────────────┤
│                                             │
│ Payment Required: ○ Free  ● Required        │
│                   ○ Optional  ○ Freemium    │
│                                             │
│ Payment Mode:     ● One-Time                │
│                   ○ Subscription            │
│                   ○ Pay-Per-Class           │
│                                             │
│ Price: LKR [5000.00]                        │
│                                             │
│ ☐ Allow trial period (7 days)              │
│ ☐ Allow grace period (3 days)              │
│ ☐ Allow access before payment              │
│                                             │
│ Content Unlock Date: [2024-03-01]          │
│ Enrollment Deadline: [2024-02-28]          │
│                                             │
│ Maximum Students: [50]                      │
│                                             │
│ [Save Configuration]  [Reset]              │
└─────────────────────────────────────────────┘
```

**Pricing Tiers Setup:**
```
┌─────────────────────────────────────────────┐
│ Pricing Tiers                               │
├─────────────────────────────────────────────┤
│                                             │
│ ┌─────────┐ ┌─────────┐ ┌─────────┐       │
│ │ BASIC   │ │ PREMIUM │ │ VIP     │       │
│ │ LKR     │ │ LKR     │ │ LKR     │       │
│ │ 3,000   │ │ 5,000   │ │ 8,000   │       │
│ │         │ │★POPULAR │ │         │       │
│ │ • Notes │ │ • Notes │ │ • Notes │       │
│ │ • Basic │ │ • Videos│ │ • Videos│       │
│ │   Video │ │ • Downld│ │ • Downld│       │
│ │         │ │ • Cert  │ │ • Cert  │       │
│ │         │ │         │ │ • 1-on-1│       │
│ │ [Edit]  │ │ [Edit]  │ │ [Edit]  │       │
│ └─────────┘ └─────────┘ └─────────┘       │
│                                             │
│ [+ Add New Tier]                           │
└─────────────────────────────────────────────┘
```

#### 11.2 Student View

**Class Access Status:**
```
┌─────────────────────────────────────────────┐
│ Mathematics - Grade 10                       │
├─────────────────────────────────────────────┤
│ ⚠️  Payment Required                        │
│                                             │
│ Status: Enrollment Pending                  │
│ Price: LKR 5,000 (One-time)                │
│                                             │
│ ⏰ Early Bird Discount: 15% OFF            │
│    Available until Feb 15, 2024            │
│                                             │
│ 🎁 Trial Available: 7 days free            │
│                                             │
│ [Start Free Trial]  [Enroll Now]          │
│ [View Pricing Plans]                       │
└─────────────────────────────────────────────┘
```

**Payment Status Dashboard:**
```
┌─────────────────────────────────────────────┐
│ My Payment Status                           │
├─────────────────────────────────────────────┤
│                                             │
│ Mathematics - Grade 10                      │
│ Status: ✅ Active (Trial - 5 days left)   │
│ Payment Due: Feb 20, 2024                  │
│ Amount: LKR 4,250 (15% discount applied)   │
│ [Make Payment]                             │
│                                             │
│ ─────────────────────────────────────────  │
│                                             │
│ Science - Grade 10                          │
│ Status: ⏸️ Grace Period (2 days left)     │
│ Payment Overdue: Feb 18, 2024              │
│ Amount: LKR 5,000 + LKR 500 (penalty)      │
│ ⚠️ Access will be suspended in 2 days     │
│ [Pay Now]                                  │
│                                             │
│ ─────────────────────────────────────────  │
│                                             │
│ English - Grade 10                          │
│ Status: ✅ Paid - Valid until Dec 2024    │
│ [View Receipt]                             │
│                                             │
└─────────────────────────────────────────────┘
```

---

### 12. 🔒 Security & Access Control

#### 12.1 Access Validation Logic

```typescript
async function validateStudentAccess(
  studentId: string,
  instituteId: string,
  classId: string,
  resourceType: ResourceType
): Promise<AccessValidationResult> {
  
  // 1. Check if class requires payment
  const paymentConfig = await getClassPaymentConfig(instituteId, classId);
  
  if (paymentConfig.paymentRequirement === 'FREE') {
    return { hasAccess: true, reason: 'Free access' };
  }
  
  // 2. Get student payment status
  const paymentStatus = await getStudentPaymentStatus(
    studentId, 
    instituteId, 
    classId
  );
  
  // 3. Check trial period
  if (paymentStatus.inTrialPeriod && !isTrialExpired(paymentStatus)) {
    return { 
      hasAccess: true, 
      reason: 'Trial period',
      restrictions: getTrialRestrictions(paymentConfig)
    };
  }
  
  // 4. Check grace period
  if (paymentStatus.inGracePeriod && !isGracePeriodExpired(paymentStatus)) {
    return { 
      hasAccess: true, 
      reason: 'Grace period',
      warning: `Payment overdue. Access ends ${paymentStatus.gracePeriodExpiryDate}`
    };
  }
  
  // 5. Check payment status
  if (paymentStatus.paymentStatus !== 'FULLY_PAID') {
    return { 
      hasAccess: false, 
      reason: 'Payment required',
      redirectTo: '/payment'
    };
  }
  
  // 6. Check access expiry
  if (isAccessExpired(paymentStatus)) {
    return { 
      hasAccess: false, 
      reason: 'Access expired',
      redirectTo: '/renew'
    };
  }
  
  // 7. Check resource-specific restrictions
  if (!hasResourceAccess(paymentStatus, resourceType)) {
    return {
      hasAccess: false,
      reason: 'Resource not included in your plan',
      upgradeRequired: true
    };
  }
  
  return { hasAccess: true, reason: 'Paid access' };
}
```

---

### 13. 📱 Implementation Priority & Roadmap

#### Phase 1: Foundation (2-3 weeks)
- [ ] Database schema additions
- [ ] Basic class/subject payment configuration
- [ ] Payment mode selection (FREE, ONE_TIME, SUBSCRIPTION)
- [ ] Student payment status tracking
- [ ] Basic access control based on payment

#### Phase 2: Scheduling & Access (2 weeks)
- [ ] Content scheduling (unlock dates, enrollment periods)
- [ ] Trial period implementation
- [ ] Grace period implementation
- [ ] Automated access control
- [ ] Payment deadline enforcement

#### Phase 3: Advanced Pricing (2 weeks)
- [ ] Pricing tiers
- [ ] Discount codes
- [ ] Early bird discounts
- [ ] Bulk discounts
- [ ] Payment plans & installments

#### Phase 4: Automation (1-2 weeks)
- [ ] Automated reminders
- [ ] Automated access control
- [ ] Payment deadline notifications
- [ ] Expiry warnings
- [ ] Auto-enrollment/unenrollment

#### Phase 5: Reporting & Analytics (1 week)
- [ ] Payment reports
- [ ] Revenue analytics
- [ ] Collection efficiency metrics
- [ ] Student payment dashboards
- [ ] Admin financial overview

#### Phase 6: Polish & Optimization (1 week)
- [ ] Frontend UI components
- [ ] Mobile responsiveness
- [ ] Performance optimization
- [ ] Documentation
- [ ] Testing & bug fixes

**Total Estimated Time: 10-12 weeks**

---

### 14. 🎯 Key Benefits

#### For Institutes:
✅ **Flexible monetization** - Multiple payment models
✅ **Automated revenue collection** - Reduce manual work
✅ **Better financial planning** - Predictable revenue
✅ **Reduced payment delays** - Automated reminders
✅ **Professional system** - Modern payment management

#### For Teachers:
✅ **Easy payment setup** - Simple configuration
✅ **Automated access control** - No manual tracking
✅ **Revenue insights** - See earnings per class
✅ **Flexible pricing** - Set discounts, offers
✅ **Less admin work** - System handles payments

#### For Students:
✅ **Transparent pricing** - Clear payment requirements
✅ **Flexible payment options** - Installments, discounts
✅ **Trial periods** - Try before buying
✅ **Grace periods** - No immediate cutoff
✅ **Clear status** - Know exactly what access they have

---

### 15. 📝 Configuration Examples

#### Example 1: Free Trial + Paid Class

```typescript
{
  "paymentMode": "ONE_TIME",
  "paymentRequirement": "REQUIRED",
  "basePrice": 5000,
  "trialPeriodDays": 7,
  "gracePeriodDays": 3,
  "allowAccessBeforePayment": true,
  "autoEnrollOnPayment": true,
  "enrollmentStartDate": "2024-02-01",
  "enrollmentEndDate": "2024-02-28",
  "accessStartDate": "2024-03-01",
  "maxStudentsAllowed": 50
}
```

#### Example 2: Monthly Subscription

```typescript
{
  "paymentMode": "SUBSCRIPTION",
  "subscriptionPeriod": "MONTHLY",
  "basePrice": 1500,
  "paymentRequirement": "REQUIRED",
  "allowAccessBeforePayment": false,
  "autoUnenrollOnExpiry": true,
  "sendExpiryReminder": true,
  "reminderDaysBeforeExpiry": 3
}
```

#### Example 3: Freemium Model

```typescript
{
  "paymentMode": "TIERED",
  "paymentRequirement": "FREEMIUM",
  "pricingTiers": [
    {
      "tierName": "Free",
      "price": 0,
      "features": ["View lectures", "Basic notes"],
      "maxLectures": 5,
      "allowDownloads": false
    },
    {
      "tierName": "Premium",
      "price": 3000,
      "features": ["All lectures", "All materials", "Downloads", "Certificate"],
      "allowDownloads": true,
      "certificateIncluded": true
    }
  ]
}
```

#### Example 4: Donation-Based

```typescript
{
  "paymentMode": "DONATION_BASED",
  "paymentRequirement": "OPTIONAL",
  "suggestedAmount": 1000,
  "minimumAmount": 0,
  "allowAccessBeforePayment": true,
  "message": "Support us by making a voluntary contribution. All amounts appreciated!"
}
```

---

### 16. 🚨 Risk Mitigation

#### Potential Issues & Solutions:

**Issue 1:** Students losing access mid-class
- **Solution:** Grace periods, payment reminders, partial access

**Issue 2:** Payment verification delays
- **Solution:** Instant verification for online payments, manual override

**Issue 3:** Complex pricing confusing users
- **Solution:** Clear UI, tooltips, preview before enrollment

**Issue 4:** Revenue leakage
- **Solution:** Automated tracking, alerts, comprehensive reports

**Issue 5:** Technical failures during payment
- **Solution:** Retry mechanisms, backup payment methods, support

---

### 17. 🔧 Technical Considerations

#### Performance:
- Index payment status fields
- Cache payment configurations
- Async payment processing
- Background jobs for notifications

#### Scalability:
- Horizontal scaling ready
- Separate payment service
- Queue-based notification system
- CDN for payment receipts

#### Compliance:
- PCI DSS for card payments
- Data encryption at rest & transit
- Audit logs for all transactions
- GDPR compliance for data storage

---

## 📞 Next Steps

1. **Review & Approve** this proposal
2. **Prioritize features** based on immediate needs
3. **Assign development team** and timeline
4. **Create detailed technical specs** for Phase 1
5. **Start database migration** planning
6. **Design UI mockups** for key screens
7. **Begin implementation** Phase 1

---

## 📚 Related Documentation

- Current Payment System: `USER_CARD_MANAGEMENT_IMPLEMENTATION_GUIDE.md`
- Institute Management: `INSTITUTE_CLASS_SUBJECT_FRONTEND_GUIDE.md`
- Subject Enrollment: `SUBJECT_ENROLLMENT_FEATURE.md`

---

**Document Version:** 1.0  
**Last Updated:** January 21, 2026  
**Author:** GitHub Copilot  
**Status:** Proposal - Pending Review
