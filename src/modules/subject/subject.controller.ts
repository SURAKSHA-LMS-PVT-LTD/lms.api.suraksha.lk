import { ParseIdPipe } from '../../common/pipes/parse-id.pipe';
import { Controller, Get, Post, Body, Patch, Param, Delete, Query, HttpCode, HttpStatus, UseGuards, ValidationPipe, UsePipes, BadRequestException, Req } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { SubjectService } from './subject.service';
import { CreateSubjectDto } from './dto/create-subject.dto';
import { UpdateSubjectDto } from './dto/update-subject.dto';
import { QuerySubjectDto } from './dto/query-subject.dto';
import { QueryAllSubjectsDto } from './dto/query-all-subjects.dto';
import { SubjectResponseDto } from './dto/subject-response.dto';
import { PaginatedSubjectResponseDto } from './dto/paginated-subject-response.dto';
import { SubjectValidationPipe, SubjectCodeValidationPipe } from './pipes/subject-validation.pipe';
import { ISubjectStats, ISubjectCategoryStats } from './interfaces/subject.interface';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { FlexibleAccessGuard } from '../../auth/guards/flexible-access.guard';
import { RequireAnyOfRoles } from '../../auth/decorators/flexible-access.decorator';
import { JwtRequest } from '../../common/interfaces/jwt-request.interface';

import { UserType } from '../user/enums/user-type.enum';
import { CloudStorageService } from '../../common/services/cloud-storage.service';
import { FileValidationUtil } from '../../common/utils/file-validation.util';

