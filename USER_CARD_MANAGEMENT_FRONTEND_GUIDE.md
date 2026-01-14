# User Card Management - Frontend Implementation Guide

## Table of Contents
1. [Overview](#overview)
2. [TypeScript Types & Enums](#typescript-types--enums)
3. [User Endpoints](#user-endpoints)
4. [Admin Endpoints](#admin-endpoints)
5. [Error Responses](#error-responses)
6. [Authentication](#authentication)

---

## Overview

The User Card Management system handles NFC, PVC, and Temporary ID cards with complete order lifecycle, payment processing, and RFID management.

**Base URL:** `https://your-api.com/api`

---

## TypeScript Types & Enums

### Enums

```typescript
// Card Types
enum CardType {
  NFC = 'NFC',
  PVC = 'PVC',
  TEMPORARY = 'TEMPORARY'
}

// Card Status (7 states)
enum CardStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  DEACTIVATED = 'DEACTIVATED',
  EXPIRED = 'EXPIRED',
  LOST = 'LOST',
  DAMAGED = 'DAMAGED',
  REPLACED = 'REPLACED'
}

// Order Status (11 states)
enum OrderStatus {
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

// Payment Types
enum PaymentType {
  SLIP_UPLOAD = 'SLIP_UPLOAD',
  VISA_MASTER = 'VISA_MASTER'
}

// Payment Status
enum PaymentStatus {
  PENDING = 'PENDING',
  VERIFIED = 'VERIFIED',
  REJECTED = 'REJECTED'
}
```

### Interfaces

```typescript
// Card Entity
interface Card {
  id: number;
  cardName: string;
  cardType: CardType;
  cardImageUrl: string | null;
  cardVideoUrl: string | null;
  description: string | null;
  price: number;
  quantityAvailable: number;
  validityDays: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// User ID Card Order
interface UserIdCardOrder {
  id: number;
  userId: number;
  cardId: number;
  cardType: CardType;
  paymentId: number | null;
  cardExpiryDate: string;
  status: CardStatus;
  orderStatus: OrderStatus;
  rejectedReason: string | null;
  orderDate: string;
  deliveryAddress: string;
  contactPhone: string;
  notes: string | null;
  trackingNumber: string | null;
  rfidNumber: string | null;
  deliveredAt: string | null;
  activatedAt: string | null;
  deactivatedAt: string | null;
  createdAt: string;
  updatedAt: string;
  // Relations (populated)
  card?: Card;
  payment?: CardPayment;
}

// Card Payment
interface CardPayment {
  id: number;
  orderId: number;
  submissionUrl: string;
  paymentType: PaymentType;
  paymentAmount: number;
  paymentReference: string | null;
  paymentStatus: PaymentStatus;
  verifiedBy: number | null;
  verifiedAt: string | null;
  rejectionReason: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  // Relations (populated)
  order?: UserIdCardOrder;
}

// Pagination Meta
interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Paginated Responses
interface PaginatedCardsResponse {
  data: Card[];
  meta: PaginationMeta;
}

interface PaginatedOrdersResponse {
  data: UserIdCardOrder[];
  meta: PaginationMeta;
}

interface PaginatedPaymentsResponse {
  data: CardPayment[];
  meta: PaginationMeta;
}

// Statistics
interface OrderStatistics {
  totalOrders: number;
  pendingPayment: number;
  paymentReceived: number;
  verifying: number;
  verified: number;
  preparing: number;
  printing: number;
  delivering: number;
  onTheWay: number;
  delivered: number;
  cancelled: number;
  rejected: number;
  activeCards: number;
  inactiveCards: number;
  deactivatedCards: number;
  expiredCards: number;
}
```

---

## User Endpoints

### 1. Browse Available Cards

**Endpoint:** `GET /user-card/cards`

**Headers:**
```typescript
{
  "Authorization": "Bearer <JWT_TOKEN>"
}
```

**Query Parameters:**
```typescript
{
  page?: number;        // Default: 1
  limit?: number;       // Default: 10
  cardType?: CardType;  // Filter by type
  search?: string;      // Search by card name
}
```

**Success Response (200):**
```typescript
{
  "data": [
    {
      "id": 1,
      "cardName": "Standard NFC Card",
      "cardType": "NFC",
      "cardImageUrl": "https://example.com/images/nfc-card.jpg",
      "cardVideoUrl": null,
      "description": "Standard NFC-enabled ID card with 2-year validity",
      "price": 500.00,
      "quantityAvailable": 100,
      "validityDays": 730,
      "isActive": true,
      "createdAt": "2026-01-15T10:00:00.000Z",
      "updatedAt": "2026-01-15T10:00:00.000Z"
    },
    {
      "id": 2,
      "cardName": "Standard PVC Card",
      "cardType": "PVC",
      "cardImageUrl": "https://example.com/images/pvc-card.jpg",
      "cardVideoUrl": null,
      "description": "Standard PVC ID card with 2-year validity",
      "price": 300.00,
      "quantityAvailable": 200,
      "validityDays": 730,
      "isActive": true,
      "createdAt": "2026-01-15T10:00:00.000Z",
      "updatedAt": "2026-01-15T10:00:00.000Z"
    }
  ],
  "meta": {
    "total": 3,
    "page": 1,
    "limit": 10,
    "totalPages": 1
  }
}
```

---

### 2. Create Card Order

**Endpoint:** `POST /user-card/orders`

**Headers:**
```typescript
{
  "Authorization": "Bearer <JWT_TOKEN>",
  "Content-Type": "application/json"
}
```

**Request Body:**
```typescript
{
  "cardId": 1,
  "deliveryAddress": "No. 123, Main Street, Colombo 07, Sri Lanka",
  "contactPhone": "+94771234567",
  "notes": "Please deliver during office hours"  // Optional
}
```

**Success Response (201):**
```typescript
{
  "id": 1,
  "userId": 5,
  "cardId": 1,
  "cardType": "NFC",
  "paymentId": null,
  "cardExpiryDate": "2028-01-15T10:30:00.000Z",
  "status": "INACTIVE",
  "orderStatus": "PENDING_PAYMENT",
  "rejectedReason": null,
  "orderDate": "2026-01-15T10:30:00.000Z",
  "deliveryAddress": "No. 123, Main Street, Colombo 07, Sri Lanka",
  "contactPhone": "+94771234567",
  "notes": "Please deliver during office hours",
  "trackingNumber": null,
  "rfidNumber": null,
  "deliveredAt": null,
  "activatedAt": null,
  "deactivatedAt": null,
  "createdAt": "2026-01-15T10:30:00.000Z",
  "updatedAt": "2026-01-15T10:30:00.000Z",
  "card": {
    "id": 1,
    "cardName": "Standard NFC Card",
    "cardType": "NFC",
    "price": 500.00,
    "validityDays": 730
  }
}
```

**Error Responses:**
- `400 Bad Request` - Invalid card ID or validation failed
- `404 Not Found` - Card not found or not available
- `409 Conflict` - Insufficient card quantity

---

### 3. Submit Payment

**Endpoint:** `POST /user-card/orders/:orderId/payment`

**Headers:**
```typescript
{
  "Authorization": "Bearer <JWT_TOKEN>",
  "Content-Type": "application/json"
}
```

**Request Body:**
```typescript
{
  "submissionUrl": "https://example.com/payment-slips/slip123.jpg",
  "paymentType": "SLIP_UPLOAD",  // or "VISA_MASTER"
  "paymentAmount": 500.00,
  "paymentReference": "REF123456789"  // Optional
}
```

**Success Response (201):**
```typescript
{
  "id": 1,
  "orderId": 1,
  "submissionUrl": "https://example.com/payment-slips/slip123.jpg",
  "paymentType": "SLIP_UPLOAD",
  "paymentAmount": 500.00,
  "paymentReference": "REF123456789",
  "paymentStatus": "PENDING",
  "verifiedBy": null,
  "verifiedAt": null,
  "rejectionReason": null,
  "notes": null,
  "createdAt": "2026-01-15T10:35:00.000Z",
  "updatedAt": "2026-01-15T10:35:00.000Z",
  "order": {
    "id": 1,
    "orderStatus": "PAYMENT_RECEIVED"
  }
}
```

**Error Responses:**
- `400 Bad Request` - Invalid payment data
- `404 Not Found` - Order not found
- `409 Conflict` - Payment already submitted for this order

---

### 4. Get My Orders

**Endpoint:** `GET /user-card/orders`

**Headers:**
```typescript
{
  "Authorization": "Bearer <JWT_TOKEN>"
}
```

**Query Parameters:**
```typescript
{
  page?: number;              // Default: 1
  limit?: number;             // Default: 10
  orderStatus?: OrderStatus;  // Filter by order status
  cardType?: CardType;        // Filter by card type
}
```

**Success Response (200):**
```typescript
{
  "data": [
    {
      "id": 1,
      "userId": 5,
      "cardId": 1,
      "cardType": "NFC",
      "paymentId": 1,
      "cardExpiryDate": "2028-01-15T10:30:00.000Z",
      "status": "ACTIVE",
      "orderStatus": "DELIVERED",
      "rejectedReason": null,
      "orderDate": "2026-01-15T10:30:00.000Z",
      "deliveryAddress": "No. 123, Main Street, Colombo 07, Sri Lanka",
      "contactPhone": "+94771234567",
      "notes": "Please deliver during office hours",
      "trackingNumber": "TRACK123456",
      "rfidNumber": "RFID001234567890",
      "deliveredAt": "2026-01-20T14:00:00.000Z",
      "activatedAt": "2026-01-21T09:00:00.000Z",
      "deactivatedAt": null,
      "createdAt": "2026-01-15T10:30:00.000Z",
      "updatedAt": "2026-01-21T09:00:00.000Z",
      "card": {
        "id": 1,
        "cardName": "Standard NFC Card",
        "cardType": "NFC",
        "cardImageUrl": "https://example.com/images/nfc-card.jpg",
        "price": 500.00
      },
      "payment": {
        "id": 1,
        "paymentStatus": "VERIFIED",
        "paymentAmount": 500.00,
        "verifiedAt": "2026-01-16T10:00:00.000Z"
      }
    }
  ],
  "meta": {
    "total": 5,
    "page": 1,
    "limit": 10,
    "totalPages": 1
  }
}
```

---

### 5. Get Order Details

**Endpoint:** `GET /user-card/orders/:orderId`

**Headers:**
```typescript
{
  "Authorization": "Bearer <JWT_TOKEN>"
}
```

**Success Response (200):**
```typescript
{
  "id": 1,
  "userId": 5,
  "cardId": 1,
  "cardType": "NFC",
  "paymentId": 1,
  "cardExpiryDate": "2028-01-15T10:30:00.000Z",
  "status": "ACTIVE",
  "orderStatus": "DELIVERED",
  "rejectedReason": null,
  "orderDate": "2026-01-15T10:30:00.000Z",
  "deliveryAddress": "No. 123, Main Street, Colombo 07, Sri Lanka",
  "contactPhone": "+94771234567",
  "notes": "Please deliver during office hours",
  "trackingNumber": "TRACK123456",
  "rfidNumber": "RFID001234567890",
  "deliveredAt": "2026-01-20T14:00:00.000Z",
  "activatedAt": "2026-01-21T09:00:00.000Z",
  "deactivatedAt": null,
  "createdAt": "2026-01-15T10:30:00.000Z",
  "updatedAt": "2026-01-21T09:00:00.000Z",
  "card": {
    "id": 1,
    "cardName": "Standard NFC Card",
    "cardType": "NFC",
    "cardImageUrl": "https://example.com/images/nfc-card.jpg",
    "cardVideoUrl": null,
    "description": "Standard NFC-enabled ID card with 2-year validity",
    "price": 500.00,
    "validityDays": 730
  },
  "payment": {
    "id": 1,
    "submissionUrl": "https://example.com/payment-slips/slip123.jpg",
    "paymentType": "SLIP_UPLOAD",
    "paymentAmount": 500.00,
    "paymentReference": "REF123456789",
    "paymentStatus": "VERIFIED",
    "verifiedAt": "2026-01-16T10:00:00.000Z",
    "rejectionReason": null
  }
}
```

**Error Responses:**
- `404 Not Found` - Order not found or not owned by user

---

### 6. Get My Active & Deactivated Cards

**Endpoint:** `GET /user-card/my-cards`

**Headers:**
```typescript
{
  "Authorization": "Bearer <JWT_TOKEN>"
}
```

**Query Parameters:**
```typescript
{
  page?: number;        // Default: 1
  limit?: number;       // Default: 10
  cardType?: CardType;  // Filter by type
}
```

**Success Response (200):**
```typescript
{
  "data": [
    {
      "id": 1,
      "cardType": "NFC",
      "status": "ACTIVE",
      "orderStatus": "DELIVERED",
      "rfidNumber": "RFID001234567890",
      "cardExpiryDate": "2028-01-15T10:30:00.000Z",
      "deliveredAt": "2026-01-20T14:00:00.000Z",
      "activatedAt": "2026-01-21T09:00:00.000Z",
      "deactivatedAt": null,
      "card": {
        "id": 1,
        "cardName": "Standard NFC Card",
        "cardImageUrl": "https://example.com/images/nfc-card.jpg"
      }
    },
    {
      "id": 2,
      "cardType": "PVC",
      "status": "DEACTIVATED",
      "orderStatus": "DELIVERED",
      "rfidNumber": "RFID999888777666",
      "cardExpiryDate": "2027-12-01T10:30:00.000Z",
      "deliveredAt": "2025-12-05T14:00:00.000Z",
      "activatedAt": "2025-12-06T09:00:00.000Z",
      "deactivatedAt": "2026-01-10T15:30:00.000Z",
      "card": {
        "id": 2,
        "cardName": "Standard PVC Card",
        "cardImageUrl": "https://example.com/images/pvc-card.jpg"
      }
    }
  ],
  "meta": {
    "total": 2,
    "page": 1,
    "limit": 10,
    "totalPages": 1
  }
}
```

---

### 7. Update My Card Status

**Endpoint:** `PATCH /user-card/my-cards/:orderId/status`

**Headers:**
```typescript
{
  "Authorization": "Bearer <JWT_TOKEN>",
  "Content-Type": "application/json"
}
```

**Request Body:**
```typescript
{
  "status": "LOST",  // LOST, DAMAGED, DEACTIVATED
  "notes": "Card was lost on 2026-01-14"  // Optional
}
```

**Success Response (200):**
```typescript
{
  "id": 1,
  "status": "LOST",
  "deactivatedAt": "2026-01-15T11:00:00.000Z",
  "updatedAt": "2026-01-15T11:00:00.000Z"
}
```

**Error Responses:**
- `400 Bad Request` - Invalid status or card not eligible for status change
- `404 Not Found` - Card not found or not owned by user

---

## Admin Endpoints

### 8. Create Card (Admin)

**Endpoint:** `POST /admin/cards`

**Headers:**
```typescript
{
  "Authorization": "Bearer <JWT_TOKEN>",
  "Content-Type": "application/json"
}
```

**Required Role:** System Admin (SA) or Organization Manager (OM)

**Request Body:**
```typescript
{
  "cardName": "Premium NFC Card",
  "cardType": "NFC",
  "cardImageUrl": "https://example.com/images/premium-nfc.jpg",  // Optional
  "cardVideoUrl": "https://example.com/videos/premium-nfc.mp4",  // Optional
  "description": "Premium NFC card with extended features",       // Optional
  "price": 750.00,
  "quantityAvailable": 50,
  "validityDays": 1095  // 3 years
}
```

**Success Response (201):**
```typescript
{
  "id": 4,
  "cardName": "Premium NFC Card",
  "cardType": "NFC",
  "cardImageUrl": "https://example.com/images/premium-nfc.jpg",
  "cardVideoUrl": "https://example.com/videos/premium-nfc.mp4",
  "description": "Premium NFC card with extended features",
  "price": 750.00,
  "quantityAvailable": 50,
  "validityDays": 1095,
  "isActive": true,
  "createdAt": "2026-01-15T12:00:00.000Z",
  "updatedAt": "2026-01-15T12:00:00.000Z"
}
```

**Error Responses:**
- `400 Bad Request` - Validation failed
- `403 Forbidden` - Not authorized (not SA or OM)

---

### 9. Get All Cards (Admin)

**Endpoint:** `GET /admin/cards`

**Headers:**
```typescript
{
  "Authorization": "Bearer <JWT_TOKEN>"
}
```

**Required Role:** System Admin (SA) or Organization Manager (OM)

**Query Parameters:**
```typescript
{
  page?: number;           // Default: 1
  limit?: number;          // Default: 10
  cardType?: CardType;     // Filter by type
  isActive?: boolean;      // Filter by active status
  search?: string;         // Search by card name
}
```

**Success Response (200):**
```typescript
{
  "data": [
    {
      "id": 1,
      "cardName": "Standard NFC Card",
      "cardType": "NFC",
      "cardImageUrl": "https://example.com/images/nfc-card.jpg",
      "cardVideoUrl": null,
      "description": "Standard NFC-enabled ID card with 2-year validity",
      "price": 500.00,
      "quantityAvailable": 100,
      "validityDays": 730,
      "isActive": true,
      "createdAt": "2026-01-15T10:00:00.000Z",
      "updatedAt": "2026-01-15T10:00:00.000Z"
    }
  ],
  "meta": {
    "total": 4,
    "page": 1,
    "limit": 10,
    "totalPages": 1
  }
}
```

---

### 10. Update Card (Admin)

**Endpoint:** `PATCH /admin/cards/:id`

**Headers:**
```typescript
{
  "Authorization": "Bearer <JWT_TOKEN>",
  "Content-Type": "application/json"
}
```

**Required Role:** System Admin (SA) or Organization Manager (OM)

**Request Body (All fields optional):**
```typescript
{
  "cardName": "Updated Standard NFC Card",
  "price": 550.00,
  "quantityAvailable": 120,
  "cardImageUrl": "https://example.com/images/nfc-card-new.jpg",
  "description": "Updated description",
  "validityDays": 730,
  "isActive": true
}
```

**Success Response (200):**
```typescript
{
  "id": 1,
  "cardName": "Updated Standard NFC Card",
  "cardType": "NFC",
  "cardImageUrl": "https://example.com/images/nfc-card-new.jpg",
  "cardVideoUrl": null,
  "description": "Updated description",
  "price": 550.00,
  "quantityAvailable": 120,
  "validityDays": 730,
  "isActive": true,
  "createdAt": "2026-01-15T10:00:00.000Z",
  "updatedAt": "2026-01-15T13:00:00.000Z"
}
```

**Error Responses:**
- `404 Not Found` - Card not found
- `403 Forbidden` - Not authorized

---

### 11. Delete Card (Admin)

**Endpoint:** `DELETE /admin/cards/:id`

**Headers:**
```typescript
{
  "Authorization": "Bearer <JWT_TOKEN>"
}
```

**Required Role:** System Admin (SA) or Organization Manager (OM)

**Success Response (200):**
```typescript
{
  "message": "Card deleted successfully"
}
```

**Error Responses:**
- `404 Not Found` - Card not found
- `403 Forbidden` - Not authorized

---

### 12. Get All Orders (Admin)

**Endpoint:** `GET /admin/card-orders`

**Headers:**
```typescript
{
  "Authorization": "Bearer <JWT_TOKEN>"
}
```

**Required Role:** System Admin (SA) or Organization Manager (OM)

**Query Parameters:**
```typescript
{
  page?: number;                  // Default: 1
  limit?: number;                 // Default: 10
  orderStatus?: OrderStatus;      // Filter by order status
  cardStatus?: CardStatus;        // Filter by card status
  cardType?: CardType;            // Filter by card type
  userId?: number;                // Filter by user
  cardId?: number;                // Filter by card
  startDate?: string;             // Filter by order date (ISO 8601)
  endDate?: string;               // Filter by order date (ISO 8601)
  hasRfid?: boolean;              // Filter by RFID assignment
  search?: string;                // Search by tracking number or RFID
}
```

**Success Response (200):**
```typescript
{
  "data": [
    {
      "id": 1,
      "userId": 5,
      "cardId": 1,
      "cardType": "NFC",
      "paymentId": 1,
      "cardExpiryDate": "2028-01-15T10:30:00.000Z",
      "status": "ACTIVE",
      "orderStatus": "DELIVERED",
      "rejectedReason": null,
      "orderDate": "2026-01-15T10:30:00.000Z",
      "deliveryAddress": "No. 123, Main Street, Colombo 07, Sri Lanka",
      "contactPhone": "+94771234567",
      "notes": "Please deliver during office hours",
      "trackingNumber": "TRACK123456",
      "rfidNumber": "RFID001234567890",
      "deliveredAt": "2026-01-20T14:00:00.000Z",
      "activatedAt": "2026-01-21T09:00:00.000Z",
      "deactivatedAt": null,
      "createdAt": "2026-01-15T10:30:00.000Z",
      "updatedAt": "2026-01-21T09:00:00.000Z",
      "card": {
        "id": 1,
        "cardName": "Standard NFC Card",
        "cardType": "NFC",
        "price": 500.00
      },
      "payment": {
        "id": 1,
        "paymentStatus": "VERIFIED",
        "paymentAmount": 500.00
      }
    }
  ],
  "meta": {
    "total": 45,
    "page": 1,
    "limit": 10,
    "totalPages": 5
  }
}
```

---

### 13. Update Order Status (Admin)

**Endpoint:** `PATCH /admin/card-orders/:orderId/status`

**Headers:**
```typescript
{
  "Authorization": "Bearer <JWT_TOKEN>",
  "Content-Type": "application/json"
}
```

**Required Role:** System Admin (SA) or Organization Manager (OM)

**Request Body:**
```typescript
{
  "orderStatus": "PRINTING",
  "trackingNumber": "TRACK123456",  // Optional (required for DELIVERING/ON_THE_WAY)
  "rejectedReason": "Insufficient payment amount",  // Optional (required for REJECTED)
  "notes": "Processing order"  // Optional
}
```

**Valid Status Transitions:**
```
PENDING_PAYMENT → CANCELLED
PAYMENT_RECEIVED → VERIFYING → VERIFIED → PREPARING → 
PRINTING → DELIVERING → ON_THE_WAY → DELIVERED
VERIFYING → REJECTED
```

**Success Response (200):**
```typescript
{
  "id": 1,
  "orderStatus": "PRINTING",
  "trackingNumber": "TRACK123456",
  "updatedAt": "2026-01-18T10:00:00.000Z"
}
```

**Error Responses:**
- `400 Bad Request` - Invalid status transition or missing required fields
- `404 Not Found` - Order not found
- `403 Forbidden` - Not authorized

---

### 14. Assign RFID (Admin)

**Endpoint:** `PATCH /admin/card-orders/:orderId/rfid`

**Headers:**
```typescript
{
  "Authorization": "Bearer <JWT_TOKEN>",
  "Content-Type": "application/json"
}
```

**Required Role:** System Admin (SA) or Organization Manager (OM)

**Request Body:**
```typescript
{
  "rfidNumber": "RFID001234567890"
}
```

**Success Response (200):**
```typescript
{
  "id": 1,
  "rfidNumber": "RFID001234567890",
  "status": "ACTIVE",
  "activatedAt": "2026-01-21T09:00:00.000Z",
  "updatedAt": "2026-01-21T09:00:00.000Z"
}
```

**Note:** This endpoint automatically:
1. Updates the order's `rfidNumber` field
2. Updates the user's `rfid` field in the users table
3. Activates the card (sets status to ACTIVE) if it was INACTIVE
4. Both updates happen in a single database transaction

**Error Responses:**
- `400 Bad Request` - Invalid RFID format
- `404 Not Found` - Order not found
- `409 Conflict` - RFID already assigned to another order
- `403 Forbidden` - Not authorized

---

### 15. Update Card Status (Admin)

**Endpoint:** `PATCH /admin/card-orders/:orderId/card-status`

**Headers:**
```typescript
{
  "Authorization": "Bearer <JWT_TOKEN>",
  "Content-Type": "application/json"
}
```

**Required Role:** System Admin (SA) or Organization Manager (OM)

**Request Body:**
```typescript
{
  "status": "EXPIRED",  // Any CardStatus value
  "notes": "Card expired due to validity period ending"  // Optional
}
```

**Success Response (200):**
```typescript
{
  "id": 1,
  "status": "EXPIRED",
  "deactivatedAt": "2026-01-15T14:00:00.000Z",
  "updatedAt": "2026-01-15T14:00:00.000Z"
}
```

**Error Responses:**
- `400 Bad Request` - Invalid status
- `404 Not Found` - Order not found
- `403 Forbidden` - Not authorized

---

### 16. Get All Payments (Admin)

**Endpoint:** `GET /admin/card-payments`

**Headers:**
```typescript
{
  "Authorization": "Bearer <JWT_TOKEN>"
}
```

**Required Role:** System Admin (SA) or Organization Manager (OM)

**Query Parameters:**
```typescript
{
  page?: number;               // Default: 1
  limit?: number;              // Default: 10
  paymentStatus?: PaymentStatus;  // Filter by status (PENDING/VERIFIED/REJECTED)
  paymentType?: PaymentType;   // Filter by type
  orderId?: number;            // Filter by order
  startDate?: string;          // Filter by creation date (ISO 8601)
  endDate?: string;            // Filter by creation date (ISO 8601)
}
```

**Success Response (200):**
```typescript
{
  "data": [
    {
      "id": 1,
      "orderId": 1,
      "submissionUrl": "https://example.com/payment-slips/slip123.jpg",
      "paymentType": "SLIP_UPLOAD",
      "paymentAmount": 500.00,
      "paymentReference": "REF123456789",
      "paymentStatus": "VERIFIED",
      "verifiedBy": 2,
      "verifiedAt": "2026-01-16T10:00:00.000Z",
      "rejectionReason": null,
      "notes": "Payment verified successfully",
      "createdAt": "2026-01-15T10:35:00.000Z",
      "updatedAt": "2026-01-16T10:00:00.000Z",
      "order": {
        "id": 1,
        "userId": 5,
        "orderStatus": "VERIFIED",
        "cardType": "NFC"
      }
    }
  ],
  "meta": {
    "total": 20,
    "page": 1,
    "limit": 10,
    "totalPages": 2
  }
}
```

---

### 17. Verify Payment (Admin)

**Endpoint:** `PATCH /admin/card-payments/:paymentId/verify`

**Headers:**
```typescript
{
  "Authorization": "Bearer <JWT_TOKEN>",
  "Content-Type": "application/json"
}
```

**Required Role:** System Admin (SA) or Organization Manager (OM)

**Request Body:**
```typescript
{
  "paymentStatus": "VERIFIED",  // or "REJECTED"
  "rejectionReason": "Invalid payment slip",  // Required if REJECTED
  "notes": "Payment verified successfully"  // Optional
}
```

**Success Response (200):**
```typescript
{
  "id": 1,
  "paymentStatus": "VERIFIED",
  "verifiedBy": 2,
  "verifiedAt": "2026-01-16T10:00:00.000Z",
  "rejectionReason": null,
  "notes": "Payment verified successfully",
  "updatedAt": "2026-01-16T10:00:00.000Z",
  "order": {
    "id": 1,
    "orderStatus": "VERIFIED"  // Automatically updated
  }
}
```

**Note:** When payment is verified, the order status is automatically updated to `VERIFIED`. When rejected, order status is updated to `REJECTED`.

**Error Responses:**
- `400 Bad Request` - Invalid status or missing rejection reason
- `404 Not Found` - Payment not found
- `403 Forbidden` - Not authorized

---

### 18. Attempt Delete Payment (Admin) - FORBIDDEN

**Endpoint:** `DELETE /admin/card-payments/:paymentId`

**Headers:**
```typescript
{
  "Authorization": "Bearer <JWT_TOKEN>"
}
```

**Required Role:** System Admin (SA) or Organization Manager (OM)

**Error Response (403):**
```typescript
{
  "statusCode": 403,
  "message": "Payment records cannot be deleted for audit trail compliance",
  "error": "Forbidden"
}
```

**Note:** Payment deletion is permanently disabled for audit compliance. All payment records are preserved.

---

### 19. Get Order Statistics (Admin)

**Endpoint:** `GET /admin/card-orders/statistics`

**Headers:**
```typescript
{
  "Authorization": "Bearer <JWT_TOKEN>"
}
```

**Required Role:** System Admin (SA) or Organization Manager (OM)

**Success Response (200):**
```typescript
{
  "totalOrders": 45,
  "pendingPayment": 5,
  "paymentReceived": 3,
  "verifying": 2,
  "verified": 4,
  "preparing": 3,
  "printing": 2,
  "delivering": 3,
  "onTheWay": 5,
  "delivered": 15,
  "cancelled": 2,
  "rejected": 1,
  "activeCards": 12,
  "inactiveCards": 8,
  "deactivatedCards": 3,
  "expiredCards": 2
}
```

---

## Error Responses

### Standard Error Format

All error responses follow this structure:

```typescript
{
  "statusCode": number,
  "message": string | string[],
  "error": string,
  "timestamp"?: string,
  "path"?: string
}
```

### Common HTTP Status Codes

#### 400 Bad Request
```typescript
{
  "statusCode": 400,
  "message": [
    "cardId must be a positive number",
    "deliveryAddress should not be empty",
    "contactPhone must be a valid phone number"
  ],
  "error": "Bad Request"
}
```

#### 401 Unauthorized
```typescript
{
  "statusCode": 401,
  "message": "Unauthorized",
  "error": "Unauthorized"
}
```

#### 403 Forbidden
```typescript
{
  "statusCode": 403,
  "message": "Access denied. System Admin or Organization Manager role required.",
  "error": "Forbidden"
}
```

```typescript
{
  "statusCode": 403,
  "message": "Payment records cannot be deleted for audit trail compliance",
  "error": "Forbidden"
}
```

#### 404 Not Found
```typescript
{
  "statusCode": 404,
  "message": "Order not found",
  "error": "Not Found"
}
```

```typescript
{
  "statusCode": 404,
  "message": "Card not found or not available",
  "error": "Not Found"
}
```

#### 409 Conflict
```typescript
{
  "statusCode": 409,
  "message": "RFID number already assigned to another order",
  "error": "Conflict"
}
```

```typescript
{
  "statusCode": 409,
  "message": "Insufficient card quantity available",
  "error": "Conflict"
}
```

```typescript
{
  "statusCode": 409,
  "message": "Payment already submitted for this order",
  "error": "Conflict"
}
```

#### 500 Internal Server Error
```typescript
{
  "statusCode": 500,
  "message": "Internal server error",
  "error": "Internal Server Error"
}
```

---

## Authentication

### JWT Token Structure

The API uses JWT tokens with a compact payload:

```typescript
{
  "s": number,      // userId
  "ut": string,     // userType ('SA' = SUPER_ADMIN, 'OM' = ORGANIZATION_MANAGER, etc.)
  "iat": number     // issued at timestamp
}
```

### Required Headers

All endpoints require:
```typescript
{
  "Authorization": "Bearer <JWT_TOKEN>"
}
```

### Admin Endpoints

Admin endpoints require `ut` field to be either:
- `'SA'` - Super Admin
- `'OM'` - Organization Manager

---

## Order Status Flow

### Complete Order Lifecycle

```
1. User creates order
   ↓
   PENDING_PAYMENT (Initial state)
   ↓
2. User submits payment
   ↓
   PAYMENT_RECEIVED
   ↓
3. Admin starts verification
   ↓
   VERIFYING
   ↓
4. Admin verifies payment
   ↓
   VERIFIED
   ↓
5. Admin starts preparation
   ↓
   PREPARING → PRINTING
   ↓
6. Admin ships order
   ↓
   DELIVERING (tracking number required)
   ↓
   ON_THE_WAY
   ↓
7. Order delivered
   ↓
   DELIVERED
   ↓
8. Admin assigns RFID
   ↓
   Card status: INACTIVE → ACTIVE
```

### Alternative Flows

**Cancellation by User:**
```
PENDING_PAYMENT → CANCELLED
```

**Rejection by Admin:**
```
VERIFYING → REJECTED
(User needs to resubmit payment)
```

---

## Card Status Flow

### Lifecycle States

```
INACTIVE (Default when order created)
   ↓
ACTIVE (When RFID assigned)
   ↓
DEACTIVATED (User or admin action)
   ↓
EXPIRED (When validity period ends)

Anytime:
   → LOST (User reports)
   → DAMAGED (User reports)
   → REPLACED (Admin action)
```

---

## Payment Flow

### Payment Submission Process

```
1. User creates order
   Order Status: PENDING_PAYMENT
   ↓
2. User uploads payment slip
   POST /user-card/orders/:orderId/payment
   Payment Status: PENDING
   Order Status: PAYMENT_RECEIVED
   ↓
3. Admin verifies payment
   PATCH /admin/card-payments/:paymentId/verify
   
   If VERIFIED:
   - Payment Status: VERIFIED
   - Order Status: VERIFIED
   
   If REJECTED:
   - Payment Status: REJECTED
   - Order Status: REJECTED
   - User can resubmit payment
```

---

## Usage Examples

### Example 1: Complete User Journey

```typescript
// Step 1: Browse available cards
const cardsResponse = await fetch('/user-card/cards', {
  headers: { 'Authorization': `Bearer ${token}` }
});
const cards = await cardsResponse.json();

// Step 2: Create order for selected card
const orderResponse = await fetch('/user-card/orders', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    cardId: cards.data[0].id,
    deliveryAddress: 'No. 123, Main St, Colombo',
    contactPhone: '+94771234567'
  })
});
const order = await orderResponse.json();

// Step 3: Submit payment
const paymentResponse = await fetch(`/user-card/orders/${order.id}/payment`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    submissionUrl: 'https://example.com/slip.jpg',
    paymentType: 'SLIP_UPLOAD',
    paymentAmount: cards.data[0].price
  })
});

// Step 4: Track order status
const trackingResponse = await fetch(`/user-card/orders/${order.id}`, {
  headers: { 'Authorization': `Bearer ${token}` }
});
const orderDetails = await trackingResponse.json();
console.log('Order Status:', orderDetails.orderStatus);
```

### Example 2: Admin Processing Order

```typescript
// Step 1: Get pending payments
const paymentsResponse = await fetch('/admin/card-payments?paymentStatus=PENDING', {
  headers: { 'Authorization': `Bearer ${adminToken}` }
});
const payments = await paymentsResponse.json();

// Step 2: Verify payment
const verifyResponse = await fetch(`/admin/card-payments/${payments.data[0].id}/verify`, {
  method: 'PATCH',
  headers: {
    'Authorization': `Bearer ${adminToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    paymentStatus: 'VERIFIED',
    notes: 'Payment verified successfully'
  })
});

// Step 3: Update order status through lifecycle
const statusUpdates = ['PREPARING', 'PRINTING', 'DELIVERING'];
for (const status of statusUpdates) {
  await fetch(`/admin/card-orders/${payments.data[0].orderId}/status`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      orderStatus: status,
      ...(status === 'DELIVERING' && { trackingNumber: 'TRACK123' })
    })
  });
}

