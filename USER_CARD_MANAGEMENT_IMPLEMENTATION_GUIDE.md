# User Card Management System - Implementation Guide

## 📋 Table of Contents
1. [Overview](#overview)
2. [System Requirements](#system-requirements)
3. [Database Schema](#database-schema)
4. [Module Structure](#module-structure)
5. [API Endpoints](#api-endpoints)
6. [Implementation Steps](#implementation-steps)
7. [Security Considerations](#security-considerations)
8. [Testing Strategy](#testing-strategy)

---

## 🎯 Overview

The User Card Management System enables the organization to issue, manage, and track physical identification cards (NFC, PVC, Custom, Sponsored, and Temporary cards) with full lifecycle management including requests, payments, activation/deactivation, and delivery tracking.

### Key Features
- **Multiple Card Types**: NFC, PVC, Custom, Sponsored, Temporary
- **Payment Integration**: Card request with payment processing
- **Card Lifecycle**: Activate, deactivate, request replacement (for lost/damaged cards)
- **Delivery Tracking**: Multi-stage status updates (Verifying → Preparing → Delivering → On The Way → Delivered)
- **Expiration Management**: Automatic card expiry tracking
- **System Admin Controls**: Full administrative access without institute-level restrictions
- **User Portal**: Users can track order status and manage their cards

---

## 📊 System Requirements

### Functional Requirements
1. Users can request new cards with payment
2. Users can view their card order status
3. Users can activate/deactivate their cards
4. Users can report lost/stolen cards and request replacements
5. System admins can manage all card orders globally
6. System admins can update delivery status
7. Cards have expiration dates
8. Payment integration for card requests

### Non-Functional Requirements
1. Secure payment processing
2. Real-time status updates
3. Email notifications for status changes
4. Audit trail for all card operations
5. Role-based access control (Users vs System Admins)

---

## 🗄️ Database Schema

### 1. Enums

```typescript
// Card Types
export enum CardType {
  NFC = 'NFC',
  PVC = 'PVC',
  TEMPORARY = 'TEMPORARY'
}

// Card Status
export enum CardStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  DEACTIVATED = 'DEACTIVATED',
  EXPIRED = 'EXPIRED',
  LOST = 'LOST',
  DAMAGED = 'DAMAGED',
  REPLACED = 'REPLACED'
}

// Order Status
export enum OrderStatus {
  PENDING_PAYMENT = 'PENDING_PAYMENT',
  PAYMENT_RECEIVED = 'PAYMENT_RECEIVED',
  VERIFYING = 'VERIFYING',
  VERIFIED = 'VERIFIED',
  PREPARING = 'PREPARING',
  PRINTING = 'PRINTING',
  DELIVERING = 'DELIVERING',
  ON_THE_WAY = 'ON_THE_WAY',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
  REJECTED = 'REJECTED'
}

// Payment Type
export enum CardPaymentType {
  SLIP_UPLOAD = 'SLIP_UPLOAD',
  VISA_MASTER = 'VISA_MASTER'
}
```

### 2. Main Entities (3 Tables)

#### 1. Card Entity (Card Catalog)
```typescript
@Entity('cards')
export class Card {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'card_name', type: 'varchar', length: 100 })
  cardName: string;

  @Column({ name: 'card_type', type: 'enum', enum: CardType })
  cardType: CardType;

  @Column({ name: 'card_image_url', type: 'varchar', length: 500, nullable: true })
  cardImageUrl?: string;

  @Column({ name: 'card_video_url', type: 'varchar', length: 500, nullable: true })
  cardVideoUrl?: string;

  @Column({ name: 'description', type: 'text', nullable: true })
  description?: string;

  @Column({ name: 'price', type: 'decimal', precision: 10, scale: 2 })
  price: number;

  @Column({ name: 'quantity_available', type: 'int', default: 0 })
  quantityAvailable: number;

  @Column({ name: 'validity_days', type: 'int', default: 365 })
  validityDays: number; // Card expiry period

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
```

#### 2. UserIdCardOrder Entity (Main Order Table)
```typescript
@Entity('user_id_card_orders')
@Index('idx_user_card_order_user', ['userId'])
@Index('idx_user_card_order_status', ['orderStatus', 'status'])
@Index('idx_user_card_order_date', ['orderDate'])
export class UserIdCardOrder {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'user_id', type: 'bigint' })
  userId: string;

  @Column({ name: 'card_id', type: 'bigint' })
  cardId: string;

  @Column({ name: 'card_type', type: 'enum', enum: CardType })
  cardType: CardType;

  @Column({ name: 'payment_id', type: 'bigint', nullable: true })
  paymentId?: string;

  @Column({ name: 'card_expiry_date', type: 'timestamp' })
  cardExpiryDate: Date;

  @Column({ name: 'status', type: 'enum', enum: CardStatus, default: CardStatus.INACTIVE })
  status: CardStatus;

  @Column({ name: 'order_status', type: 'enum', enum: OrderStatus, default: OrderStatus.PENDING_PAYMENT })
  orderStatus: OrderStatus;

  @Column({ name: 'rejected_reason', type: 'text', nullable: true })
  rejectedReason?: string;

  @Column({ name: 'order_date', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  orderDate: Date;

  @Column({ name: 'delivery_address', type: 'text' })
  deliveryAddress: string;

  @Column({ name: 'contact_phone', type: 'varchar', length: 20 })
  contactPhone: string;

  @Column({ name: 'notes', type: 'text', nullable: true })
  notes?: string;

  @Column({ name: 'tracking_number', type: 'varchar', length: 100, nullable: true })
  trackingNumber?: string;

  @Column({ name: 'rfid_number', type: 'varchar', length: 50, nullable: true })
  rfidNumber?: string; // Assigned RFID after delivery

  @Column({ name: 'delivered_at', type: 'timestamp', nullable: true })
  deliveredAt?: Date;

  @Column({ name: 'activated_at', type: 'timestamp', nullable: true })
  activatedAt?: Date;

  @Column({ name: 'deactivated_at', type: 'timestamp', nullable: true })
  deactivatedAt?: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;

  // Relations
  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;

  @ManyToOne(() => Card)
  @JoinColumn({ name: 'card_id' })
  card: Card;

  @OneToMany(() => CardPayment, payment => payment.order)
  payments: CardPayment[];
}
```

#### 3. CardPayment Entity (Payment Submissions)
```typescript
@Entity('card_payments')
@Index('idx_card_payment_order', ['orderId'])
export class CardPayment {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'order_id', type: 'bigint' })
  orderId: string;

  @Column({ name: 'submission_url', type: 'varchar', length: 500 })
  submissionUrl: string; // Payment slip or receipt URL

  @Column({ name: 'payment_type', type: 'enum', enum: CardPaymentType })
  paymentType: CardPaymentType;

  @Column({ name: 'payment_amount', type: 'decimal', precision: 10, scale: 2 })
  paymentAmount: number;

  @Column({ name: 'payment_reference', type: 'varchar', length: 100, nullable: true })
  paymentReference?: string;

  @Column({ name: 'payment_status', type: 'varchar', length: 20, default: 'PENDING' })
  paymentStatus: string; // PENDING, VERIFIED, REJECTED

  @Column({ name: 'verified_by', type: 'bigint', nullable: true })
  verifiedBy?: string;

  @Column({ name: 'verified_at', type: 'timestamp', nullable: true })
  verifiedAt?: Date;

  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason?: string;

  @Column({ name: 'notes', type: 'text', nullable: true })
  notes?: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;

  // Relations
  @ManyToOne(() => UserIdCardOrder, order => order.payments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order: UserIdCardOrder;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'verified_by' })
  verifier?: UserEntity;
}
```

---

## 📁 Module Structure

```
src/modules/user-card-management/
├── user-card-management.module.ts
├── entities/
│   ├── card.entity.ts
│   ├── user-id-card-order.entity.ts
│   └── card-payment.entity.ts
├── dto/
│   ├── create-card.dto.ts
│   ├── create-order.dto.ts
│   ├── submit-payment.dto.ts
│   ├── update-order-status.dto.ts
│   ├── verify-payment.dto.ts
│   └── response/
│       ├── card-response.dto.ts
│       ├── order-response.dto.ts
│       └── payment-response.dto.ts
├── services/
│   ├── card.service.ts
│   ├── card-order.service.ts
│   └── card-payment.service.ts
├── controllers/
│   ├── card.controller.ts (Admin - Manage card catalog)
│   ├── user-card-order.controller.ts (User - Order & manage cards)
│   └── admin-card-order.controller.ts (Admin - Manage all orders)
├── guards/
│   └── system-admin.guard.ts
└── enums/
    ├── card-type.enum.ts
    ├── card-status.enum.ts
    ├── order-status.enum.ts
    └── payment-type.enum.ts
```

---

## 🔌 API Endpoints

### User Endpoints

#### Browse Cards
```
GET /api/user-card/cards
- Get available cards catalog
- Query: page, limit, cardType
- Public/Authenticated access
- Returns: Card list with images, prices, availability
```

#### Card Orders
```
POST /api/user-card/orders
- Create new card order
- Body: { cardId, deliveryAddress, contactPhone, notes }
- Requires: JWT Authentication
- Creates order in PENDING_PAYMENT status

POST /api/user-card/orders/:orderId/payment
- Submit payment for order
- Body: { submissionUrl, paymentType, paymentReference }
- Requires: JWT Authentication
- Updates order to PAYMENT_RECEIVED

GET /api/user-card/orders
- Get user's card orders
- Query: page, limit, orderStatus
- Requires: JWT Authentication
- Returns: All user's orders with status

GET /api/user-card/orders/:orderId
- Get specific order details with payment history
- Requires: JWT Authentication
```

#### My Cards
```
GET /api/user-card/my-cards
- Get user's cards (ACTIVE + previously DEACTIVATED)
- Query: page, limit, status
- Requires: JWT Authentication
- Returns: All user cards with their current status

PATCH /api/user-card/my-cards/:orderId/status
- Update card status (ACTIVE, DEACTIVATED, LOST, DAMAGED)
- Body: { status, notes }
- Requires: JWT Authentication
- User can deactivate their own cards
```

### System Admin Endpoints

#### Card Catalog Management
```
GET /api/admin/cards
- Get all cards in catalog
- Query: page, limit, isActive
- Requires: System Admin

POST /api/admin/cards
- Create new card in catalog
- Body: { cardName, cardType, price, cardImageUrl, description, quantityAvailable, validityDays }
- Requires: System Admin

PATCH /api/admin/cards/:cardId
- Update card details
- Body: Partial card data
- Requires: System Admin

DELETE /api/admin/cards/:cardId
- Deactivate card (soft delete)
- Requires: System Admin
```

#### Order Management
```
GET /api/admin/card-orders
- Get all orders (filterable)
- Query: page, limit, orderStatus, userId, cardType, dateFrom, dateTo
- Requires: System Admin
- Returns: All orders with user and payment info

GET /api/admin/card-orders/:orderId
- Get order details with full payment history
- Requires: System Admin

PATCH /api/admin/card-orders/:orderId/status
- Update order status
- Body: { orderStatus, trackingNumber, notes, rejectedReason }
- Requires: System Admin
- Can update: VERIFYING, VERIFIED, PREPARING, PRINTING, DELIVERING, ON_THE_WAY, DELIVERED, REJECTED

PATCH /api/admin/card-orders/:orderId/rfid
- Assign RFID to delivered card (auto-updates user table)
- Body: { rfidNumber }
- Requires: System Admin
- Auto-updates user.rfidCard field

PATCH /api/admin/card-orders/:orderId/card-status
- Change card status (ACTIVE, DEACTIVATED, EXPIRED, etc.)
- Body: { status, notes }
- Requires: System Admin
```

#### Payment Verification
```
GET /api/admin/card-payments
- Get all payment submissions
- Query: page, limit, paymentStatus, orderId
- Requires: System Admin

GET /api/admin/card-payments/:paymentId
- Get payment details
- Requires: System Admin
- Returns: Payment with submission URL (cannot delete)

PATCH /api/admin/card-payments/:paymentId/verify
- Verify payment submission
- Body: { paymentStatus: 'VERIFIED' | 'REJECTED', rejectionReason?, notes? }
- Requires: System Admin
- Updates order status to PAYMENT_RECEIVED or REJECTED

Note: Payment submissions CANNOT be deleted (audit trail)
```

#### Statistics
```
GET /api/admin/card-orders/statistics
- Get order statistics
- Query: dateFrom, dateTo
- Returns: Total orders, revenue, status breakdown, card type distribution
- Requires: System Admin
```

---

## 🛠️ Implementation Steps

### Phase 1: Database Setup (Day 1)
1. Create migration file for 3 tables
2. Add indexes for performance
3. Seed sample card catalog
4. Test database schema

**Migration File**: `migrations/1737000000000-CreateUserCardManagement.ts`

```typescript
import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateUserCardManagement1737000000000 implements MigrationInterface {
    name = 'CreateUserCardManagement1737000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Create enums
        await queryRunner.query(`
            CREATE TYPE "card_type_enum" AS ENUM('NFC', 'PVC', 'TEMPORARY')
        `);
        
        await queryRunner.query(`
            CREATE TYPE "card_status_enum" AS ENUM(
                'ACTIVE', 'INACTIVE', 'DEACTIVATED', 'EXPIRED', 
                'LOST', 'DAMAGED', 'REPLACED'
            )
        `);
        
        await queryRunner.query(`
            CREATE TYPE "order_status_enum" AS ENUM(
                'PENDING_PAYMENT', 'PAYMENT_RECEIVED', 'VERIFYING', 
                'VERIFIED', 'PREPARING', 'PRINTING', 'DELIVERING', 
                'ON_THE_WAY', 'DELIVERED', 'CANCELLED', 'REJECTED'
            )
        `);
        
        await queryRunner.query(`
            CREATE TYPE "card_payment_type_enum" AS ENUM('SLIP_UPLOAD', 'VISA_MASTER')
        `);

        // 1. Create cards table (Catalog)
        await queryRunner.query(`
            CREATE TABLE "cards" (
                "id" BIGSERIAL NOT NULL,
                "card_name" VARCHAR(100) NOT NULL,
                "card_type" "card_type_enum" NOT NULL,
                "card_image_url" VARCHAR(500),
                "card_video_url" VARCHAR(500),
                "description" TEXT,
                "price" DECIMAL(10,2) NOT NULL,
                "quantity_available" INTEGER NOT NULL DEFAULT 0,
                "validity_days" INTEGER NOT NULL DEFAULT 365,
                "is_active" BOOLEAN NOT NULL DEFAULT true,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_cards" PRIMARY KEY ("id")
            )
        `);

        // 2. Create user_id_card_orders table
        await queryRunner.query(`
            CREATE TABLE "user_id_card_orders" (
                "id" BIGSERIAL NOT NULL,
                "user_id" BIGINT NOT NULL,
                "card_id" BIGINT NOT NULL,
                "card_type" "card_type_enum" NOT NULL,
                "payment_id" BIGINT,
                "card_expiry_date" TIMESTAMP NOT NULL,
                "status" "card_status_enum" NOT NULL DEFAULT 'INACTIVE',
                "order_status" "order_status_enum" NOT NULL DEFAULT 'PENDING_PAYMENT',
                "rejected_reason" TEXT,
                "order_date" TIMESTAMP NOT NULL DEFAULT now(),
                "delivery_address" TEXT NOT NULL,
                "contact_phone" VARCHAR(20) NOT NULL,
                "notes" TEXT,
                "tracking_number" VARCHAR(100),
                "rfid_number" VARCHAR(50),
                "delivered_at" TIMESTAMP,
                "activated_at" TIMESTAMP,
                "deactivated_at" TIMESTAMP,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_user_id_card_orders" PRIMARY KEY ("id")
            )
        `);

        // Create indexes for user_id_card_orders
        await queryRunner.query(`
            CREATE INDEX "idx_user_card_order_user" ON "user_id_card_orders" ("user_id")
        `);
        await queryRunner.query(`
            CREATE INDEX "idx_user_card_order_status" 
            ON "user_id_card_orders" ("order_status", "status")
        `);
        await queryRunner.query(`
            CREATE INDEX "idx_user_card_order_date" ON "user_id_card_orders" ("order_date")
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "idx_user_card_rfid" 
            ON "user_id_card_orders" ("rfid_number") 
            WHERE "rfid_number" IS NOT NULL
        `);

        // 3. Create card_payments table
        await queryRunner.query(`
            CREATE TABLE "card_payments" (
                "id" BIGSERIAL NOT NULL,
                "order_id" BIGINT NOT NULL,
                "submission_url" VARCHAR(500) NOT NULL,
                "payment_type" "card_payment_type_enum" NOT NULL,
                "payment_amount" DECIMAL(10,2) NOT NULL,
                "payment_reference" VARCHAR(100),
                "payment_status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
                "verified_by" BIGINT,
                "verified_at" TIMESTAMP,
                "rejection_reason" TEXT,
                "notes" TEXT,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_card_payments" PRIMARY KEY ("id")
            )
        `);

        // Create index for card_payments
        await queryRunner.query(`
            CREATE INDEX "idx_card_payment_order" ON "card_payments" ("order_id")
        `);

        // Add foreign keys
        await queryRunner.query(`
            ALTER TABLE "user_id_card_orders" 
            ADD CONSTRAINT "FK_order_user" 
            FOREIGN KEY ("user_id") REFERENCES "users"("id") 
            ON DELETE CASCADE
        `);

        await queryRunner.query(`
            ALTER TABLE "user_id_card_orders" 
            ADD CONSTRAINT "FK_order_card" 
            FOREIGN KEY ("card_id") REFERENCES "cards"("id") 
            ON DELETE RESTRICT
        `);

        await queryRunner.query(`
            ALTER TABLE "card_payments" 
            ADD CONSTRAINT "FK_payment_order" 
            FOREIGN KEY ("order_id") REFERENCES "user_id_card_orders"("id") 
            ON DELETE CASCADE
        `);

        await queryRunner.query(`
            ALTER TABLE "card_payments" 
            ADD CONSTRAINT "FK_payment_verifier" 
            FOREIGN KEY ("verified_by") REFERENCES "users"("id") 
            ON DELETE SET NULL
        `);

        // Seed sample cards
        await queryRunner.query(`
            INSERT INTO "cards" 
            ("card_name", "card_type", "price", "quantity_available", "validity_days", "description")
            VALUES
            ('Standard NFC Card', 'NFC', 500.00, 100, 730, 'Standard NFC-enabled ID card with 2-year validity'),
            ('Standard PVC Card', 'PVC', 300.00, 200, 730, 'Standard PVC ID card with 2-year validity'),
            ('Temporary Card', 'TEMPORARY', 150.00, 50, 90, 'Temporary card valid for 90 days')
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop foreign keys
        await queryRunner.query(`ALTER TABLE "card_payments" DROP CONSTRAINT "FK_payment_verifier"`);
        await queryRunner.query(`ALTER TABLE "card_payments" DROP CONSTRAINT "FK_payment_order"`);
        await queryRunner.query(`ALTER TABLE "user_id_card_orders" DROP CONSTRAINT "FK_order_card"`);
        await queryRunner.query(`ALTER TABLE "user_id_card_orders" DROP CONSTRAINT "FK_order_user"`);

        // Drop tables
        await queryRunner.query(`DROP TABLE "card_payments"`);
        await queryRunner.query(`DROP TABLE "user_id_card_orders"`);
        await queryRunner.query(`DROP TABLE "cards"`);

        // Drop enums
        await queryRunner.query(`DROP TYPE "card_payment_type_enum"`);
        await queryRunner.query(`DROP TYPE "order_status_enum"`);
        await queryRunner.query(`DROP TYPE "card_status_enum"`);
        await queryRunner.query(`DROP TYPE "card_type_enum"`);
    }
}
```

### Phase 2: Entities & DTOs (Day 2)
1. Create 3 entity files (Card, UserIdCardOrder, CardPayment)
2. Create DTO files for requests and responses
3. Create enums
4. Test entity relationships

### Phase 3: Services Implementation (Days 3-4)

**Priority Order:**
1. **CardService** - Manage card catalog (Admin)
2. **CardOrderService** - Handle user orders and admin order management
3. **CardPaymentService** - Payment submission and verification

### Phase 4: Controllers Implementation (Days 5-6)

**Priority Order:**
1. **CardController** (Admin) - Card catalog management
2. **UserCardOrderController** (User) - Browse, order, view my cards
3. **AdminCardOrderController** (Admin) - Order & payment management

### Phase 5: Integration & Special Features (Day 7)
1. **Auto RFID Update**: When admin assigns RFID to order, automatically update user table's `rfidCard` column
2. Add email notifications for order status changes
3. Implement tracking number system
4. Test payment verification workflow

### Phase 6: Testing (Day 8)
1. Unit tests for services
2. Integration tests for complete workflow
3. Test RFID auto-update on user table
4. Test payment submission (ensure cannot delete)

### Phase 7: Documentation & Deployment (Day 9)
1. API documentation (Swagger)
2. User guide
3. Admin guide

---

## 🔒 Security Considerations

### 1. Authentication & Authorization
- All endpoints require JWT authentication
- System Admin endpoints protected by `SystemAdminGuard`
- Users can only access their own orders and cards
- Admins have global access to all orders

### 2. Data Validation
- Strong validation on all DTOs
- RFID number uniqueness enforcement
- Card expiry date validation
- Phone number and address validation

### 3. Payment Security
- Payment submissions stored permanently (cannot be deleted for audit)
- Multiple payment attempts allowed per order
- Admin verification required before order processing
- Payment slip URLs validated and secured

### 4. RFID Auto-Update
- When admin assigns RFID to an order, automatically update user table
- Ensure RFID uniqueness across all orders
- Log all RFID assignments for audit trail

### 5. Rate Limiting
- Apply rate limits on order creation
- Throttle payment submission endpoints
- Prevent abuse of card requests

---

## 🧪 Testing Strategy

### Unit Tests
```typescript
// CardOrderService Tests
describe('CardOrderService', () => {
  it('should create order in PENDING_PAYMENT status', async () => {});
  it('should update order status when payment verified', async () => {});
  it('should calculate card expiry based on card validity days', async () => {});
  it('should prevent RFID duplication', async () => {});
});

// CardPaymentService Tests
describe('CardPaymentService', () => {
  it('should create payment submission', async () => {});
  it('should prevent payment deletion', async () => {});
  it('should verify payment and update order', async () => {});
});
```

### Integration Tests
```typescript
// Complete Order Flow
describe('Card Order Flow (E2E)', () => {
  it('should complete full order lifecycle', async () => {
    // 1. User creates order
    // 2. User submits payment
    // 3. Admin verifies payment
    // 4. Admin processes order through statuses
    // 5. Admin assigns RFID (auto-updates user table)
    // 6. User activates card
  });
  
  it('should auto-update user RFID when assigned', async () => {
    // Test that user.rfidCard is updated when order RFID is assigned
  });
});
```

---

## 📊 Key Features Summary

### Simple 3-Table Design
1. **cards** - Card catalog (admin managed)
2. **user_id_card_orders** - Main table with all order and card info
3. **card_payments** - Payment submissions (cannot delete)

### Special Features
- **Auto RFID Update**: When admin assigns RFID to order, user table `rfidCard` column updates automatically
- **Payment Audit Trail**: Payment submissions cannot be deleted, only verified/rejected
- **My Cards View**: Users see all ACTIVE + DEACTIVATED cards (not just active)
- **Admin Full Control**: Admins can change any card status, manage orders, verify payments
- **No Institute Restrictions**: System admins have global access

### User Capabilities
- Browse card catalog
- Create orders
- Submit payments (slip upload or visa/master)
- Track order status
- View my cards (active + deactivated)
- Activate/deactivate cards
- Report lost/damaged cards

### Admin Capabilities
- Manage card catalog (add, edit, deactivate cards)
- View all orders with filters
- Verify/reject payment submissions
- Update order status through workflow
- Assign RFID numbers (auto-updates user table)
- Change card status (active, deactivated, lost, expired, etc.)
- View statistics and reports
- **Cannot delete payment submissions** (audit compliance)

---

## 🔄 Workflow Examples

### User Workflow: Ordering a Card
```
1. Browse cards → GET /api/user-card/cards
2. Select card and create order → POST /api/user-card/orders
   - Input: cardId, deliveryAddress, contactPhone, notes
   - Output: Order created with PENDING_PAYMENT status
   
3. Submit payment → POST /api/user-card/orders/:orderId/payment
   - Input: submissionUrl (payment slip), paymentType, paymentReference
   - Output: Order status → PAYMENT_RECEIVED
   
4. Track order → GET /api/user-card/orders/:orderId
   - User can see order status progress
   
5. Admin verifies payment → PATCH /api/admin/card-payments/:paymentId/verify
   - Order status → VERIFYING → VERIFIED → PREPARING → PRINTING → DELIVERING → ON_THE_WAY
   
6. Card delivered → PATCH /api/admin/card-orders/:orderId/status
   - Order status → DELIVERED
   - Admin assigns RFID → PATCH /api/admin/card-orders/:orderId/rfid
   - **Auto-updates user table's rfidCard column**
   
7. User activates card → PATCH /api/user-card/my-cards/:orderId/status
   - Status: INACTIVE → ACTIVE
   
8. View my cards → GET /api/user-card/my-cards
   - Shows all ACTIVE + previously DEACTIVATED cards
```

### User Workflow: Managing Cards
```
1. View my cards → GET /api/user-card/my-cards
   - Shows ACTIVE and DEACTIVATED cards
   
2. Report lost card → PATCH /api/user-card/my-cards/:orderId/status
   - Body: { status: 'LOST', notes: 'Lost card at...' }
   - Card status → LOST
   
3. Order replacement (start from ordering workflow again)
```

### Admin Workflow: Managing Orders
```
1. View pending payments → GET /api/admin/card-payments?paymentStatus=PENDING
   
2. Verify payment → PATCH /api/admin/card-payments/:paymentId/verify
   - Body: { paymentStatus: 'VERIFIED', notes: '...' }
   - Order status auto-updated to PAYMENT_RECEIVED
   
3. Process order → PATCH /api/admin/card-orders/:orderId/status
   - Update through: VERIFYING → VERIFIED → PREPARING → PRINTING
   
4. Ship card → PATCH /api/admin/card-orders/:orderId/status
   - Body: { orderStatus: 'DELIVERING', trackingNumber: 'TRACK123' }
   
5. Mark delivered → PATCH /api/admin/card-orders/:orderId/status
   - Body: { orderStatus: 'DELIVERED' }
   
6. Assign RFID → PATCH /api/admin/card-orders/:orderId/rfid
   - Body: { rfidNumber: 'RFID123456' }
   - **Automatically updates user.rfidCard column**
   - Card now ready for use in attendance/access systems
```

### Admin Workflow: Card Catalog Management
```
1. Add new card type → POST /api/admin/cards
   - Body: { cardName, cardType, price, cardImageUrl, quantityAvailable, validityDays }
   
2. Update pricing → PATCH /api/admin/cards/:cardId
   - Body: { price: 350.00 }
   
3. View all orders → GET /api/admin/card-orders
   - Filter by status, user, date range
```

---

## 📝 Configuration

### Environment Variables
```env
# Card Management
CARD_DEFAULT_VALIDITY_DAYS=730
ENABLE_NFC_CARDS=true

# Notifications
CARD_ORDER_NOTIFICATION_EMAIL=cards@institution.com
SEND_ORDER_STATUS_EMAILS=true

# File Upload
MAX_CARD_IMAGE_SIZE=5MB
ALLOWED_IMAGE_FORMATS=jpg,jpeg,png
```

---

## 🚀 Deployment Checklist

- [ ] Database migration executed successfully
- [ ] Seed data (sample cards) loaded
- [ ] 3 entities created and tested (Card, UserIdCardOrder, CardPayment)
- [ ] Services implemented with error handling
- [ ] Controllers implemented with validation
- [ ] System Admin guard configured
- [ ] RFID auto-update to user table working
- [ ] Payment submission prevention (no delete) working
- [ ] Swagger documentation complete
- [ ] Unit tests passing
- [ ] Integration tests passing
- [ ] E2E workflow tested
- [ ] Admin training completed
- [ ] User documentation published

---

## 📞 Support & Maintenance

### Monitoring
- Track order processing times
- Monitor payment verification rates
- Alert on delayed deliveries
- Track card activation rates
- Monitor expiry rates

### Maintenance Tasks
- Weekly: Review pending payments
- Monthly: Check cards expiring soon
- Quarterly: Review card catalog and pricing
- Annually: Archive old orders

---

## 📚 Database Table Summary

### 1. `cards` - Card Catalog
- Managed by admins
- Contains card types, prices, images, availability
- Users browse this to select cards

### 2. `user_id_card_orders` - Main Order & Card Table
- One table for everything
- Tracks order status AND card status
- Contains delivery info, RFID, expiry, etc.
- When RFID assigned, auto-updates user table

### 3. `card_payments` - Payment Submissions
- Multiple payments possible per order
- **Cannot be deleted** (audit trail)
- Admins verify/reject payments
- Links to order

---

**Document Version**: 2.0 (Simplified)  
**Last Updated**: January 15, 2026  
**Author**: System Architect  
**Status**: Ready for Implementation

**Key Simplifications:**
- Reduced from 5 tables to 3 tables
- Combined card and order info in one table
- Removed history/activity tracking tables
- Payment submissions permanent (audit compliance)
- Auto RFID update to user table
- Users see active + deactivated cards
- Admins have full control without delete on payments
