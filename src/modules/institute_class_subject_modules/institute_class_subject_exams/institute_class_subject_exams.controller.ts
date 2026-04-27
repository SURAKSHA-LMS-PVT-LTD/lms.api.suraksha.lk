import { ParseBigIntPipe } from '../../../common/pipes/parse-bigint.pipe';
import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards, HttpStatus, HttpCode, ValidationPipe, UsePipes, Request, UseInterceptors } from '@nestjs/common';
import { 
  ApiTags, 
  ApiOperation, 
  ApiResponse, 
  ApiParam, 
  ApiQuery,
  ApiBearerAuth,
  ApiBody
} from '@nestjs/swagger';
import { InstituteClassSubjectExamsService } from './institute_class_subject_exams.service';
import { CreateInstituteClassSubjectExamDto } from './dto/create-institute_class_subject_exam.dto';
import { UpdateInstituteClassSubjectExamDto } from './dto/update-institute_class_subject_exam.dto';
import { QueryInstituteClassSubjectExamDto } from './dto/query-institute-class-subject-exam.dto';
import { InstituteClassSubjectExamResponseDto } from './dto/institute-class-subject-exam-response.dto';
import { PaginatedInstituteClassSubjectExamResponseDto } from './dto/paginated-institute-class-subject-exam-response.dto';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { FlexibleAccessGuard } from '../../../auth/guards/flexible-access.guard';
import { RequireAnyOfRoles } from '../../../auth/decorators/flexible-access.decorator';
import { UserType } from '../../user/enums/user-type.enum';
import { SerializeDatesInterceptor } from './interceptors/serialize-dates.interceptor';


@ApiTags('Institute Class Subject Exams')
@UseInterceptors(SerializeDatesInterceptor)
@Controller('institute-class-subject-exams')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@UsePipes(new ValidationPipe({ transform: true }))
export class InstituteClassSubjectExamsController {
  constructor(private readonly instituteClassSubjectExamsService: InstituteClassSubjectExamsService) {}

