import { ParseBigIntPipe } from '../../../common/pipes/parse-bigint.pipe';
import { Controller, Get, Post, Body, Patch, Param, Delete, Query, HttpCode, HttpStatus, UseGuards, Request, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { UseInterceptors } from '@nestjs/common';
import { SerializeDatesInterceptor } from './interceptors/serialize-dates.interceptor';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { FlexibleAccessGuard } from '../../../auth/guards/flexible-access.guard';
import { RequireAnyOfRoles } from '../../../auth/decorators/flexible-access.decorator';
import { UserType } from '../../user/enums/user-type.enum';
import { InstituteClassSubjectHomeworksSubmissionsService } from './institute_class_subject_homeworks_submissions.service';
import { CreateInstituteClassSubjectHomeworksSubmissionDto } from './dto/create-institute_class_subject_homeworks_submission.dto';
import { UpdateInstituteClassSubjectHomeworksSubmissionDto } from './dto/update-institute_class_subject_homeworks_submission.dto';
import { QueryInstituteClassSubjectHomeworksSubmissionDto } from './dto/query-institute_class_subject_homeworks_submission.dto';
import { InstituteClassSubjectHomeworksSubmissionResponseDto } from './dto/institute_class_subject_homeworks_submission-response.dto';
import { PaginatedResponseDto } from '../../../common/dto/paginated-response.dto';
import { JwtRequest } from '@common/interfaces/jwt-request.interface';


@ApiTags('Institute Class Subject Homework Submissions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@UseInterceptors(SerializeDatesInterceptor)
@Controller('institute-class-subject-homeworks-submissions')
export class InstituteClassSubjectHomeworksSubmissionsController {
  constructor(private readonly submissionsService: InstituteClassSubjectHomeworksSubmissionsService) {}

  @Post()
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ anyInstituteRole: true })
  @ApiOperation({ summary: 'Create a new homework submission' })
  @ApiResponse({ status: 201, description: 'Homework submission created successfully', type: InstituteClassSubjectHomeworksSubmissionResponseDto })
  @ApiResponse({ status: 400, description: 'Bad request' })
  async create(@Body() createDto: CreateInstituteClassSubjectHomeworksSubmissionDto): Promise<InstituteClassSubjectHomeworksSubmissionResponseDto> {
    return await this.submissionsService.create(createDto);
  }

  @Get()
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ anyInstituteRole: true })
  @ApiOperation({ summary: 'Get all homework submissions with filtering and pagination' })
  @ApiResponse({ status: 200, description: 'List of homework submissions', type: PaginatedResponseDto<InstituteClassSubjectHomeworksSubmissionResponseDto> })
  @ApiQuery({ name: 'instituteId', required: false, description: 'Filter by institute ID' })
  @ApiQuery({ name: 'classId', required: false, description: 'Filter by class ID' })
  @ApiQuery({ name: 'subjectId', required: false, description: 'Filter by subject ID' })
  @ApiQuery({ name: 'teacherId', required: false, description: 'Filter by teacher ID' })
  @ApiQuery({ name: 'studentId', required: false, description: 'Filter by student ID' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page' })
  async findAll(
    @Query() queryDto: QueryInstituteClassSubjectHomeworksSubmissionDto,
    @Request() req: JwtRequest
  ): Promise<PaginatedResponseDto<InstituteClassSubjectHomeworksSubmissionResponseDto>> {
    return await this.submissionsService.findAll(queryDto, req.user);
  }

  @Get('institute/:instituteId/submissions')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ anyInstituteRole: true })
  @ApiOperation({ 
    summary: 'Get all homework submissions for a specific institute', 
    description: 'Retrieve homework submissions filtered by institute. Institute admins can access their institutes, teachers can access based on their subject assignments.' 
  })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiQuery({ name: 'classId', required: false, description: 'Filter by class ID' })
  @ApiQuery({ name: 'subjectId', required: false, description: 'Filter by subject ID' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page' })
  async getInstituteSubmissions(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Query() queryDto: QueryInstituteClassSubjectHomeworksSubmissionDto,
    @Request() req: JwtRequest
  ): Promise<PaginatedResponseDto<InstituteClassSubjectHomeworksSubmissionResponseDto>> {
    const user = req.user;

    // Access control will be handled by decorators

    queryDto.instituteId = instituteId;
    return await this.submissionsService.findAll(queryDto);
  }

  @Get('with-details/:id')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ anyInstituteRole: true })
  @ApiOperation({ summary: 'Get a homework submission by ID with full related entity details' })
  @ApiParam({ name: 'id', description: 'Homework submission ID' })
  @ApiResponse({ status: 200, description: 'Homework submission details with full related entities' })
  @ApiResponse({ status: 404, description: 'Homework submission not found' })
  async findOneWithDetails(@Param('id', ParseBigIntPipe) id: string): Promise<any> {
    return await this.submissionsService.findOneWithDetails(id);
  }

  @Get(':id')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ anyInstituteRole: true })
  @ApiOperation({ summary: 'Get a homework submission by ID' })
  @ApiParam({ name: 'id', description: 'Homework submission ID' })
  @ApiResponse({ status: 200, description: 'Homework submission details', type: InstituteClassSubjectHomeworksSubmissionResponseDto })
  @ApiResponse({ status: 404, description: 'Homework submission not found' })
  async findOne(@Param('id', ParseBigIntPipe) id: string): Promise<InstituteClassSubjectHomeworksSubmissionResponseDto> {
    return await this.submissionsService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ anyInstituteRole: true })
  @ApiOperation({ summary: 'Update a homework submission' })
  @ApiParam({ name: 'id', description: 'Homework submission ID' })
  @ApiResponse({ status: 200, description: 'Homework submission updated successfully', type: InstituteClassSubjectHomeworksSubmissionResponseDto })
  @ApiResponse({ status: 404, description: 'Homework submission not found' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  async update(@Param('id', ParseBigIntPipe) id: string, @Body() updateDto: UpdateInstituteClassSubjectHomeworksSubmissionDto): Promise<InstituteClassSubjectHomeworksSubmissionResponseDto> {
    return await this.submissionsService.update(id, updateDto);
  }

  @Delete(':id')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true, teacher: true })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a homework submission (Institute Admin or Teacher)' })
  @ApiParam({ name: 'id', description: 'Homework submission ID' })
  @ApiResponse({ status: 204, description: 'Homework submission deleted successfully' })
  @ApiResponse({ status: 404, description: 'Homework submission not found' })
  async remove(@Param('id', ParseBigIntPipe) id: string): Promise<void> {
    await this.submissionsService.remove(id);
  }
}
