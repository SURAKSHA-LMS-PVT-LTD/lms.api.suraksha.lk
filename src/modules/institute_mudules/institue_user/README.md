# Institute User Module

This module manages the relationship between users and institutes in the school management system. It's the core module for handling user assignments to institutes and enforcing user type consistency.

## Key Features

### 🔐 Authentication & Authorization
- JWT authentication required for all endpoints
- Role-based access control with granular permissions
- Institute-level access control guard
- User type consistency enforcement

### 📊 Core Functionality
- **Assign users to institutes** with proper validation
- **Get users by institute** with filtering by user type
- **Get institutes by user** for cross-institute access
- **User type validation** - ensures user.UserType matches assignment type
- **MVP constraint**: One user cannot have multiple roles across institutes

### 🛡️ Business Logic Enforcement
- **User Type Consistency**: When assigning a user to an institute, the system ensures:
  - If user already has a userType, it must match the assignment userType
  - If user doesn't have a userType, it gets set during assignment
  - Users cannot play different roles (prevents role confusion)

### 📋 Special APIs

#### Core Assignment APIs
- `POST /institute-users/assign` - Assign user to institute
- `GET /institute-users/institute/{id}/users` - Get all users by institute
- `GET /institute-users/user/{id}/institutes` - Get all institutes by user

#### Filtered User APIs
- `GET /institute-users/institute/{id}/students` - Get students only
- `GET /institute-users/institute/{id}/teachers` - Get teachers only
- `GET /institute-users?userType=STUDENT&instituteId=1` - Filter by type

#### Access Control APIs
- `GET /institute-users/check-access/{userId}/{instituteId}` - Check access

## Response DTOs

### Smart Response Handling
- **Students**: Returns `StudentResponseDto` with user details
- **Other users**: Returns `UserResponseDto`
- **Institutes**: Returns `InstituteResponseDto`

### Response Structure
```typescript
{
  "instituteUserId": "1",
  "userType": "STUDENT",
  "status": "ACTIVE", 
  "UserIdByInstitute": "STU2024001", // Optional institute-specific ID
  "user": { /* UserResponseDto or StudentResponseDto */ },
  "institute": { /* InstituteResponseDto */ },
  "createdAt": "2024-01-01T00:00:00Z",
  "updatedAt": "2024-01-01T00:00:00Z"
}
```

## Status Management

### Available Statuses
- `ACTIVE` - User is currently active in the institute
- `INACTIVE` - User is temporarily inactive
- `SUSPENDED` - User is suspended
- `PENDING` - Assignment is pending approval
- `FORMER` - User was previously associated
- `INVITED` - User has been invited but not yet joined

## Guards & Security

### Applied Guards
1. **JwtAuthGuard** - Ensures authentication
2. **RolesGuard** - Enforces role-based access
3. **InstituteAccessGuard** - Institute-level access control

### Role Permissions

#### SuperAdmin (`SUPERADMIN`)
- Full access to all operations
- Can assign any user to any institute
- Can view all assignments across institutes

#### Institute Admin (`INSTITUTE_ADMIN`)
- Can manage users within their institute(s)
- Can assign users to their institutes
- Can view users in their institutes

#### Teachers (`TEACHER`)
- Can view students in their institutes
- Limited access to institute data

#### Students/Parents (`STUDENT`/`PARENT`)
- Can view their own institute assignments
- Read-only access to their data

## Database Schema

### InstituteUser Entity
```sql
CREATE TABLE institute_user (
  institute_user_id BIGSERIAL PRIMARY KEY,
  institute_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  user_type ENUM('SUPER_ADMIN', 'INSTITUTE_ADMIN', 'STUDENT', 'TEACHER', 'PARENT', 'ATTEDANCE_MARKER'),
  user_id_institute VARCHAR(50), -- Optional institute-specific ID
  status ENUM('ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING', 'FORMER', 'INVITED'),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  FOREIGN KEY (institute_id) REFERENCES institutes(id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE(institute_id, user_id) -- Prevents duplicate assignments
);
```

## API Examples

