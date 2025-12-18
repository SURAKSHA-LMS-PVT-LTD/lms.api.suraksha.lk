# JWT Architecture Guide for Microservices

## 📋 Table of Contents
- [Overview](#overview)
- [JWT Token Structure](#jwt-token-structure)
- [Authentication Flow](#authentication-flow)
- [Authorization System](#authorization-system)
- [Validation Decorators](#validation-decorators)
- [Guards & Strategies](#guards--strategies)
- [Microservices Integration](#microservices-integration)
- [Best Practices](#best-practices)
- [Implementation Examples](#implementation-examples)
- [Migration Guide](#migration-guide)

## 🎯 Overview

This guide provides a complete JWT authentication and authorization architecture for microservices, featuring:

- **Ultra-Compact JWT Tokens**: Optimized payload structure for better performance
- **Hierarchical Access Control**: Granular permissions for institutes, classes, and subjects
- **Modern NestJS Integration**: Latest patterns with NestJS v11 and JWT v9
- **Microservices Ready**: Reusable components across multiple services
- **Role-Based Security**: Comprehensive RBAC with decorator-based validation

## 🔑 JWT Token Structure

### Ultra-Compact Payload Format

```typescript
interface JwtPayload {
  s: string;    // subject (user ID) 
  ut: string;   // user type (IA, TE, ST, PA, AM, SA, OM)
  
  // Access control (only one will be present)
  ha?: HierarchicalAccess; // hierarchical: { instituteId: { classId: [subjectIds] } }
  aa?: AdminAccess;        // admin: { instituteId: 1|0 }
  sd?: string[];           // student IDs (for parents)
  
  iat: number;  // issued at
  exp?: number; // expiration (handled by JWT service)
}
```

### User Type Mappings

```typescript
const USER_TYPE_COMPACT = {
  SUPER_ADMIN: 'SA',
  INSTITUTE_ADMIN: 'IA', 
  ATTENDANCE_MARKER: 'AM',
  TEACHER: 'TE',
  STUDENT: 'ST',
  PARENT: 'PA',
  ORGANIZATION_MANAGER: 'OM'
};
```

### Access Structures

#### Hierarchical Access (Teachers/Students)
```typescript
{
  "inst_123": {
    "class_456": ["subj_789", "subj_101"],
    "class_789": ["subj_202"]
  }
}
```

#### Admin Access (Admins/Markers)
```typescript
{
  "inst_123": 1,  // has admin access
  "inst_456": 0   // no admin access
}
```

## 🔐 Authentication Flow

### 1. Login Process

```typescript
// Login endpoint
@Post('login')
async login(@Body() loginDto: LoginDto): Promise<LoginResponse> {
  const user = await this.authService.validateUser(loginDto.email, loginDto.password);
  const payload = await this.buildJwtPayload(user);
  const access_token = this.jwtService.sign(payload);
  
  return {
    access_token,
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      userType: user.userType,
      accessStructure: await this.buildAccessStructure(user)
    }
  };
}
```

### 2. JWT Payload Builder

```typescript
async buildJwtPayload(user: UserEntity): Promise<JwtPayload> {
  const payload: JwtPayload = {
    s: user.id,
    ut: toCompactUserType(user.userType),
    iat: Math.floor(Date.now() / 1000)
  };

  switch (user.userType) {
    case UserType.INSTITUTE_ADMIN:
    case UserType.ATTENDANCE_MARKER:
      payload.aa = await this.buildAdminAccess(user);
      break;
      
    case UserType.TEACHER:
    case UserType.STUDENT:
      payload.ha = await this.buildHierarchicalAccess(user);
      break;
      
    case UserType.PARENT:
      payload.sd = await this.getStudentIds(user);
      break;
  }

  return payload;
}
```

### 3. Password Security

```typescript
// Latest bcrypt v6 patterns
async hashPassword(password: string): Promise<string> {
  const pepper = this.configService.get<string>('PASSWORD_PEPPER', '');
  const saltRounds = parseInt(this.configService.get<string>('BCRYPT_SALT_ROUNDS', '12'), 10);
  
  return await bcrypt.hash(password + pepper, saltRounds);
}

async comparePassword(password: string, hash: string): Promise<boolean> {
  const pepper = this.configService.get<string>('PASSWORD_PEPPER', '');
  return await bcrypt.compare(password + pepper, hash);
}
```

## 🛡️ Authorization System

### Guards Architecture

```typescript
// Required guards for all protected endpoints
@UseGuards(JwtAuthGuard, EnhancedRolesGuard)
export class ProtectedController {
  // Your protected routes
}
```

### JWT Authentication Guard

```typescript
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
```

### Enhanced Roles Guard

```typescript
@Injectable()
export class EnhancedRolesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private accessService: AccessService
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user: JwtPayloadWithAccess = request.user;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    // Validate decorators
    return this.validateDecorators(context, user, request);
  }
}
```

### JWT Strategy

```typescript
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    @InjectRepository(UserEntity)
    private userRepository: Repository<UserEntity>
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload) {
    // Validate ultra-compact JWT structure
    if (!payload?.s || !payload?.ut) {
      throw new UnauthorizedException('Invalid token payload');
    }

    const user = await this.userRepository.findOne({ 
      where: { id: payload.s } 
    });
    
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Convert to application format
    return {
      id: payload.s,
      userId: payload.s,
      sub: payload.s,
      email: user.email,
      userType: fromCompactUserType(payload.ut),
      firstName: user.firstName,
      lastName: user.lastName,
      adminAccess: payload.aa,
      hierarchicalAccess: payload.ha,
      studentIds: payload.sd,
      instituteAccess: payload.aa || []
    };
  }
}
```

## 🎭 Validation Decorators

### Role Validation

```typescript
@ValidateRole(UserType.TEACHER, UserType.INSTITUTE_ADMIN)
@Get('protected-route')
getProtectedData() {
  return { message: 'Access granted' };
}
```

### Institute Access Validation

```typescript
@ValidateInstituteAccess('instituteId')
@Get('institutes/:instituteId/data')
getInstituteData(@Param('instituteId') instituteId: string) {
  return { instituteId, message: 'Institute data' };
}
```

### Class Access Validation

```typescript
@ValidateClassAccess('instituteId', 'classId')
@Get('institutes/:instituteId/classes/:classId/students')
getClassStudents(
  @Param('instituteId') instituteId: string,
  @Param('classId') classId: string
) {
  return { classId, message: 'Class students' };
}
```

### Subject Access Validation

```typescript
@ValidateSubjectAccess('instituteId', 'classId', 'subjectId')
@Post('institutes/:instituteId/classes/:classId/subjects/:subjectId/assignments')
createAssignment(
  @Param('instituteId') instituteId: string,
  @Param('classId') classId: string,
  @Param('subjectId') subjectId: string,
  @Body() assignmentDto: CreateAssignmentDto
) {
  return { message: 'Assignment created' };
}
```

### Combined Validations

```typescript
@ValidateRole(UserType.TEACHER, UserType.INSTITUTE_ADMIN)
@ValidateInstituteAccess('instituteId')
@ValidateClassAccess('instituteId', 'classId')
@ValidateSubjectAccess('instituteId', 'classId', 'subjectId')
@Validate(() => console.log('All validations passed'))
@Post('complex-endpoint/:instituteId/:classId/:subjectId')
complexOperation(
  @Param('instituteId') instituteId: string,
  @Param('classId') classId: string,
  @Param('subjectId') subjectId: string
) {
  return { message: 'Complex operation completed' };
}
```

## 🏗️ Microservices Integration

### 1. Shared JWT Module

```typescript
// shared-jwt.module.ts
@Module({
  imports: [
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: { 
          expiresIn: config.get<string>('JWT_EXPIRES_IN', '24h')
        },
      }),
    }),
  ],
  providers: [JwtStrategy, JwtAuthGuard, EnhancedRolesGuard, AccessService],
  exports: [JwtModule, JwtStrategy, JwtAuthGuard, EnhancedRolesGuard, AccessService],
})
export class SharedJwtModule {}
```

### 2. Microservice Implementation

```typescript
// user-microservice.module.ts
@Module({
  imports: [
    SharedJwtModule,
    // other imports
  ],
  controllers: [UserController],
  providers: [UserService],
})
export class UserMicroserviceModule {}

// user.controller.ts
@Controller('users')
@UseGuards(JwtAuthGuard, EnhancedRolesGuard)
export class UserController {
  @ValidateRole(UserType.INSTITUTE_ADMIN)
  @ValidateInstituteAccess('instituteId')
  @Get('institutes/:instituteId/users')
  getInstituteUsers(@Param('instituteId') instituteId: string) {
    return this.userService.getInstituteUsers(instituteId);
  }
}
```

### 3. Inter-Service Communication

```typescript
// jwt-validation.service.ts
@Injectable()
export class JwtValidationService {
  constructor(private jwtService: JwtService) {}

  async validateToken(token: string): Promise<JwtPayloadWithAccess> {
    try {
      const payload = await this.jwtService.verifyAsync(token);
      return this.transformPayload(payload);
    } catch (error) {
      throw new UnauthorizedException('Invalid token');
    }
  }

  private transformPayload(payload: JwtPayload): JwtPayloadWithAccess {
    return {
      id: payload.s,
      userId: payload.s,
      sub: payload.s,
      userType: fromCompactUserType(payload.ut),
      adminAccess: payload.aa,
      hierarchicalAccess: payload.ha,
      studentIds: payload.sd,
    };
  }
}
```

## 📝 Best Practices

### 1. Environment Configuration

```bash
# .env
JWT_SECRET=your-super-secure-secret-key-256-bits
JWT_EXPIRES_IN=24h
BCRYPT_SALT_ROUNDS=12
PASSWORD_PEPPER=your-password-pepper
```

### 2. Error Handling

```typescript
// Global exception filter
@Catch(UnauthorizedException, ForbiddenException)
export class AuthExceptionFilter implements ExceptionFilter {
  catch(exception: UnauthorizedException | ForbiddenException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    
    const status = exception instanceof UnauthorizedException ? 401 : 403;
    
    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      message: exception.message,
      error: status === 401 ? 'Unauthorized' : 'Forbidden'
    });
  }
}
```

### 3. Rate Limiting

```typescript
// Rate limiting for auth endpoints
@UseGuards(ThrottlerGuard)
@Throttle(5, 60) // 5 requests per minute
@Post('login')
async login(@Body() loginDto: LoginDto) {
  return this.authService.login(loginDto);
}
```

### 4. Audit Logging

```typescript
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    
    if (user) {
      console.log(`User ${user.id} accessed ${request.route.path}`);
    }
    
    return next.handle();
  }
}
```

## 💻 Implementation Examples

### Complete Controller Example

```typescript
@Controller('institutes')
@UseGuards(JwtAuthGuard, EnhancedRolesGuard)
@UseInterceptors(AuditInterceptor)
export class InstituteController {
  constructor(private instituteService: InstituteService) {}

  // Only institute admins can create institutes
  @ValidateRole(UserType.INSTITUTE_ADMIN, UserType.SUPER_ADMIN)
  @Post()
  async create(@Body() createDto: CreateInstituteDto) {
    return this.instituteService.create(createDto);
  }

  // Users must have access to the specific institute
  @ValidateInstituteAccess('id')
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.instituteService.findOne(id);
  }

  // Teachers and admins can view class data
  @ValidateRole(UserType.TEACHER, UserType.INSTITUTE_ADMIN)
  @ValidateInstituteAccess('instituteId')
  @ValidateClassAccess('instituteId', 'classId')
  @Get(':instituteId/classes/:classId')
  async getClass(
    @Param('instituteId') instituteId: string,
    @Param('classId') classId: string
  ) {
    return this.instituteService.getClass(instituteId, classId);
  }

  // Subject-specific operations
  @ValidateRole(UserType.TEACHER)
  @ValidateSubjectAccess('instituteId', 'classId', 'subjectId')
  @Post(':instituteId/classes/:classId/subjects/:subjectId/assignments')
  async createAssignment(
    @Param('instituteId') instituteId: string,
    @Param('classId') classId: string,
    @Param('subjectId') subjectId: string,
    @Body() assignmentDto: CreateAssignmentDto
  ) {
    return this.instituteService.createAssignment(
      instituteId, 
      classId, 
      subjectId, 
      assignmentDto
    );
  }

  // Manual access validation for complex scenarios
  @ValidateRole(UserType.PARENT)
  @Get('student/:studentId/progress')
  async getStudentProgress(
    @Param('studentId') studentId: string,
    @Request() req
  ) {
    const user = req.user;
    
    // Parents can only access their own students
    if (!user.studentIds?.includes(studentId)) {
      throw new ForbiddenException('Access denied to student data');
    }
    
    return this.instituteService.getStudentProgress(studentId);
  }
}
```

### Service Layer Integration

```typescript
@Injectable()
export class InstituteService {
  constructor(
    @InjectRepository(InstituteEntity)
    private instituteRepository: Repository<InstituteEntity>,
    private accessService: AccessService
  ) {}

  async findUserInstitutes(user: JwtPayloadWithAccess): Promise<InstituteEntity[]> {
    let instituteIds: string[] = [];

    // Get institute IDs based on access type
    if (user.adminAccess) {
      instituteIds = Object.keys(user.adminAccess);
    } else if (user.hierarchicalAccess) {
      instituteIds = Object.keys(user.hierarchicalAccess);
    }

    return this.instituteRepository.findByIds(instituteIds);
  }

  async validateUserAccess(
    user: JwtPayloadWithAccess, 
    instituteId: string, 
    classId?: string, 
    subjectId?: string
  ): Promise<boolean> {
    if (!this.accessService.validateInstituteAccess(user, instituteId)) {
      return false;
    }

    if (classId && !this.accessService.validateClassAccess(user, instituteId, classId)) {
      return false;
    }

    if (subjectId && !this.accessService.validateSubjectAccess(user, instituteId, classId, subjectId)) {
      return false;
    }

    return true;
  }
}
```

## 🔄 Migration Guide

### From Legacy JWT to Ultra-Compact

1. **Update JWT Payload Interface**
```typescript
// Old
interface OldJwtPayload {
  sub: string;
  email: string;
  userType: string;
  institutes: ComplexStructure[];
}

// New
interface JwtPayload {
  s: string;    // subject
  ut: string;   // user type
  ha?: HierarchicalAccess;
  aa?: AdminAccess;
  iat: number;
}
```

2. **Update Strategy Validation**
```typescript
// Update validate method in jwt.strategy.ts
async validate(payload: JwtPayload) {
  // Convert compact to application format
  return {
    id: payload.s,
    userId: payload.s,
    userType: fromCompactUserType(payload.ut),
    // ... other fields
  };
}
```

3. **Update Guards and Decorators**
```typescript
// Replace old guard usage
@UseGuards(OldAuthGuard, OldRolesGuard) // Old
@UseGuards(JwtAuthGuard, EnhancedRolesGuard) // New

// Replace old decorators
@Roles(UserType.TEACHER) // Old
@ValidateRole(UserType.TEACHER) // New
```

## 🚀 Performance Optimizations

### 1. Token Size Reduction
- Ultra-compact payload reduces token size by ~60%
- Shorter property names (`s` vs `subject`)
- Numeric flags instead of booleans (`1/0` vs `true/false`)

### 2. Validation Caching
```typescript
@Injectable()
export class CachedAccessService extends AccessService {
  private cache = new Map<string, boolean>();

  validateInstituteAccess(user: JwtPayloadWithAccess, instituteId: string): boolean {
    const cacheKey = `${user.userId}-${instituteId}`;
    
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }
    
    const result = super.validateInstituteAccess(user, instituteId);
    this.cache.set(cacheKey, result);
    
    return result;
  }
}
```

### 3. Lazy Loading
```typescript
// Only load user data when needed
async validate(payload: JwtPayload) {
  // Basic validation without DB query
  if (!payload?.s || !payload?.ut) {
    throw new UnauthorizedException('Invalid token');
  }

  // Return minimal user object
  return {
    id: payload.s,
    userType: fromCompactUserType(payload.ut),
    // Load other data lazily when needed
  };
}
```

## 🛠️ Testing

### Unit Tests

```typescript
describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let userRepository: Repository<UserEntity>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        {
          provide: getRepositoryToken(UserEntity),
          useValue: mockRepository,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    strategy = module.get<JwtStrategy>(JwtStrategy);
    userRepository = module.get<Repository<UserEntity>>(getRepositoryToken(UserEntity));
  });

  it('should validate compact JWT payload', async () => {
    const payload: JwtPayload = {
      s: 'user123',
      ut: 'TE',
      ha: { 'inst1': { 'class1': ['subj1'] } },
      iat: Math.floor(Date.now() / 1000)
    };

    const user = { id: 'user123', email: 'test@example.com' };
    jest.spyOn(userRepository, 'findOne').mockResolvedValue(user as UserEntity);

    const result = await strategy.validate(payload);

    expect(result.id).toBe('user123');
    expect(result.userType).toBe(UserType.TEACHER);
  });
});
```

### Integration Tests

```typescript
describe('AuthController (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/auth/login (POST)', () => {
    return request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'test@example.com', password: 'password' })
      .expect(201)
      .expect((res) => {
        expect(res.body.access_token).toBeDefined();
        expect(res.body.user.userType).toBeDefined();
      });
  });

  it('/protected (GET) should require authentication', () => {
    return request(app.getHttpServer())
      .get('/protected')
      .expect(401);
  });

  it('/protected (GET) should work with valid token', () => {
    const token = 'valid-jwt-token';
    
    return request(app.getHttpServer())
      .get('/protected')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });
});
```

## 📖 Additional Resources

- [NestJS JWT Documentation](https://docs.nestjs.com/security/authentication)
- [Passport JWT Strategy](http://www.passportjs.org/packages/passport-jwt/)
- [bcrypt Security Guide](https://github.com/kelektiv/node.bcrypt.js)
- [JWT Best Practices](https://tools.ietf.org/html/rfc7519)

## 🤝 Contributing

1. Follow the established patterns in this guide
2. Add tests for new validation decorators
3. Update documentation for any interface changes
4. Ensure backward compatibility where possible

---

**Note**: This architecture guide is designed for NestJS v11+ with the latest JWT and bcrypt packages. Ensure your dependencies match the versions specified in the project's package.json.
