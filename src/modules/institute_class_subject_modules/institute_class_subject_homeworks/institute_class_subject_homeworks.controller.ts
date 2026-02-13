import { ParseBigIntPipe } from '../../../common/pipes/parse-bigint.pipe';
import { Controller, Get, Post, Body, Patch, Param, Delete, Query, HttpStatus, HttpCode, ValidationPipe, UsePipes, UseGuards, Request, UseInterceptors } from '@nestjs/common';
import { 
  ApiTags, 
  ApiOperation, 
  ApiResponse, 
  ApiParam, 
  ApiQuery,
  ApiBody,
  ApiBearerAuth
} from '@nestjs/swagger';
import { InstituteClassSubjectHomeworksService } from './institute_class_subject_homeworks.service';
import { CreateInstituteClassSubjectHomeworkDto } from './dto/create-institute_class_subject_homework.dto';
import { UpdateInstituteClassSubjectHomeworkDto } from './dto/update-institute_class_subject_homework.dto';
import { QueryInstituteClassSubjectHomeworkDto } from './dto/query-institute-class-subject-homework.dto';
import { InstituteClassSubjectHomeworkResponseDto, PaginatedInstituteClassSubjectHomeworkResponseDto } from './dto/institute-class-subject-homework-response.dto';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { FlexibleAccessGuard } from '../../../auth/guards/flexible-access.guard';
import { RequireAnyOfRoles } from '../../../auth/decorators/flexible-access.decorator';
import { UserType } from '../../user/enums/user-type.enum';
import { SerializeDatesInterceptor } from './interceptors/serialize-dates.interceptor';


/**
 * Institute Class Subject Homeworks Controller
 * 
 * PERFORMANCE OPTIMIZATIONS IMPLEMENTED:
 * =====================================
 * 
 * 1. **Single Query Architecture**:
 *    - All routes use unified findAll() method with single optimized QueryBuilder
 *    - /institute/:id, /teacher/:id, /class/:id/subject/:id routes leverage same optimization
 *    - Eliminated N+1 query problems through consolidated JOINs
 * 
 * 2. **Separated Concerns**:
 *    - Homework data completely separate from submissions
 *    - No submission data loaded by default (use dedicated submission endpoints)
 *    - Fast, lightweight homework queries without submission overhead
 * 
 * 3. **Advanced Filtering & Search**:
 *    - Full-text search in title and description
 *    - Date range filtering (fromDate/toDate)
 *    - Multi-dimensional filtering (institute, class, subject, teacher)
 *    - Flexible pagination and sorting with proper defaults
 * 
 * 4. **Comprehensive API Documentation**:
 *    - Detailed examples for all query parameters
 *    - Performance notes highlighting optimizations
 *    - Clear usage examples for complex filtering scenarios
 * 
 * USAGE EXAMPLES:
 * ==============
 * - GET /homeworks?instituteId=44&classId=40&search=mathematics
 * - GET /homeworks/teacher/40?fromDate=2025-08-01&toDate=2025-08-31
 * - GET /homeworks/institute/44?page=1&limit=20&sortBy=startDate
 * 
 * SUBMISSION DATA:
 * ===============
 * For homework submissions, use the dedicated submission endpoints:
 * - /homework-submissions - avoid loading all submission data with homework queries
 * - This separation ensures optimal performance for homework listing operations
 */
@ApiTags('Institute Class Subject Homeworks')
@Controller('institute-class-subject-homeworks')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@UsePipes(new ValidationPipe({ transform: true }))
@UseInterceptors(SerializeDatesInterceptor)
export class InstituteClassSubjectHomeworksController {
  constructor(private readonly instituteClassSubjectHomeworksService: InstituteClassSubjectHomeworksService) {}

