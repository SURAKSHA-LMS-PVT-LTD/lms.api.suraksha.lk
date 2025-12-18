import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';
import { Controller, Get, Post, Body, Patch, Param, Delete, Query, HttpCode, HttpStatus, UseGuards, ValidationPipe, UsePipes } from '@nestjs/common';
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

import { UserType } from '../user/enums/user-type.enum';
import { InstituteType } from '../institute/enums/institute.enums';
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
    global: [UserType.SUPERADMIN]
  })
  @ApiOperation({ 
    summary: 'Create a new system-wide subject (SUPERADMIN only)',
    description: 'Upload image using /upload/generate-signed-url first, then include imgUrl in the request body'
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
        subjectType: { type: 'string', enum: ['MAIN', 'BASKET', 'COMMON'] },
        basketCategory: { type: 'string', example: 'G003' },
        instituteType: { type: 'string', enum: Object.values(InstituteType) },
        imgUrl: {
          type: 'string',
          description: 'Subject image URL from /upload/verify-and-publish',
          example: 'https://storage.googleapis.com/suraksha-lms/subject-images/subject-123.jpg'
        },
      },
      required: ['code', 'name']
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
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get all subjects - Accessible by any authenticated user' })
  @ApiResponse({ status: 200, description: 'All subjects retrieved successfully', type: [SubjectResponseDto] })
  @ApiQuery({ name: 'search', required: false, description: 'Search in code, name, or description' })
  @ApiQuery({ name: 'category', required: false, description: 'Filter by category' })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean, description: 'Filter by active status' })
  @ApiQuery({ name: 'instituteType', required: false, enum: Object.values(InstituteType), description: 'Filter by institute type' })
  @ApiQuery({ name: 'instituteId', required: false, description: 'Filter subjects by institute ID' })
  @ApiQuery({ name: 'classId', required: false, description: 'Filter subjects by class ID (requires instituteId)' })
  @ApiQuery({ name: 'subjectId', required: false, description: 'Filter by specific subject ID' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number for pagination' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Number of records per page (-1 for all records)' })
  @ApiQuery({ name: 'sortBy', required: false, description: 'Sort field (default: createdAt)' })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['ASC', 'DESC'], description: 'Sort order (default: DESC)' })
  async findAll(@Query() query: QuerySubjectDto): Promise<SubjectResponseDto[]> {
    
    // Force limit to -1 to return all subjects regardless of query parameters
    const modifiedQuery: QuerySubjectDto = {
      ...query,
      limit: -1,
      page: 1
    };
    
    
    const result = await this.subjectService.findAll(modifiedQuery);
    
    return result.data;
  }

  @Get('all')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get all subjects without pagination - Accessible by any authenticated user' })
  @ApiResponse({ status: 200, description: 'All subjects retrieved successfully', type: [SubjectResponseDto] })
  @ApiQuery({ name: 'search', required: false, description: 'Search in code, name, or description' })
  @ApiQuery({ name: 'category', required: false, description: 'Filter by category' })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean, description: 'Filter by active status' })
  @ApiQuery({ name: 'instituteType', required: false, enum: Object.values(InstituteType), description: 'Filter by institute type' })
  @ApiQuery({ name: 'instituteId', required: false, description: 'Filter subjects by institute ID' })
  @ApiQuery({ name: 'classId', required: false, description: 'Filter subjects by class ID (requires instituteId)' })
  @ApiQuery({ name: 'subjectId', required: false, description: 'Filter by specific subject ID' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number for pagination' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Number of records per page (-1 for all records)' })
  @ApiQuery({ name: 'sortBy', required: false, description: 'Sort field (default: createdAt)' })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['ASC', 'DESC'], description: 'Sort order (default: DESC)' })
  async findAllWithoutPagination(@Query() query: QueryAllSubjectsDto): Promise<SubjectResponseDto[]> {
    // Create full query object with pagination set to get all records
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
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({ summary: 'Get subject statistics' })
  @ApiResponse({ status: 200, description: 'Statistics retrieved successfully' })
  async getStats(): Promise<ISubjectStats> {
    return this.subjectService.getSubjectStats();
  }

  @Get('categories')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get subjects grouped by category - Accessible by any authenticated user' })
  @ApiResponse({ status: 200, description: 'Categories retrieved successfully' })
  async getSubjectsByCategory(): Promise<ISubjectCategoryStats[]> {
    return this.subjectService.getSubjectsByCategory();
  }

  @Get('code/:code')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ anyInstituteRole: true })
  @ApiOperation({ summary: 'Get subject by code' })
  @ApiResponse({ status: 200, description: 'Subject found', type: SubjectResponseDto })
  @ApiResponse({ status: 404, description: 'Subject not found' })
  async findByCode(@Param('code', SubjectCodeValidationPipe) code: string): Promise<SubjectResponseDto> {
    return this.subjectService.findByCode(code);
  }

  @Get(':id')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ anyInstituteRole: true })
  @ApiOperation({ summary: 'Get subject by ID' })
  @ApiResponse({ status: 200, description: 'Subject found', type: SubjectResponseDto })
  @ApiResponse({ status: 404, description: 'Subject not found' })
  async findOne(@Param('id', ParseBigIntPipe) id: string): Promise<SubjectResponseDto> {
    return this.subjectService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({ 
    summary: 'Update subject by ID',
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
        subjectType: { type: 'string', enum: ['MAIN', 'BASKET', 'COMMON'] },
        basketCategory: { type: 'string', example: 'G003' },
        instituteType: { type: 'string', enum: Object.values(InstituteType) },
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
  async update(
    @Param('id', ParseBigIntPipe) id: string,
    @Body() updateSubjectDto: UpdateSubjectDto
  ): Promise<SubjectResponseDto> {
    // imgUrl is already validated and public - just update subject
    return this.subjectService.update(id, updateSubjectDto);
  }

  @Patch(':id/deactivate')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({ summary: 'Soft delete (deactivate) subject by ID' })
  @ApiResponse({ status: 200, description: 'Subject deactivated successfully', type: SubjectResponseDto })
  @ApiResponse({ status: 404, description: 'Subject not found' })
  async softDelete(@Param('id', ParseBigIntPipe) id: string): Promise<SubjectResponseDto> {
    return this.subjectService.softDelete(id);
  }

  @Delete(':id')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete subject by ID' })
  @ApiResponse({ status: 204, description: 'Subject deleted successfully' })
  @ApiResponse({ status: 404, description: 'Subject not found' })
  async remove(@Param('id', ParseBigIntPipe) id: string): Promise<void> {
    return this.subjectService.remove(id);
  }
}