// Step 4: Assign RFID when delivered
await fetch(`/admin/card-orders/${payments.data[0].orderId}/rfid`, {
  method: 'PATCH',
  headers: {
    'Authorization': `Bearer ${adminToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    rfidNumber: 'RFID001234567890'
  })
});
```

### Example 3: Check My Active Cards

```typescript
const myCardsResponse = await fetch('/user-card/my-cards', {
  headers: { 'Authorization': `Bearer ${token}` }
});
const myCards = await myCardsResponse.json();

myCards.data.forEach(card => {
  console.log(`
    Card: ${card.card.cardName}
    Type: ${card.cardType}
    Status: ${card.status}
    RFID: ${card.rfidNumber}
    Expires: ${card.cardExpiryDate}
  `);
});
```

---

## Frontend Implementation Tips

### 1. Order Status Badge Colors

```typescript
const orderStatusColors = {
  PENDING_PAYMENT: 'gray',
  PAYMENT_RECEIVED: 'blue',
  VERIFYING: 'yellow',
  VERIFIED: 'green',
  PREPARING: 'purple',
  PRINTING: 'purple',
  DELIVERING: 'blue',
  ON_THE_WAY: 'blue',
  DELIVERED: 'green',
  CANCELLED: 'red',
  REJECTED: 'red'
};
```

### 2. Card Status Badge Colors

```typescript
const cardStatusColors = {
  ACTIVE: 'green',
  INACTIVE: 'gray',
  DEACTIVATED: 'orange',
  EXPIRED: 'red',
  LOST: 'red',
  DAMAGED: 'red',
  REPLACED: 'blue'
};
```

### 3. Payment Status Badge Colors

```typescript
const paymentStatusColors = {
  PENDING: 'yellow',
  VERIFIED: 'green',
  REJECTED: 'red'
};
```

### 4. Form Validation

```typescript
// Order creation validation
const validateOrder = {
  cardId: (value) => value > 0 || 'Please select a card',
  deliveryAddress: (value) => value.trim().length > 10 || 'Address must be at least 10 characters',
  contactPhone: (value) => /^\+94\d{9}$/.test(value) || 'Invalid Sri Lankan phone number'
};

// Payment submission validation
const validatePayment = {
  submissionUrl: (value) => /^https?:\/\/.+/.test(value) || 'Invalid URL',
  paymentAmount: (value) => value > 0 || 'Amount must be positive',
  paymentType: (value) => ['SLIP_UPLOAD', 'VISA_MASTER'].includes(value) || 'Invalid payment type'
};

// RFID validation
const validateRfid = {
  rfidNumber: (value) => /^[A-Z0-9]{12,20}$/.test(value) || 'Invalid RFID format'
};
```

### 5. Date Formatting

```typescript
// Format dates consistently
const formatDate = (isoString: string) => {
  return new Date(isoString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

// Check if card is expiring soon (within 30 days)
const isExpiringSoon = (expiryDate: string) => {
  const expiry = new Date(expiryDate);
  const now = new Date();
  const daysUntilExpiry = Math.floor((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return daysUntilExpiry <= 30 && daysUntilExpiry > 0;
};
```

### 6. Error Handling

```typescript
const handleApiError = (error: any) => {
  if (error.statusCode === 401) {
    // Redirect to login
    window.location.href = '/login';
  } else if (error.statusCode === 403) {
    // Show access denied message
    alert('Access denied. You do not have permission to perform this action.');
  } else if (error.statusCode === 404) {
    // Show not found message
    alert(error.message || 'Resource not found');
  } else if (error.statusCode === 409) {
    // Show conflict message
    alert(error.message || 'Conflict detected');
  } else {
    // Generic error
    alert('An error occurred. Please try again.');
  }
};
```

---

## Testing Checklist

### User Flow Testing
- [ ] Browse cards with filters
- [ ] Create order
- [ ] Submit payment
- [ ] View order history
- [ ] Track order status
- [ ] View active cards
- [ ] Report card lost/damaged
- [ ] Deactivate card

### Admin Flow Testing
- [ ] Create card in catalog
- [ ] Update card details
- [ ] Soft delete card
- [ ] View all orders with filters
- [ ] Verify payments
- [ ] Reject payments
- [ ] Update order status
- [ ] Assign RFID (verify user.rfid also updates)
- [ ] Update card status
- [ ] View statistics
- [ ] Attempt to delete payment (should fail)

### Edge Cases
- [ ] Order with insufficient card quantity
- [ ] Duplicate RFID assignment
- [ ] Payment submission on already paid order
- [ ] Invalid status transitions
- [ ] Expired cards
- [ ] Missing tracking number for delivery status

---

**Document Version:** 1.0  
**Last Updated:** January 15, 2026  
**API Version:** v1