  @Post()
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true, teacher: true })
  @ApiOperation({ 
    summary: 'Create a new homework assignment (Institute Admin or Teacher)',
    description: 'Creates a new homework assignment with optimized response including related entity details. Access validation for institute/class/subject is done in service layer.'
  })
  @ApiResponse({ 
    status: HttpStatus.CREATED, 
    description: 'Homework created successfully',
    type: InstituteClassSubjectHomeworkResponseDto
  })
  @ApiBody({ type: CreateInstituteClassSubjectHomeworkDto })
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() createInstituteClassSubjectHomeworkDto: CreateInstituteClassSubjectHomeworkDto): Promise<InstituteClassSubjectHomeworkResponseDto> {
    return this.instituteClassSubjectHomeworksService.create(createInstituteClassSubjectHomeworkDto);
  }

  @Get()
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ anyInstituteRole: true })
  @ApiOperation({ 
    summary: 'Get all homework assignments (Optimized)', 
    description: `Retrieves homework assignments with advanced filtering, pagination, and search capabilities.
    
**Performance Optimizations:**
- Single query with all joins for optimal performance
- Efficient filtering using proper database indexes
- No submission data included by default (use includeSubmissions=true)
- Consistent sorting with secondary ordering

**Usage Examples:**
- \`GET /homeworks?instituteId=44&classId=40&search=mathematics\`
- \`GET /homeworks?teacherId=40&fromDate=2025-08-01&toDate=2025-08-31\`
- \`GET /homeworks?page=1&limit=20&sortBy=startDate&sortOrder=ASC\`
- \`GET /homeworks?classId=40&includeReferences=true&includeSubmissions=true\` (get complete view)

**Include Options:**
- \`includeReferences=true\` - Include reference materials (videos, PDFs, links)
- \`includeSubmissions=true\` - Include submissions (automatically filtered by JWT userId)

**Note:** Submissions are ALWAYS filtered by the authenticated user's ID from JWT token for security.
Students see their own submissions automatically. Do NOT pass userId parameter.` 
  })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Homeworks retrieved successfully with optimized performance',
    type: PaginatedInstituteClassSubjectHomeworkResponseDto
  })
  @ApiQuery({ name: 'instituteId', required: false, description: 'Filter by institute ID', example: '44' })
  @ApiQuery({ name: 'classId', required: false, description: 'Filter by class ID', example: '40' })
  @ApiQuery({ name: 'subjectId', required: false, description: 'Filter by subject ID', example: '40' })
  @ApiQuery({ name: 'teacherId', required: false, description: 'Filter by teacher ID', example: '40' })
  @ApiQuery({ name: 'search', required: false, description: 'Search in title or description', example: 'mathematics homework' })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean, description: 'Filter by active status', example: true })
  @ApiQuery({ name: 'fromDate', required: false, description: 'Filter from start date (YYYY-MM-DD)', example: '2025-08-01' })
  @ApiQuery({ name: 'toDate', required: false, description: 'Filter to end date (YYYY-MM-DD)', example: '2025-08-31' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number for pagination', example: 1 })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page (max 100)', example: 10 })
  @ApiQuery({ name: 'sortBy', required: false, description: 'Sort field', enum: ['title', 'startDate', 'endDate', 'createdAt'], example: 'startDate' })
  @ApiQuery({ name: 'sortOrder', required: false, description: 'Sort order', enum: ['ASC', 'DESC'], example: 'DESC' })
  @ApiQuery({ name: 'includeReferences', required: false, type: Boolean, description: 'Include reference materials (videos, PDFs, etc.)', example: true })
  @ApiQuery({ name: 'includeSubmissions', required: false, type: Boolean, description: 'Include submissions (automatically filtered by JWT userId)', example: true })
  @HttpCode(HttpStatus.OK)
  async findAll(@Query() query: QueryInstituteClassSubjectHomeworkDto, @Request() req: any): Promise<PaginatedInstituteClassSubjectHomeworkResponseDto> {
    return this.instituteClassSubjectHomeworksService.findAll(query, req.user);
  }

  @Get('class/:classId/subject/:subjectId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ anyInstituteRole: true })
  @ApiOperation({ 
    summary: 'Get homeworks by class and subject (Optimized)', 
    description: `Retrieves homework assignments for a specific class and subject with optional additional filtering.
    
**Performance Optimizations:**
- Uses the same optimized single-query architecture as the main endpoint
- All query parameters from the main \`findAll\` endpoint can be used here as well
- Fast, efficient filtering with proper database indexes

**Additional Filters:** All query parameters from the main \`findAll\` endpoint work here too.` 
  })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Class homeworks retrieved successfully with optimized performance',
    type: PaginatedInstituteClassSubjectHomeworkResponseDto
  })
  @ApiParam({ name: 'classId', description: 'Class ID', example: '40' })
  @ApiParam({ name: 'subjectId', description: 'Subject ID', example: '40' })
  @ApiQuery({ name: 'instituteId', required: false, description: 'Additional filter by institute ID', example: '44' })
  @ApiQuery({ name: 'teacherId', required: false, description: 'Filter by teacher ID', example: '40' })
  @ApiQuery({ name: 'search', required: false, description: 'Search in title or description', example: 'homework' })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean, description: 'Filter by active status', example: true })
  @ApiQuery({ name: 'fromDate', required: false, description: 'Filter from start date (YYYY-MM-DD)', example: '2025-08-01' })
  @ApiQuery({ name: 'toDate', required: false, description: 'Filter to end date (YYYY-MM-DD)', example: '2025-08-31' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number for pagination', example: 1 })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page', example: 10 })
  @ApiQuery({ name: 'sortBy', required: false, description: 'Sort field', enum: ['title', 'startDate', 'endDate', 'createdAt'], example: 'startDate' })
  @ApiQuery({ name: 'sortOrder', required: false, description: 'Sort order', enum: ['ASC', 'DESC'], example: 'DESC' })
  @HttpCode(HttpStatus.OK)
  async findByClassAndSubject(
    @Param('classId', ParseBigIntPipe) classId: string, 
    @Param('subjectId', ParseBigIntPipe) subjectId: string,
    @Query() query: QueryInstituteClassSubjectHomeworkDto,
    @Request() req: any
  ): Promise<PaginatedInstituteClassSubjectHomeworkResponseDto> {
    // Add class and subject filters to query and use optimized findAll method
    query.classId = classId;
    query.subjectId = subjectId;
    return this.instituteClassSubjectHomeworksService.findAll(query, req.user);
  }

  @Get('institute/:instituteId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ anyInstituteRole: true })
  @ApiOperation({ 
    summary: 'Get homeworks by institute (Optimized)', 
    description: `Retrieves homework assignments for a specific institute with optional additional filtering.
    
**Performance Optimizations:**
- Single query with all joins
- Efficient filtering using proper indexes
- All query parameters from the main \`findAll\` endpoint can be used here as well

**Additional Filters:** All query parameters from the main \`findAll\` endpoint work here too.` 
  })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Institute homeworks retrieved successfully with optimized performance',
    type: PaginatedInstituteClassSubjectHomeworkResponseDto
  })
  @ApiParam({ name: 'instituteId', description: 'Institute ID', example: '44' })
  @ApiQuery({ name: 'classId', required: false, description: 'Filter by class ID', example: '40' })
  @ApiQuery({ name: 'subjectId', required: false, description: 'Filter by subject ID', example: '40' })
  @ApiQuery({ name: 'teacherId', required: false, description: 'Filter by teacher ID', example: '40' })
  @ApiQuery({ name: 'search', required: false, description: 'Search in title or description', example: 'mathematics' })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean, description: 'Filter by active status', example: true })
  @ApiQuery({ name: 'fromDate', required: false, description: 'Filter from start date (YYYY-MM-DD)', example: '2025-08-01' })
  @ApiQuery({ name: 'toDate', required: false, description: 'Filter to end date (YYYY-MM-DD)', example: '2025-08-31' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number for pagination', example: 1 })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page', example: 10 })
  @ApiQuery({ name: 'sortBy', required: false, description: 'Sort field', enum: ['title', 'startDate', 'endDate', 'createdAt'], example: 'startDate' })
  @ApiQuery({ name: 'sortOrder', required: false, description: 'Sort order', enum: ['ASC', 'DESC'], example: 'DESC' })
  @HttpCode(HttpStatus.OK)
  async findByInstitute(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Query() query: QueryInstituteClassSubjectHomeworkDto,
    @Request() req: any
  ): Promise<PaginatedInstituteClassSubjectHomeworkResponseDto> {
    // Add institute filter to query and use optimized findAll method
    query.instituteId = instituteId;
    return this.instituteClassSubjectHomeworksService.findAll(query, req.user);
  }

  @Get('teacher/:teacherId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ anyInstituteRole: true })
  @ApiOperation({ 
    summary: 'Get homeworks by teacher (Optimized)', 
    description: `Retrieves homework assignments for a specific teacher with optional additional filtering.
    
**Performance Optimizations:**
- Single query with all joins
- Efficient filtering using proper indexes
- All query parameters from the main \`findAll\` endpoint can be used here as well

**Additional Filters:** All query parameters from the main \`findAll\` endpoint work here too.` 
  })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Teacher homeworks retrieved successfully with optimized performance',
    type: PaginatedInstituteClassSubjectHomeworkResponseDto
  })
  @ApiParam({ name: 'teacherId', description: 'Teacher ID', example: '40' })
  @ApiQuery({ name: 'instituteId', required: false, description: 'Filter by institute ID', example: '44' })
  @ApiQuery({ name: 'classId', required: false, description: 'Filter by class ID', example: '40' })
  @ApiQuery({ name: 'subjectId', required: false, description: 'Filter by subject ID', example: '40' })
  @ApiQuery({ name: 'search', required: false, description: 'Search in title or description', example: 'assignment' })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean, description: 'Filter by active status', example: true })
  @ApiQuery({ name: 'fromDate', required: false, description: 'Filter from start date (YYYY-MM-DD)', example: '2025-08-01' })
  @ApiQuery({ name: 'toDate', required: false, description: 'Filter to end date (YYYY-MM-DD)', example: '2025-08-31' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number for pagination', example: 1 })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page', example: 10 })
  @ApiQuery({ name: 'sortBy', required: false, description: 'Sort field', enum: ['title', 'startDate', 'endDate', 'createdAt'], example: 'startDate' })
  @ApiQuery({ name: 'sortOrder', required: false, description: 'Sort order', enum: ['ASC', 'DESC'], example: 'DESC' })
  @HttpCode(HttpStatus.OK)
  async findByTeacher(
    @Param('teacherId', ParseBigIntPipe) teacherId: string,
    @Query() query: QueryInstituteClassSubjectHomeworkDto,
    @Request() req: any
  ): Promise<PaginatedInstituteClassSubjectHomeworkResponseDto> {
    // Add teacher filter to query and use optimized findAll method
    query.teacherId = teacherId;
    return this.instituteClassSubjectHomeworksService.findAll(query, req.user);
  }

  @Get(':id')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ anyInstituteRole: true })
  @ApiOperation({ 
    summary: 'Get homework by ID (Optimized)', 
    description: 'Retrieves a single homework assignment with all related data in one optimized query' 
  })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Homework retrieved successfully',
    type: InstituteClassSubjectHomeworkResponseDto
  })
  @ApiResponse({ 
    status: HttpStatus.NOT_FOUND, 
    description: 'Homework not found' 
  })
  @ApiParam({ name: 'id', description: 'Homework ID', example: '123' })
  @HttpCode(HttpStatus.OK)
  async findOne(@Param('id', ParseBigIntPipe) id: string, @Request() req: any): Promise<InstituteClassSubjectHomeworkResponseDto> {
    return this.instituteClassSubjectHomeworksService.findOne(id, req.user);
  }

  @Patch(':id')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true, teacher: true })
  @ApiOperation({ 
    summary: 'Update homework (Institute Admin or Teacher)', 
    description: 'Updates a homework assignment and returns the updated data with all relations in optimized queries. Access validation for institute/class/subject is done in service layer.' 
  })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Homework updated successfully',
    type: InstituteClassSubjectHomeworkResponseDto
  })
  @ApiResponse({ 
    status: HttpStatus.NOT_FOUND, 
    description: 'Homework not found' 
  })
  @ApiParam({ name: 'id', description: 'Homework ID', example: '123' })
  @ApiBody({ type: UpdateInstituteClassSubjectHomeworkDto })
  @HttpCode(HttpStatus.OK)
  async update(
    @Param('id', ParseBigIntPipe) id: string, 
    @Body() updateInstituteClassSubjectHomeworkDto: UpdateInstituteClassSubjectHomeworkDto,
    @Request() req: any
  ): Promise<InstituteClassSubjectHomeworkResponseDto> {
    return this.instituteClassSubjectHomeworksService.update(id, updateInstituteClassSubjectHomeworkDto, req.user);
  }

  @Get('user/:userId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ student: {}, parent: {}, anyInstituteRole: true })
  @ApiOperation({ 
    summary: 'Get user homeworks with submissions and references', 
    description: 'Retrieves all homeworks for specified institute/class/subject with user submissions and reference materials. Parents can access their children homeworks via JWT validation.' 
  })
  @ApiParam({ name: 'userId', description: 'User ID', example: '123' })
  @ApiQuery({ name: 'instituteId', required: true, description: 'Institute ID', example: '1' })
  @ApiQuery({ name: 'classId', required: true, description: 'Class ID', example: '2' })
  @ApiQuery({ name: 'subjectId', required: true, description: 'Subject ID', example: '3' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (default: 1)', example: 1 })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page (default: 20)', example: 20 })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Homeworks retrieved successfully with submissions and references',
    schema: {
      example: {
        data: [
          {
            id: "123",
            instituteId: "1",
            classId: "2",
            subjectId: "3",
            teacherId: "4",
            title: "Essay Assignment",
            description: "Write an essay about climate change",
            startDate: "2024-01-10T00:00:00Z",
            endDate: "2024-01-20T23:59:59Z",
            isActive: true,
            mySubmissions: [
              {
                id: "456",
                submissionDate: "2024-01-15T10:30:00Z",
                fileUrl: "https://storage.googleapis.com/.../submission.pdf",
                teacherCorrectionFileUrl: "https://storage.googleapis.com/.../correction.pdf",
                remarks: "Good work, but needs improvement"
              }
            ],
            references: [
              {
                id: "789",
                title: "Climate Change Research Paper",
                fileUrl: "https://storage.googleapis.com/.../reference.pdf",
                orderIndex: 1
              }
            ]
          }
        ],
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1
      }
    }
  })
  @HttpCode(HttpStatus.OK)
  async getUserHomeworks(
    @Param('userId', ParseBigIntPipe) userId: string,
    @Query('instituteId') instituteId: string,
    @Query('classId') classId: string,
    @Query('subjectId') subjectId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Request() req?: any
  ) {
    return this.instituteClassSubjectHomeworksService.findUserHomeworksWithSubmissionsAndReferences(
      instituteId,
      classId,
      subjectId,
      userId,
      page,
      limit,
      req.user
    );
  }

  @Delete(':id')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true, teacher: true })
  @ApiOperation({ 
    summary: 'Soft delete homework (Institute Admin or Teacher)', 
    description: 'Soft deletes a homework assignment by setting isActive to false (preserves data for audit purposes). Access validation for institute/class/subject is done in service layer.' 
  })
  @ApiResponse({ 
    status: HttpStatus.NO_CONTENT, 
    description: 'Homework soft deleted successfully' 
  })
  @ApiResponse({ 
    status: HttpStatus.NOT_FOUND, 
    description: 'Homework not found' 
  })
  @ApiParam({ name: 'id', description: 'Homework ID', example: '123' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id', ParseBigIntPipe) id: string,
    @Request() req: any
  ): Promise<void> {
    return this.instituteClassSubjectHomeworksService.remove(id, req.user);
  }
}