### Assign Student to Institute
```http
POST /institute-users/assign
Authorization: Bearer {jwt_token}
Content-Type: application/json

{
  "userId": "123",
  "instituteId": "456", 
  "userType": "STUDENT",
  "status": "ACTIVE"
}
```

### Get All Students in Institute
```http
GET /institute-users/institute/456/students
Authorization: Bearer {jwt_token}
```

### Get User's Institutes
```http
GET /institute-users/user/123/institutes
Authorization: Bearer {jwt_token}
```

### Filter Users with Pagination
```http
GET /institute-users?instituteId=456&userType=STUDENT&status=ACTIVE&page=1&limit=10
Authorization: Bearer {jwt_token}
```

## House Support In Institute User APIs

The secure institute user list APIs now support filtering by house and return each user's assigned house details.

### Supported Endpoints

- `GET /institute-users/institute/:instituteId/users/STUDENT`
- `GET /institute-users/institute/:instituteId/users/TEACHER`
- `GET /institute-users/institute/:instituteId/users/ATTENDANCEMARKER`

### New Query Filter

| Query Param | Type | Required | Description |
|---|---|---|---|
| `houseId` | string (numeric) | No | Filters users assigned to a specific house inside the institute |

### Existing Pagination

| Query Param | Type | Default |
|---|---|---|
| `page` | number | `1` |
| `limit` | number | `10` |

### Response Additions

Each returned user now includes:

- `houseId`: Assigned house ID (or `null` / omitted if not assigned)
- `houseName`: Assigned house name (or `null` / omitted if not assigned)

### Example Requests

```http
GET /institute-users/institute/109/users/STUDENT?parent=true&page=1&limit=50&houseId=1
GET /institute-users/institute/109/users/TEACHER?page=1&limit=50&houseId=1
GET /institute-users/institute/109/users/ATTENDANCEMARKER?page=1&limit=50&houseId=1
```

### Example Response Item

```json
{
  "id": "123",
  "name": "Kasun Perera",
  "email": "kasun@example.com",
  "userIdByInstitute": "STU-001",
  "status": "ACTIVE",
  "houseId": "1",
  "houseName": "Red House"
}
```

> Note: If `houseId` is not provided, users from all houses are returned.

## Error Handling

### Common Errors
- `409 Conflict` - User already assigned to institute
- `400 Bad Request` - User type mismatch (MVP constraint)
- `404 Not Found` - User or institute not found
- `403 Forbidden` - Insufficient permissions or no institute access

### User Type Mismatch Example
```json
{
  "statusCode": 400,
  "message": "User type mismatch. User's type is TEACHER but trying to assign as STUDENT. One user cannot have multiple roles.",
  "error": "Bad Request"
}
```

## Usage in Other Modules

### Import the Module
```typescript
import { InstitueUserModule } from './institute_mudules/institue_user/institue_user.module';

@Module({
  imports: [InstitueUserModule],
  // ...
})
export class SomeModule {}
```

### Use the Service
```typescript
import { InstitueUserService } from './institute_mudules/institue_user/institue_user.service';

@Injectable()
export class SomeService {
  constructor(
    private readonly instituteUserService: InstitueUserService
  ) {}

  async checkAccess(userId: string, instituteId: string) {
    return this.instituteUserService.checkUserInstituteAccess(userId, instituteId);
  }
}
```

### Use the Guard
```typescript
import { InstituteAccessGuard } from './institute_mudules/institue_user/guards/institute-access.guard';

@Controller('some-endpoint')
@UseGuards(JwtAuthGuard, InstituteAccessGuard)
export class SomeController {
  // This will automatically check if user has access to the institute
  // based on instituteId in params/body/query
}
```

## MVP Constraints

1. **One User, One Role**: Users cannot have different userTypes across different institutes
2. **Type Consistency**: user.userType must always match the assignment userType
3. **Immutable User Types**: Once set, user types cannot be changed (prevents role confusion)
4. **Institute Access Control**: Users can only access institutes they're assigned to

These constraints ensure data integrity and prevent role-based security issues in the MVP phase.
