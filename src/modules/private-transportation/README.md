# Bookhire Management System Documentation

## Overview
The Bookhire Management System is a comprehensive platform that allows bookhire owners to register, manage their vehicles, and handle student enrollments. Students can self-enroll in bookhires, and parents can monitor their children's transportation data.

## System Architecture

### User Types
1. **Bookhire Owners**: Can register, manage bookhires, and handle enrollments
2. **Students**: Can self-enroll in bookhires using bookhire ID and enrollment key
3. **Parents**: Can view their children's bookhire enrollments and attendance
4. **Super Admins**: Can approve/reject bookhires and manage the entire system

### Key Components

#### 1. BookhireOwner Schema
- Owner registration with business details
- Email/password authentication
- Business license and contact information
- Activation/deactivation status

#### 2. Bookhire Schema
- Vehicle information (title, year, vehicle number)
- Capacity and route descriptions
- Admin approval workflow
- Owner relationship

#### 3. StudentBookhireEnrollment Schema
- Student-specific enrollment data
- Individual pickup/dropoff times and locations
- Monthly fees per student
- Enrollment status management

## API Endpoints

### Bookhire Owner Authentication

#### POST `/api/bookhire-owner/auth/register`
Register a new bookhire owner.
```json
{
  "ownerName": "John Doe",
  "email": "john@example.com",
  "password": "securePassword123",
  "phoneNumber": "+1234567890",
  "businessName": "Doe Transportation",
  "businessLicense": "BL123456",
  "address": "123 Main St",
  "city": "Springfield",
  "state": "IL",
  "pincode": "62701"
}
```

#### POST `/api/bookhire-owner/auth/login`
Login as bookhire owner.
```json
{
  "email": "john@example.com",
  "password": "securePassword123"
}
```

Response includes JWT token with owner information and bookhire IDs.

### Bookhire Management

#### POST `/api/bookhire`
Create a new bookhire (Owner only).
```json
{
  "title": "Morning School Service",
  "year": 2023,
  "vehicleNumber": "ABC-1234",
  "capacity": 30,
  "routeDescription": "Main St -> School Campus",
  "operatingDays": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
  "operatingHours": {
    "start": "07:00",
    "end": "09:00"
  }
}
```

#### GET `/api/bookhire?page=1&limit=10`
Get paginated list of bookhires.
- Students see only approved bookhires
- Owners see only their bookhires
- Admins see all bookhires

#### PUT `/api/bookhire/:id`
Update bookhire details (Owner only, own bookhires).

#### DELETE `/api/bookhire/:id`
Delete bookhire (Owner only, own bookhires).

#### PUT `/api/bookhire/admin/:id/approve`
Approve bookhire (Admin only).

#### PUT `/api/bookhire/admin/:id/reject`
Reject bookhire (Admin only).

### Student Enrollment

#### POST `/api/student-bookhire-enrollment/enroll`
Student self-enrollment.
```json
{
  "studentId": "student123",
  "bookhireId": "bookhire456",
  "enrollmentKey": "KEY123",
  "pickupLocation": "123 Home St",
  "pickupTime": "07:30",
  "dropoffLocation": "School Main Gate",
  "dropoffTime": "08:15",
  "monthlyFee": 150
}
```

#### GET `/api/student-bookhire-enrollment/student/:studentId?page=1&limit=10`
Get student's enrollments (Student can only access own data).

#### GET `/api/student-bookhire-enrollment/parent/:parentId?page=1&limit=10`
Get parent's children enrollments (Parent can only access children's data).

#### GET `/api/student-bookhire-enrollment/owner/:ownerId?page=1&limit=10`
Get bookhire owner's enrollments (Owner can only access own bookhires).

#### PUT `/api/student-bookhire-enrollment/:id/status`
Update enrollment status.
```json
{
  "status": "ACTIVE" // or "PENDING", "CANCELLED", "GRADUATED"
}
```

#### PUT `/api/student-bookhire-enrollment/:id/cancel`
Cancel enrollment (Student, Parent, or Owner).

## Authentication & Authorization

### JWT Token Structure
```json
{
  "sub": "owner_id",
  "email": "owner@example.com",
  "type": "bookhire-owner",
  "ownerName": "Owner Name",
  "businessName": "Business Name"
}
```

### Access Control
- **Students**: Can only access their own data
- **Parents**: Can only access their children's data
- **Bookhire Owners**: Can only manage their own bookhires and enrollments
- **Super Admins**: Full access to all data

## Pagination
All list endpoints support pagination:
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 10, max: 100)

Response format:
```json
{
  "data": [...],
  "pagination": {
    "currentPage": 1,
    "totalPages": 5,
    "totalItems": 50,
    "hasNextPage": true,
    "hasPrevPage": false
  }
}
```

## Status Management

### Bookhire Status
- `PENDING`: Awaiting admin approval
- `APPROVED`: Active and available for enrollment
- `REJECTED`: Not approved by admin
- `SUSPENDED`: Temporarily disabled

### Enrollment Status
- `PENDING`: Enrollment submitted, awaiting approval
- `ACTIVE`: Student is actively enrolled
- `CANCELLED`: Enrollment cancelled
- `GRADUATED`: Student completed the service

## Error Handling
All endpoints return appropriate HTTP status codes:
- `200`: Success
- `201`: Created
- `400`: Bad Request (validation errors)
- `401`: Unauthorized (authentication required)
- `403`: Forbidden (insufficient permissions)
- `404`: Not Found
- `409`: Conflict (duplicate data)
- `500`: Internal Server Error

## Security Features
- Password encryption using bcrypt
- JWT-based authentication
- Role-based access control
- Input validation and sanitization
- Rate limiting (configurable)
- CORS protection

## Database Collections
- `bookhireowners`: Bookhire owner profiles
- `bookhires`: Vehicle and service information
- `studentbookhireenrollments`: Student enrollment records

## Environment Variables
```
JWT_SECRET=your_jwt_secret_here
JWT_EXPIRATION=24h
MONGODB_URI=mongodb://localhost:27017/your_database
```

## Getting Started

### 1. Bookhire Owner Registration
1. Owner registers using the registration endpoint
2. Admin activates the owner account if needed
3. Owner can login and receive JWT token

### 2. Create Bookhire
1. Owner creates bookhire with vehicle details
2. Admin approves the bookhire
3. Bookhire becomes available for student enrollment

### 3. Student Enrollment
1. Student finds available bookhires
2. Student enrolls using bookhire ID and enrollment key
3. Owner can manage the enrollment
4. System tracks attendance and payments

### 4. Parent Monitoring
1. Parent accesses system using their credentials
2. Parent can view children's enrollment status
3. Parent can monitor attendance and payment history

## Future Enhancements
- Payment gateway integration
- Real-time GPS tracking
- Push notifications
- Mobile app support
- Advanced reporting and analytics