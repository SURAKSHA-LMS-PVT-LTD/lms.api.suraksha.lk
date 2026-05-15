import { ParseIdPipe } from '../../../common/pipes/parse-id.pipe';
import { Controller, Get, Post, Body, Patch, Param, Delete, Query, HttpCode, HttpStatus, UseGuards, BadRequestException, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { FlexibleAccessGuard } from '../../../auth/guards/flexible-access.guard';
import { RequireAnyOfRoles } from '../../../auth/decorators/flexible-access.decorator';
import { UserType } from '../../user/enums/user-type.enum';
import { InstituteClassSubjectResaultsService } from './institute_class_subject_resaults.service';
import { CreateInstituteClassSubjectResaultDto } from './dto/create-institute_class_subject_resault.dto';
import { CreateBulkResultsDto } from './dto/create-bulk-results.dto';
import { UpdateInstituteClassSubjectResaultDto } from './dto/update-institute_class_subject_resault.dto';
import { QueryInstituteClassSubjectResaultDto } from './dto/query-institute_class_subject_resault.dto';
import { InstituteClassSubjectResaultResponseDto } from './dto/institute_class_subject_resault-response.dto';
import { StudentExamMarkDto } from './dto/student-exam-mark.dto';
import { PaginatedResponseDto } from '../../../common/dto/paginated-response.dto';
import { Type } from 'class-transformer';
import { IsArray, ValidateNested } from 'class-validator';

@ApiTags('Institute Class Subject Results')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('institute-class-subject-resaults')
export class InstituteClassSubjectResaultsController {
  constructor(private readonly resultsService: InstituteClassSubjectResaultsService) {}

  @Post()
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true, teacher: { requireClass: true, requireSubject: true } })
  @ApiOperation({ summary: 'Create a new result' })
  @ApiResponse({ status: 201, description: 'Result created successfully', type: InstituteClassSubjectResaultResponseDto })
  @ApiResponse({ status: 400, description: 'Bad request' })
  async create(@Body() createDto: CreateInstituteClassSubjectResaultDto): Promise<InstituteClassSubjectResaultResponseDto> {
    return await this.resultsService.create(createDto);
  }

  @Get()
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ anyInstituteRole: true })
  @ApiOperation({ summary: 'Get all results with filtering and pagination' })
  @ApiResponse({ status: 200, description: 'List of results', type: PaginatedResponseDto<InstituteClassSubjectResaultResponseDto> })
  async findAll(@Query() queryDto: QueryInstituteClassSubjectResaultDto, @Request() req: any): Promise<PaginatedResponseDto<InstituteClassSubjectResaultResponseDto>> {
    return await this.resultsService.findAll(queryDto, req.user);
  }

  @Get('with-details/:id')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ anyInstituteRole: true })
  @ApiOperation({ summary: 'Get a result by ID with full related entity details' })
  @ApiParam({ name: 'id', description: 'Result ID' })
  @ApiResponse({ status: 200, description: 'Result details with full related entities' })
  @ApiResponse({ status: 404, description: 'Result not found' })
  async findOneWithDetails(@Param('id', ParseIdPipe) id: string): Promise<any> {
    return await this.resultsService.findOneWithDetails(id);
  }

  @Get('exam/:examId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ anyInstituteRole: true })
  @ApiOperation({ summary: 'Get all results for a specific exam' })
  @ApiParam({ name: 'examId', description: 'Exam ID' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page (default: 10)' })
  @ApiResponse({ status: 200, description: 'List of results for the exam', type: PaginatedResponseDto<InstituteClassSubjectResaultResponseDto> })
  @ApiResponse({ status: 404, description: 'Exam not found or no results' })
  async findByExamId(
    @Param('examId') examId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number
  ): Promise<PaginatedResponseDto<InstituteClassSubjectResaultResponseDto>> {
    return await this.resultsService.findByExamId(examId, { page, limit });
  }

  @Get('students-with-marks')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true, teacher: { requireClass: true, requireSubject: true } })
  @ApiOperation({ summary: 'Get all enrolled students of a class-subject with their marks for a specific exam' })
  @ApiQuery({ name: 'instituteId', required: true, description: 'Institute ID' })
  @ApiQuery({ name: 'classId', required: true, description: 'Class ID' })
  @ApiQuery({ name: 'subjectId', required: true, description: 'Subject ID' })
  @ApiQuery({ name: 'examId', required: true, description: 'Exam ID' })
  @ApiResponse({ status: 200, description: 'List of students with their exam marks', type: [StudentExamMarkDto] })
  @ApiResponse({ status: 400, description: 'Missing required query parameters' })
  async getStudentsWithExamMarks(
    @Query('instituteId') instituteId: string,
    @Query('classId') classId: string,
    @Query('subjectId') subjectId: string,
    @Query('examId') examId: string,
  ): Promise<StudentExamMarkDto[]> {
    if (!instituteId || !classId || !subjectId || !examId) {
      throw new BadRequestException('instituteId, classId, subjectId, and examId are all required');
    }
    return this.resultsService.getStudentsWithExamMarks(instituteId, classId, subjectId, examId);
  }

  @Get(':id')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ anyInstituteRole: true })
  @ApiOperation({ summary: 'Get a result by ID' })
  @ApiParam({ name: 'id', description: 'Result ID' })
  @ApiResponse({ status: 200, description: 'Result details', type: InstituteClassSubjectResaultResponseDto })
  @ApiResponse({ status: 404, description: 'Result not found' })
  async findOne(@Param('id', ParseIdPipe) id: string): Promise<InstituteClassSubjectResaultResponseDto> {
    return await this.resultsService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true, teacher: { requireClass: true, requireSubject: true } })
  @ApiOperation({ summary: 'Update a result' })
  @ApiParam({ name: 'id', description: 'Result ID' })
  @ApiResponse({ status: 200, description: 'Result updated successfully', type: InstituteClassSubjectResaultResponseDto })
  @ApiResponse({ status: 404, description: 'Result not found' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  async update(@Param('id', ParseIdPipe) id: string, @Body() updateDto: UpdateInstituteClassSubjectResaultDto): Promise<InstituteClassSubjectResaultResponseDto> {
    return await this.resultsService.update(id, updateDto);
  }

  @Delete(':id')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a result' })
  @ApiParam({ name: 'id', description: 'Result ID' })
  @ApiResponse({ status: 204, description: 'Result deleted successfully' })
  @ApiResponse({ status: 404, description: 'Result not found' })
  async remove(@Param('id', ParseIdPipe) id: string): Promise<void> {
    await this.resultsService.remove(id);
  }

  @Post('bulk')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true, teacher: { requireClass: true, requireSubject: true } })
  @ApiOperation({ summary: 'Create multiple results for an exam' })
  @ApiResponse({ status: 201, description: 'Results created successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  async createBulk(@Body() createBulkDto: CreateBulkResultsDto): Promise<InstituteClassSubjectResaultResponseDto[]> {
    return await this.resultsService.createBulk(createBulkDto);
  }
}