@ApiTags('subjects')
@ApiBearerAuth()
@Controller('subjects')
@UseGuards(JwtAuthGuard)
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class SubjectController {
  constructor(private readonly subjectService: SubjectService,
    private readonly cloudStorageService: CloudStorageService
  ) {}

  @Post()
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ 
    global: [UserType.SUPERADMIN],
    instituteAdmin: true
  })
  @ApiOperation({ 
    summary: 'Create a new subject (SUPERADMIN, Institute Admin)',
    description: 'Upload image using /upload/generate-signed-url first, then include imgUrl in the request body. Institute ID is required.'
  })
  @ApiConsumes('application/json')
  @ApiBody({
    description: 'Subject creation with optional image URL',
    schema: {
      type: 'object',
      properties: {
        code: { type: 'string', example: 'MATH101' },
        name: { type: 'string', example: 'Mathematics' },
        description: { type: 'string', example: 'Basic mathematics course' },
        category: { type: 'string', example: 'Science' },
        creditHours: { type: 'integer', example: 3 },
        isActive: { type: 'boolean', example: true },
        subjectType: { type: 'string', example: 'MAIN', description: 'Subject type (e.g., MAIN, BASKET, COMMON, GRADE_6TO9_BASKET, GRADE_10TO11_BASKET_1, etc.)' },
        basketCategory: { type: 'string', example: 'LANGUAGE', description: 'Basket category (e.g., LANGUAGE, ARTS, TECHNOLOGY, COMMERCE, SCIENCE, RELIGION)' },
        instituteId: { type: 'string', example: '1', description: 'Institute ID' },
        imgUrl: {
          type: 'string',
          description: 'Subject image URL from /upload/verify-and-publish',
          example: 'https://storage.googleapis.com/suraksha-lms/subject-images/subject-123.jpg'
        },
      },
      required: ['code', 'name', 'instituteId']
    }
  })
  @ApiResponse({ status: 201, description: 'Subject created successfully', type: SubjectResponseDto })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 409, description: 'Subject code already exists' })
  async create(
    @Body() createSubjectDto: CreateSubjectDto
  ): Promise<SubjectResponseDto> {
    // imgUrl is already validated and public - just create subject
    return await this.subjectService.create(createSubjectDto);
  }

  @Get()
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ 
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: true
  })
  @ApiOperation({ 
    summary: 'Get all subjects (Institute Admin, Teacher) - instituteId required',
    description: 'Get subjects with filtering. Institute admins can get inactive subjects by passing ?isActive=false to activate them later.'
  })
  @ApiResponse({ status: 200, description: 'All subjects retrieved successfully', type: [SubjectResponseDto] })
  @ApiResponse({ status: 400, description: 'instituteId is required' })
  @ApiQuery({ name: 'search', required: false, description: 'Search in code, name, or description' })
  @ApiQuery({ name: 'category', required: false, description: 'Filter by category' })
  @ApiQuery({ name: 'subjectType', required: false, type: String, description: 'Filter by subject type (e.g., MAIN, BASKET, COMMON, GRADE_6TO9_BASKET, GRADE_10TO11_BASKET_1, GRADE_10TO11_BASKET_2, GRADE_10TO11_BASKET_3, GRADE_10TO11_BASKET_4, GRADE_12TO13_BASKET_1, GRADE_12TO13_BASKET_2, GRADE_12TO13_BASKET_3, GRADE_12TO13_BASKET_4)' })
  @ApiQuery({ name: 'basketCategory', required: false, type: String, description: 'Filter by basket category (e.g., LANGUAGE, ARTS, TECHNOLOGY, COMMERCE, SCIENCE, RELIGION)' })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean, description: 'Filter by active status. Use ?isActive=false to get inactive subjects. Default: true (active only)' })
  @ApiQuery({ name: 'instituteId', required: true, description: 'Institute ID - REQUIRED' })
  @ApiQuery({ name: 'classId', required: false, description: 'Filter subjects by class ID (requires instituteId)' })
  @ApiQuery({ name: 'subjectId', required: false, description: 'Filter by specific subject ID' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number for pagination' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Number of records per page (-1 for all records)' })
  @ApiQuery({ name: 'sortBy', required: false, description: 'Sort field (default: createdAt)' })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['ASC', 'DESC'], description: 'Sort order (default: DESC)' })
  async findAll(@Query() query: QuerySubjectDto, @Req() req: any): Promise<SubjectResponseDto[]> {
    // SUPERADMIN can query subjects across all institutes
    const isSuperAdmin = req.user?.t === UserType.SUPERADMIN;
    if (!query.instituteId && !isSuperAdmin) {
      throw new BadRequestException('instituteId is required to access subjects');
    }
    
    // Force limit to -1 to return all subjects regardless of query parameters.
    // Keep isActive as provided by caller: undefined returns both active and inactive.
    const modifiedQuery: QuerySubjectDto = {
      ...query,
      limit: -1,
      page: 1
    };
    
    
    const result = await this.subjectService.findAll(modifiedQuery);
    
    return result.data;
  }

  @Get('all')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ 
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: true
  })
  @ApiOperation({ summary: 'Get all subjects without pagination (Institute Admin, Teacher) - instituteId required' })
  @ApiResponse({ status: 200, description: 'All subjects retrieved successfully', type: [SubjectResponseDto] })
  @ApiResponse({ status: 400, description: 'instituteId is required' })
  @ApiQuery({ name: 'search', required: false, description: 'Search in code, name, or description' })
  @ApiQuery({ name: 'category', required: false, description: 'Filter by category' })
  @ApiQuery({ name: 'subjectType', required: false, type: String, description: 'Filter by subject type (e.g., MAIN, BASKET, COMMON, GRADE_6TO9_BASKET, GRADE_10TO11_BASKET_1, GRADE_10TO11_BASKET_2, GRADE_10TO11_BASKET_3, GRADE_10TO11_BASKET_4, GRADE_12TO13_BASKET_1, GRADE_12TO13_BASKET_2, GRADE_12TO13_BASKET_3, GRADE_12TO13_BASKET_4)' })
  @ApiQuery({ name: 'basketCategory', required: false, type: String, description: 'Filter by basket category (e.g., LANGUAGE, ARTS, TECHNOLOGY, COMMERCE, SCIENCE, RELIGION)' })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean, description: 'Filter by active status' })
  @ApiQuery({ name: 'instituteId', required: true, description: 'Institute ID - REQUIRED' })
  @ApiQuery({ name: 'classId', required: false, description: 'Filter subjects by class ID (requires instituteId)' })
  @ApiQuery({ name: 'subjectId', required: false, description: 'Filter by specific subject ID' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number for pagination' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Number of records per page (-1 for all records)' })
  @ApiQuery({ name: 'sortBy', required: false, description: 'Sort field (default: createdAt)' })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['ASC', 'DESC'], description: 'Sort order (default: DESC)' })
  async findAllWithoutPagination(@Query() query: QueryAllSubjectsDto, @Req() req: any): Promise<SubjectResponseDto[]> {
    // SUPERADMIN can query subjects across all institutes
    const isSuperAdmin = req.user?.t === UserType.SUPERADMIN;
    if (!query.instituteId && !isSuperAdmin) {
      throw new BadRequestException('instituteId is required to access subjects');
    }
    
    // Create full query object with pagination set to get all records.
    // Keep isActive as provided by caller: undefined returns both active and inactive.
    const fullQuery: QuerySubjectDto = {
      ...query,
      limit: -1,
      page: 1
    };
    
    const result = await this.subjectService.findAll(fullQuery);
    return result.data;
  }

  @Get('stats')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ 
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: true
  })
  @ApiOperation({ summary: 'Get subject statistics (Institute Admin, Teacher) - instituteId required' })
  @ApiResponse({ status: 200, description: 'Statistics retrieved successfully' })
  @ApiResponse({ status: 400, description: 'instituteId is required' })
  @ApiQuery({ name: 'instituteId', required: true, description: 'Institute ID - REQUIRED' })
  async getStats(@Query('instituteId') instituteId: string): Promise<ISubjectStats> {
    if (!instituteId) {
      throw new BadRequestException('instituteId is required to access statistics');
    }
    return this.subjectService.getSubjectStats(instituteId);
  }

  @Get('categories')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ 
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: true
  })
  @ApiOperation({ summary: 'Get subjects grouped by category (Institute Admin, Teacher) - instituteId required' })
  @ApiResponse({ status: 200, description: 'Categories retrieved successfully' })
  @ApiResponse({ status: 400, description: 'instituteId is required' })
  @ApiQuery({ name: 'instituteId', required: true, description: 'Institute ID - REQUIRED' })
  async getSubjectsByCategory(@Query('instituteId') instituteId: string): Promise<ISubjectCategoryStats[]> {
    if (!instituteId) {
      throw new BadRequestException('instituteId is required to access categories');
    }
    return this.subjectService.getSubjectsByCategory(instituteId);
  }

  @Get('code/:code')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ 
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: true
  })
  @ApiOperation({ summary: 'Get subject by code (Institute Admin, Teacher) - instituteId required' })
  @ApiResponse({ status: 200, description: 'Subject found', type: SubjectResponseDto })
  @ApiResponse({ status: 404, description: 'Subject not found' })
  @ApiResponse({ status: 400, description: 'instituteId is required' })
  @ApiQuery({ name: 'instituteId', required: true, description: 'Institute ID - REQUIRED' })
  async findByCode(
    @Param('code', SubjectCodeValidationPipe) code: string,
    @Query('instituteId') instituteId: string
  ): Promise<SubjectResponseDto> {
    if (!instituteId) {
      throw new BadRequestException('instituteId is required to access subject');
    }
    return this.subjectService.findByCodeAndInstitute(code, instituteId);
  }

  @Get(':id')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ 
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: true
  })
  @ApiOperation({ summary: 'Get subject by ID (Institute Admin, Teacher) - instituteId required' })
  @ApiResponse({ status: 200, description: 'Subject found', type: SubjectResponseDto })
  @ApiResponse({ status: 404, description: 'Subject not found' })
  @ApiResponse({ status: 400, description: 'instituteId is required' })
  @ApiQuery({ name: 'instituteId', required: true, description: 'Institute ID - REQUIRED' })
  async findOne(
    @Param('id', ParseIdPipe) id: string,
    @Query('instituteId') instituteId: string
  ): Promise<SubjectResponseDto> {
    if (!instituteId) {
      throw new BadRequestException('instituteId is required to access subject');
    }
    return this.subjectService.findOneByInstitute(id, instituteId);
  }

  @Patch(':id')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ 
    global: [UserType.SUPERADMIN],
    instituteAdmin: true
  })
  @ApiOperation({ 
    summary: 'Update subject by ID (SUPERADMIN, Institute Admin)',
    description: 'Upload new image using /upload/generate-signed-url first, then include imgUrl in the request body'
  })
  @ApiConsumes('application/json')
  @ApiBody({
    description: 'Subject update with optional new image URL',
    schema: {
      type: 'object',
      properties: {
        code: { type: 'string', example: 'MATH101' },
        name: { type: 'string', example: 'Advanced Mathematics' },
        description: { type: 'string', example: 'Advanced mathematics course' },
        category: { type: 'string', example: 'Science' },
        creditHours: { type: 'integer', example: 4 },
        isActive: { type: 'boolean', example: true },
        subjectType: { type: 'string', example: 'MAIN', description: 'Subject type (e.g., MAIN, BASKET, COMMON, GRADE_6TO9_BASKET, GRADE_10TO11_BASKET_1, etc.)' },
        basketCategory: { type: 'string', example: 'LANGUAGE', description: 'Basket category (e.g., LANGUAGE, ARTS, TECHNOLOGY, COMMERCE, SCIENCE, RELIGION)' },
        imgUrl: {
          type: 'string',
          description: 'New subject image URL from /upload/verify-and-publish',
          example: 'https://storage.googleapis.com/suraksha-lms/subject-images/subject-123.jpg'
        },
      }
    }
  })
  @ApiResponse({ status: 200, description: 'Subject updated successfully', type: SubjectResponseDto })
  @ApiResponse({ status: 404, description: 'Subject not found' })
  @ApiResponse({ status: 409, description: 'Subject code already exists' })
  @ApiResponse({ status: 403, description: 'Forbidden - No access to this institute' })
  async update(
    @Param('id', ParseIdPipe) id: string,
    @Body() updateSubjectDto: UpdateSubjectDto,
    @Req() request: JwtRequest
  ): Promise<SubjectResponseDto> {
    // imgUrl is already validated and public - just update subject
    // Pass user context for institute access validation
    return this.subjectService.update(id, updateSubjectDto, request.user);
  }

  @Patch(':id/activate')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ 
    global: [UserType.SUPERADMIN],
    instituteAdmin: true
  })
  @ApiOperation({ 
    summary: 'Activate inactive subject (SUPERADMIN, Institute Admin)',
    description: 'Reactivate a previously deactivated subject. Use GET /subjects?isActive=false to find inactive subjects first.'
  })
  @ApiResponse({ status: 200, description: 'Subject activated successfully', type: SubjectResponseDto })
  @ApiResponse({ status: 404, description: 'Subject not found' })
  @ApiResponse({ status: 403, description: 'Forbidden - No access to this institute' })
  @ApiQuery({ name: 'instituteId', required: true, description: 'Institute ID - REQUIRED' })
  async activate(
    @Param('id', ParseIdPipe) id: string,
    @Query('instituteId') instituteId: string,
    @Req() request: JwtRequest
  ): Promise<SubjectResponseDto> {
    if (!instituteId) {
      throw new BadRequestException('instituteId is required');
    }
    return this.subjectService.activate(id, request.user);
  }

  @Patch(':id/deactivate')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ 
    global: [UserType.SUPERADMIN],
    instituteAdmin: true
  })
  @ApiOperation({ summary: 'Soft delete (deactivate) subject by ID (SUPERADMIN, Institute Admin)' })
  @ApiResponse({ status: 200, description: 'Subject deactivated successfully', type: SubjectResponseDto })
  @ApiResponse({ status: 404, description: 'Subject not found' })
  @ApiResponse({ status: 403, description: 'Forbidden - No access to this institute' })
  @ApiQuery({ name: 'instituteId', required: true, description: 'Institute ID - REQUIRED' })
  async softDelete(
    @Param('id', ParseIdPipe) id: string,
    @Query('instituteId') instituteId: string,
    @Req() request: JwtRequest
  ): Promise<SubjectResponseDto> {
    if (!instituteId) {
      throw new BadRequestException('instituteId is required');
    }
    // Pass user context for institute access validation
    return this.subjectService.softDelete(id, request.user);
  }

  @Delete(':id')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete subject by ID' })
  @ApiResponse({ status: 204, description: 'Subject deleted successfully' })
  @ApiResponse({ status: 404, description: 'Subject not found' })
  async remove(@Param('id', ParseIdPipe) id: string): Promise<void> {
    return this.subjectService.remove(id);
  }
}