  @Post()
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true, teacher: true })
  @ApiOperation({ 
    summary: 'Create a new exam (Institute Admin or Teacher)', 
    description: 'Creates a new institute class subject exam. Access validation for institute/class/subject is done in service layer.' 
  })
  @ApiResponse({ 
    status: HttpStatus.CREATED, 
    description: 'Exam created successfully',
    type: InstituteClassSubjectExamResponseDto 
  })
  @ApiResponse({ 
    status: HttpStatus.BAD_REQUEST, 
    description: 'Invalid input data' 
  })
  @ApiResponse({ 
    status: HttpStatus.UNAUTHORIZED, 
    description: 'Unauthorized' 
  })
  @ApiBody({ type: CreateInstituteClassSubjectExamDto })
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() createInstituteClassSubjectExamDto: CreateInstituteClassSubjectExamDto,
    @Request() req: any
  ): Promise<InstituteClassSubjectExamResponseDto> {
    const currentUserId = req.user?.s || req.user?.userId;
    return this.instituteClassSubjectExamsService.create(createInstituteClassSubjectExamDto, currentUserId);
  }

  @Get()
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ anyInstituteRole: true })
  @ApiOperation({ 
    summary: 'Get all exams with filtering and pagination', 
    description: `Retrieves all institute class subject exams with comprehensive filtering options:
    
**Filter Options:**
- \`instituteId\`: Filter by specific institute
- \`classId\`: Filter by specific class
- \`subjectId\`: Filter by specific subject
- \`examType\`: Filter by exam type (online/physical)
- \`status\`: Filter by exam status (draft/scheduled/active/completed/cancelled)
- \`fromDate\` & \`toDate\`: Filter by date range
- \`isActive\`: Filter by active status
- \`createdBy\`: Filter by creator
- \`search\`: Search in title or description

**Pagination:**
- \`page\`: Page number (default: 1)
- \`limit\`: Items per page (default: 10)

**Sorting:**
- \`sortBy\`: Sort field (scheduleDate, title, examType, status, etc.)
- \`sortOrder\`: ASC or DESC (default: ASC)

**Performance Features:**
- Single optimized query with all joins
- Proper indexing for fast filtering
- Efficient pagination
` 
  })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Exams retrieved successfully with applied filters',
    type: PaginatedInstituteClassSubjectExamResponseDto 
  })
  @ApiResponse({ 
    status: HttpStatus.UNAUTHORIZED, 
    description: 'Unauthorized' 
  })
  @ApiQuery({ name: 'instituteId', required: false, description: 'Filter by institute ID', example: '44' })
  @ApiQuery({ name: 'classId', required: false, description: 'Filter by class ID', example: '40' })
  @ApiQuery({ name: 'subjectId', required: false, description: 'Filter by subject ID', example: '40' })
  @ApiQuery({ name: 'examType', required: false, enum: ['online', 'physical'], description: 'Filter by exam type', example: 'physical' })
  @ApiQuery({ name: 'status', required: false, enum: ['draft', 'scheduled', 'active', 'completed', 'cancelled'], description: 'Filter by status', example: 'scheduled' })
  @ApiQuery({ name: 'fromDate', required: false, description: 'Filter exams from date (YYYY-MM-DD)', example: '2025-08-01' })
  @ApiQuery({ name: 'toDate', required: false, description: 'Filter exams to date (YYYY-MM-DD)', example: '2025-12-31' })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean, description: 'Filter by active status', example: true })
  @ApiQuery({ name: 'search', required: false, description: 'Search in title or description', example: 'physics' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number for pagination', example: '1' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page', example: '10' })
  @ApiQuery({ name: 'sortBy', required: false, description: 'Sort field (scheduleDate, title, examType, status, etc.)', example: 'scheduleDate' })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['ASC', 'DESC'], description: 'Sort order', example: 'ASC' })
  @ApiQuery({ name: 'createdBy', required: false, description: 'Filter by creator ID', example: '40' })
  @ApiQuery({ name: 'teacherId', required: false, description: 'Filter by teacher ID (alias for createdBy)', example: '50' })
  @HttpCode(HttpStatus.OK)
  async findAll(@Query() query: QueryInstituteClassSubjectExamDto, @Request() req: any): Promise<PaginatedInstituteClassSubjectExamResponseDto> {
    const result = await this.instituteClassSubjectExamsService.findAll(query, req.user);
    return result;
  }

  @Get('upcoming')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ anyInstituteRole: true })
  @ApiOperation({ 
    summary: 'Get upcoming exams', 
    description: 'Retrieves upcoming exams' 
  })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Upcoming exams retrieved successfully',
    type: [InstituteClassSubjectExamResponseDto] 
  })
  @ApiQuery({ name: 'instituteId', required: false, description: 'Filter by institute ID' })
  @HttpCode(HttpStatus.OK)
  async findUpcomingExams(@Query('instituteId') instituteId?: string, @Request() req?: any): Promise<InstituteClassSubjectExamResponseDto[]> {
    return this.instituteClassSubjectExamsService.findUpcomingExams(instituteId, req?.user);
  }

  @Get('institute/:instituteId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ anyInstituteRole: true })
  @ApiOperation({ 
    summary: 'Get exams by institute (Optimized)', 
    description: `Retrieves all exams for a specific institute with optional filtering and pagination.
    
**Performance Optimizations:**
- Single query with all joins
- Efficient filtering using proper indexes  
- Consistent sorting by schedule date and start time

**Additional Filters:** All query parameters from the main \`findAll\` endpoint can be used here as well.` 
  })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Institute exams retrieved successfully with optimized performance',
    type: PaginatedInstituteClassSubjectExamResponseDto 
  })
  @ApiResponse({ 
    status: HttpStatus.NOT_FOUND, 
    description: 'Institute not found' 
  })
  @ApiParam({ name: 'instituteId', description: 'Institute ID', example: '44' })
  @ApiQuery({ name: 'classId', required: false, description: 'Filter by class ID', example: '40' })
  @ApiQuery({ name: 'subjectId', required: false, description: 'Filter by subject ID', example: '40' })
  @ApiQuery({ name: 'examType', required: false, enum: ['online', 'physical'], description: 'Filter by exam type', example: 'physical' })
  @ApiQuery({ name: 'status', required: false, enum: ['draft', 'scheduled', 'active', 'completed', 'cancelled'], description: 'Filter by status', example: 'scheduled' })
  @ApiQuery({ name: 'fromDate', required: false, description: 'Filter exams from date (YYYY-MM-DD)', example: '2025-08-01' })
  @ApiQuery({ name: 'toDate', required: false, description: 'Filter exams to date (YYYY-MM-DD)', example: '2025-12-31' })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean, description: 'Filter by active status', example: true })
  @ApiQuery({ name: 'search', required: false, description: 'Search in title or description', example: 'physics' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number for pagination', example: '1' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page', example: '10' })
  @ApiQuery({ name: 'sortBy', required: false, description: 'Sort field', example: 'scheduleDate' })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['ASC', 'DESC'], description: 'Sort order', example: 'ASC' })
  @ApiQuery({ name: 'createdBy', required: false, description: 'Filter by creator ID', example: '40' })
  @HttpCode(HttpStatus.OK)
  async findByInstitute(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Query() query: QueryInstituteClassSubjectExamDto,
    @Request() req: any
  ): Promise<PaginatedInstituteClassSubjectExamResponseDto> {
    // Add instituteId to query parameters and use optimized findAll method
    query.instituteId = instituteId;
    return this.instituteClassSubjectExamsService.findAll(query, req.user);
  }

  @Get('class/:classId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ student: { requireClass: true }, teacher: { requireClass: true }, instituteAdmin: true, global: [UserType.SUPERADMIN] })
  @ApiOperation({ 
    summary: 'Get exams by class (Optimized)', 
    description: `Retrieves all exams for a specific class with optional filtering and pagination.
    
**Performance Optimizations:**
- Single query with all joins
- Efficient filtering using proper indexes
- Consistent sorting by schedule date and start time

**Additional Filters:** All query parameters from the main \`findAll\` endpoint can be used here as well.` 
  })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Class exams retrieved successfully with optimized performance',
    type: PaginatedInstituteClassSubjectExamResponseDto 
  })
  @ApiResponse({ 
    status: HttpStatus.NOT_FOUND, 
    description: 'Class not found' 
  })
  @ApiParam({ name: 'classId', description: 'Class ID', example: '40' })
  @ApiQuery({ name: 'instituteId', required: false, description: 'Filter by institute ID', example: '44' })
  @ApiQuery({ name: 'subjectId', required: false, description: 'Filter by subject ID', example: '40' })
  @ApiQuery({ name: 'examType', required: false, enum: ['online', 'physical'], description: 'Filter by exam type', example: 'physical' })
  @ApiQuery({ name: 'status', required: false, enum: ['draft', 'scheduled', 'active', 'completed', 'cancelled'], description: 'Filter by status', example: 'scheduled' })
  @ApiQuery({ name: 'fromDate', required: false, description: 'Filter exams from date (YYYY-MM-DD)', example: '2025-08-01' })
  @ApiQuery({ name: 'toDate', required: false, description: 'Filter exams to date (YYYY-MM-DD)', example: '2025-12-31' })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean, description: 'Filter by active status', example: true })
  @ApiQuery({ name: 'search', required: false, description: 'Search in title or description', example: 'chemistry' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number for pagination', example: '1' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page', example: '10' })
  @ApiQuery({ name: 'sortBy', required: false, description: 'Sort field', example: 'scheduleDate' })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['ASC', 'DESC'], description: 'Sort order', example: 'ASC' })
  @ApiQuery({ name: 'createdBy', required: false, description: 'Filter by creator ID', example: '40' })
  @HttpCode(HttpStatus.OK)
  async findByClass(
    @Param('classId', ParseBigIntPipe) classId: string,
    @Query() query: QueryInstituteClassSubjectExamDto,
    @Request() req: any
  ): Promise<PaginatedInstituteClassSubjectExamResponseDto> {
    // Add classId to query parameters and use optimized findAll method
    query.classId = classId;
    return this.instituteClassSubjectExamsService.findAll(query, req.user);
  }

  @Get('subject/:subjectId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ anyInstituteRole: true })
  @ApiOperation({ 
    summary: 'Get exams by subject (Optimized)', 
    description: `Retrieves all exams for a specific subject with optional filtering and pagination.
    
**Performance Optimizations:**
- Single query with all joins
- Efficient filtering using proper indexes
- Consistent sorting by schedule date and start time

**Additional Filters:** All query parameters from the main \`findAll\` endpoint can be used here as well.` 
  })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Subject exams retrieved successfully with optimized performance',
    type: PaginatedInstituteClassSubjectExamResponseDto 
  })
  @ApiResponse({ 
    status: HttpStatus.NOT_FOUND, 
    description: 'Subject not found' 
  })
  @ApiParam({ name: 'subjectId', description: 'Subject ID', example: '40' })
  @ApiQuery({ name: 'instituteId', required: false, description: 'Filter by institute ID', example: '44' })
  @ApiQuery({ name: 'classId', required: false, description: 'Filter by class ID', example: '40' })
  @ApiQuery({ name: 'examType', required: false, enum: ['online', 'physical'], description: 'Filter by exam type', example: 'online' })
  @ApiQuery({ name: 'status', required: false, enum: ['draft', 'scheduled', 'active', 'completed', 'cancelled'], description: 'Filter by status', example: 'active' })
  @ApiQuery({ name: 'fromDate', required: false, description: 'Filter exams from date (YYYY-MM-DD)', example: '2025-08-01' })
  @ApiQuery({ name: 'toDate', required: false, description: 'Filter exams to date (YYYY-MM-DD)', example: '2025-12-31' })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean, description: 'Filter by active status', example: true })
  @ApiQuery({ name: 'search', required: false, description: 'Search in title or description', example: 'mathematics' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number for pagination', example: '1' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page', example: '10' })
  @ApiQuery({ name: 'sortBy', required: false, description: 'Sort field', example: 'scheduleDate' })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['ASC', 'DESC'], description: 'Sort order', example: 'ASC' })
  @ApiQuery({ name: 'createdBy', required: false, description: 'Filter by creator ID', example: '40' })
  @HttpCode(HttpStatus.OK)
  async findBySubject(
    @Param('subjectId', ParseBigIntPipe) subjectId: string,
    @Query() query: QueryInstituteClassSubjectExamDto,
    @Request() req: any
  ): Promise<PaginatedInstituteClassSubjectExamResponseDto> {
    // Add subjectId to query parameters and use optimized findAll method
    query.subjectId = subjectId;
    return this.instituteClassSubjectExamsService.findAll(query, req.user);
  }

  @Get(':id')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ anyInstituteRole: true })
  @ApiOperation({ 
    summary: 'Get exam by ID', 
    description: 'Retrieves a specific exam by its ID' 
  })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Exam retrieved successfully',
    type: InstituteClassSubjectExamResponseDto 
  })
  @ApiResponse({ 
    status: HttpStatus.NOT_FOUND, 
    description: 'Exam not found' 
  })
  @ApiParam({ name: 'id', description: 'Exam ID' })
  @HttpCode(HttpStatus.OK)
  async findOne(@Param('id', ParseBigIntPipe) id: string, @Request() req: any): Promise<InstituteClassSubjectExamResponseDto> {
    return this.instituteClassSubjectExamsService.findOne(id, req.user);
  }

  @Patch(':id')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true, teacher: true })
  @ApiOperation({ 
    summary: 'Update exam (Institute Admin or Teacher)', 
    description: 'Updates an existing exam. Access validation for institute/class/subject is done in service layer.' 
  })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Exam updated successfully',
    type: InstituteClassSubjectExamResponseDto 
  })
  @ApiResponse({ 
    status: HttpStatus.NOT_FOUND, 
    description: 'Exam not found' 
  })
  @ApiResponse({ 
    status: HttpStatus.BAD_REQUEST, 
    description: 'Invalid input data' 
  })
  @ApiParam({ name: 'id', description: 'Exam ID' })
  @ApiBody({ type: UpdateInstituteClassSubjectExamDto })
  @HttpCode(HttpStatus.OK)
  async update(
    @Param('id', ParseBigIntPipe) id: string, 
    @Body() updateInstituteClassSubjectExamDto: UpdateInstituteClassSubjectExamDto,
    @Request() req: any
  ): Promise<InstituteClassSubjectExamResponseDto> {
    return this.instituteClassSubjectExamsService.update(id, updateInstituteClassSubjectExamDto, req.user);
  }

  @Patch(':id/status')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true, teacher: true })
  @ApiOperation({ 
    summary: 'Update exam status (Institute Admin or Teacher)', 
    description: 'Updates the status of an existing exam. Access validation for institute/class/subject is done in service layer.' 
  })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Exam status updated successfully',
    type: InstituteClassSubjectExamResponseDto 
  })
  @ApiResponse({ 
    status: HttpStatus.NOT_FOUND, 
    description: 'Exam not found' 
  })
  @ApiResponse({ 
    status: HttpStatus.BAD_REQUEST, 
    description: 'Invalid status' 
  })
  @ApiParam({ name: 'id', description: 'Exam ID' })
  @ApiBody({ 
    schema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['draft', 'scheduled', 'active', 'completed', 'cancelled'],
          description: 'New exam status'
        }
      },
      required: ['status']
    }
  })
  @HttpCode(HttpStatus.OK)
  async updateStatus(
    @Param('id', ParseBigIntPipe) id: string, 
    @Body('status') status: 'draft' | 'scheduled' | 'active' | 'completed' | 'cancelled',
    @Request() req: any
  ): Promise<InstituteClassSubjectExamResponseDto> {
    return this.instituteClassSubjectExamsService.updateStatus(id, status, req.user);
  }

  @Delete(':id')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true, teacher: true })
  @ApiOperation({
    summary: 'Delete exam',
    description: 'Permanently deletes an exam. Accessible by SUPERADMIN, Institute Admin, or Teacher.'
  })
  @ApiResponse({ 
    status: HttpStatus.NO_CONTENT, 
    description: 'Exam deleted successfully' 
  })
  @ApiResponse({ 
    status: HttpStatus.NOT_FOUND, 
    description: 'Exam not found' 
  })
  @ApiParam({ name: 'id', description: 'Exam ID' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseBigIntPipe) id: string): Promise<void> {
    return this.instituteClassSubjectExamsService.remove(id);
  }

  @Delete(':id/soft')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true, teacher: true })
  @ApiOperation({ 
    summary: 'Soft delete exam (Institute Admin or Teacher)', 
    description: 'Soft deletes an exam (sets isActive to false). Access validation for institute/class/subject is done in service layer.' 
  })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Exam soft deleted successfully',
    type: InstituteClassSubjectExamResponseDto 
  })
  @ApiResponse({ 
    status: HttpStatus.NOT_FOUND, 
    description: 'Exam not found' 
  })
  @ApiParam({ name: 'id', description: 'Exam ID' })
  @HttpCode(HttpStatus.OK)
  async softDelete(
    @Param('id', ParseBigIntPipe) id: string,
    @Request() req: any
  ): Promise<InstituteClassSubjectExamResponseDto> {
    return this.instituteClassSubjectExamsService.softDelete(id, req.user);
  }
}
