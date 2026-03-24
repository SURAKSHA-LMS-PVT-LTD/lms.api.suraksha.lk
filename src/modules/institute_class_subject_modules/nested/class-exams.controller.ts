import { ParseBigIntPipe } from '../../../common/pipes/parse-bigint.pipe';
import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  Request,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBearerAuth,
  ApiBody,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { FlexibleAccessGuard } from '../../../auth/guards/flexible-access.guard';
import { RequireAnyOfRoles } from '../../../auth/decorators/flexible-access.decorator';
import { InstituteClassSubjectExamsService } from '../institute_class_subject_exams/institute_class_subject_exams.service';
import { CreateInstituteClassSubjectExamDto } from '../institute_class_subject_exams/dto/create-institute_class_subject_exam.dto';
import { UpdateInstituteClassSubjectExamDto } from '../institute_class_subject_exams/dto/update-institute_class_subject_exam.dto';
import { QueryInstituteClassSubjectExamDto } from '../institute_class_subject_exams/dto/query-institute-class-subject-exam.dto';
import { InstituteClassSubjectExamResponseDto } from '../institute_class_subject_exams/dto/institute-class-subject-exam-response.dto';
import { PaginatedInstituteClassSubjectExamResponseDto } from '../institute_class_subject_exams/dto/paginated-institute-class-subject-exam-response.dto';
import { UserType } from '../../user/enums/user-type.enum';
import { SerializeDatesInterceptor } from '../institute_class_subject_exams/interceptors/serialize-dates.interceptor';

@ApiTags('Institute Class Exams')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@UseInterceptors(SerializeDatesInterceptor)
@UsePipes(new ValidationPipe({ transform: true }))
@Controller('institutes/:instituteId/classes/:classId/exams')
export class ClassExamsController {
  constructor(private readonly examsService: InstituteClassSubjectExamsService) {}

  @Post()
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true, teacher: true })
  @ApiOperation({ summary: 'Create an exam for a class' })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiParam({ name: 'classId', description: 'Class ID' })
  @ApiBody({ type: CreateInstituteClassSubjectExamDto })
  @ApiResponse({ status: 201, description: 'Exam created successfully', type: InstituteClassSubjectExamResponseDto })
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Param('classId', ParseBigIntPipe) classId: string,
    @Body() createDto: CreateInstituteClassSubjectExamDto,
    @Request() req: any,
  ): Promise<InstituteClassSubjectExamResponseDto> {
    createDto.instituteId = instituteId;
    createDto.classId = classId;
    const currentUserId = req.user?.s || req.user?.userId;
    return this.examsService.create(createDto, currentUserId);
  }

  @Get()
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ anyInstituteRole: true })
  @ApiOperation({ summary: 'Get all exams for a class' })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiParam({ name: 'classId', description: 'Class ID' })
  @ApiQuery({ name: 'subjectId', required: false, description: 'Filter by subject ID' })
  @ApiQuery({ name: 'examType', required: false, enum: ['online', 'physical'], description: 'Filter by exam type' })
  @ApiQuery({ name: 'status', required: false, enum: ['draft', 'scheduled', 'active', 'completed', 'cancelled'], description: 'Filter by status' })
  @ApiQuery({ name: 'fromDate', required: false, description: 'Filter from date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'toDate', required: false, description: 'Filter to date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'search', required: false, description: 'Search in title or description' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page (default: 10)' })
  @ApiQuery({ name: 'sortBy', required: false, description: 'Sort field' })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['ASC', 'DESC'], description: 'Sort order' })
  @ApiResponse({ status: 200, description: 'Exams retrieved successfully', type: PaginatedInstituteClassSubjectExamResponseDto })
  @HttpCode(HttpStatus.OK)
  async findAll(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Param('classId', ParseBigIntPipe) classId: string,
    @Query() query: QueryInstituteClassSubjectExamDto,
    @Request() req: any,
  ): Promise<PaginatedInstituteClassSubjectExamResponseDto> {
    query.instituteId = instituteId;
    query.classId = classId;
    return this.examsService.findAll(query, req.user);
  }

  @Get('upcoming')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ anyInstituteRole: true })
  @ApiOperation({ summary: 'Get upcoming exams for a class' })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiParam({ name: 'classId', description: 'Class ID' })
  @ApiResponse({ status: 200, description: 'Upcoming exams retrieved successfully', type: [InstituteClassSubjectExamResponseDto] })
  @HttpCode(HttpStatus.OK)
  async findUpcoming(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Request() req: any,
  ): Promise<InstituteClassSubjectExamResponseDto[]> {
    return this.examsService.findUpcomingExams(instituteId, req.user);
  }

  @Get(':id')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ anyInstituteRole: true })
  @ApiOperation({ summary: 'Get an exam by ID' })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiParam({ name: 'classId', description: 'Class ID' })
  @ApiParam({ name: 'id', description: 'Exam ID' })
  @ApiResponse({ status: 200, description: 'Exam retrieved successfully', type: InstituteClassSubjectExamResponseDto })
  @ApiResponse({ status: 404, description: 'Exam not found' })
  @HttpCode(HttpStatus.OK)
  async findOne(
    @Param('id', ParseBigIntPipe) id: string,
    @Request() req: any,
  ): Promise<InstituteClassSubjectExamResponseDto> {
    return this.examsService.findOne(id, req.user);
  }

  @Patch(':id')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true, teacher: true })
  @ApiOperation({ summary: 'Update an exam' })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiParam({ name: 'classId', description: 'Class ID' })
  @ApiParam({ name: 'id', description: 'Exam ID' })
  @ApiBody({ type: UpdateInstituteClassSubjectExamDto })
  @ApiResponse({ status: 200, description: 'Exam updated successfully', type: InstituteClassSubjectExamResponseDto })
  @ApiResponse({ status: 404, description: 'Exam not found' })
  @HttpCode(HttpStatus.OK)
  async update(
    @Param('id', ParseBigIntPipe) id: string,
    @Body() updateDto: UpdateInstituteClassSubjectExamDto,
    @Request() req: any,
  ): Promise<InstituteClassSubjectExamResponseDto> {
    return this.examsService.update(id, updateDto, req.user);
  }

  @Patch(':id/status')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true, teacher: true })
  @ApiOperation({ summary: 'Update exam status' })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiParam({ name: 'classId', description: 'Class ID' })
  @ApiParam({ name: 'id', description: 'Exam ID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['draft', 'scheduled', 'active', 'completed', 'cancelled'] },
      },
      required: ['status'],
    },
  })
  @ApiResponse({ status: 200, description: 'Exam status updated successfully', type: InstituteClassSubjectExamResponseDto })
  @HttpCode(HttpStatus.OK)
  async updateStatus(
    @Param('id', ParseBigIntPipe) id: string,
    @Body('status') status: 'draft' | 'scheduled' | 'active' | 'completed' | 'cancelled',
    @Request() req: any,
  ): Promise<InstituteClassSubjectExamResponseDto> {
    return this.examsService.updateStatus(id, status, req.user);
  }

  @Delete(':id')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true, teacher: true })
  @ApiOperation({ summary: 'Delete an exam' })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiParam({ name: 'classId', description: 'Class ID' })
  @ApiParam({ name: 'id', description: 'Exam ID' })
  @ApiResponse({ status: 204, description: 'Exam deleted successfully' })
  @ApiResponse({ status: 404, description: 'Exam not found' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseBigIntPipe) id: string): Promise<void> {
    return this.examsService.remove(id);
  }
}
