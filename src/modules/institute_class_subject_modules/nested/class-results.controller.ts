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
  BadRequestException,
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
import { InstituteClassSubjectResaultsService } from '../institute_class_subject_resaults/institute_class_subject_resaults.service';
import { CreateInstituteClassSubjectResaultDto } from '../institute_class_subject_resaults/dto/create-institute_class_subject_resault.dto';
import { CreateBulkResultsDto } from '../institute_class_subject_resaults/dto/create-bulk-results.dto';
import { UpdateInstituteClassSubjectResaultDto } from '../institute_class_subject_resaults/dto/update-institute_class_subject_resault.dto';
import { QueryInstituteClassSubjectResaultDto } from '../institute_class_subject_resaults/dto/query-institute_class_subject_resault.dto';
import { InstituteClassSubjectResaultResponseDto } from '../institute_class_subject_resaults/dto/institute_class_subject_resault-response.dto';
import { StudentExamMarkDto } from '../institute_class_subject_resaults/dto/student-exam-mark.dto';
import { PaginatedResponseDto } from '../../../common/dto/paginated-response.dto';
import { UserType } from '../../user/enums/user-type.enum';

@ApiTags('Institute Class Results')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('institutes/:instituteId/classes/:classId/results')
export class ClassResultsController {
  constructor(private readonly resultsService: InstituteClassSubjectResaultsService) {}

  @Post()
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true, teacher: { requireClass: true, requireSubject: true } })
  @ApiOperation({ summary: 'Create an exam result for a student in a class' })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiParam({ name: 'classId', description: 'Class ID' })
  @ApiBody({ type: CreateInstituteClassSubjectResaultDto })
  @ApiResponse({ status: 201, description: 'Result created successfully', type: InstituteClassSubjectResaultResponseDto })
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Param('classId', ParseBigIntPipe) classId: string,
    @Body() createDto: CreateInstituteClassSubjectResaultDto,
  ): Promise<InstituteClassSubjectResaultResponseDto> {
    createDto.instituteId = instituteId;
    createDto.classId = classId;
    return this.resultsService.create(createDto);
  }

  @Post('bulk')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true, teacher: { requireClass: true, requireSubject: true } })
  @ApiOperation({ summary: 'Bulk create exam results for a class' })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiParam({ name: 'classId', description: 'Class ID' })
  @ApiBody({ type: CreateBulkResultsDto })
  @ApiResponse({ status: 201, description: 'Results created successfully' })
  @HttpCode(HttpStatus.CREATED)
  async createBulk(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Param('classId', ParseBigIntPipe) classId: string,
    @Body() createBulkDto: CreateBulkResultsDto,
  ): Promise<InstituteClassSubjectResaultResponseDto[]> {
    return this.resultsService.createBulk(createBulkDto);
  }

  @Get()
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ anyInstituteRole: true })
  @ApiOperation({ summary: 'Get all results for a class' })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiParam({ name: 'classId', description: 'Class ID' })
  @ApiQuery({ name: 'subjectId', required: false, description: 'Filter by subject ID' })
  @ApiQuery({ name: 'studentId', required: false, description: 'Filter by student ID' })
  @ApiQuery({ name: 'examId', required: false, description: 'Filter by exam ID' })
  @ApiQuery({ name: 'grade', required: false, description: 'Filter by grade' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page (default: 10)' })
  @ApiResponse({ status: 200, description: 'Results retrieved successfully' })
  @HttpCode(HttpStatus.OK)
  async findAll(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Param('classId', ParseBigIntPipe) classId: string,
    @Query() queryDto: QueryInstituteClassSubjectResaultDto,
    @Request() req: any,
  ): Promise<PaginatedResponseDto<InstituteClassSubjectResaultResponseDto>> {
    queryDto.instituteId = instituteId;
    queryDto.classId = classId;
    return this.resultsService.findAll(queryDto, req.user);
  }

  @Get('students-with-marks')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true, teacher: { requireClass: true, requireSubject: true } })
  @ApiOperation({ summary: 'Get all students with their exam marks' })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiParam({ name: 'classId', description: 'Class ID' })
  @ApiQuery({ name: 'subjectId', required: true, description: 'Subject ID' })
  @ApiQuery({ name: 'examId', required: true, description: 'Exam ID' })
  @ApiResponse({ status: 200, description: 'Students with marks', type: [StudentExamMarkDto] })
  @HttpCode(HttpStatus.OK)
  async getStudentsWithExamMarks(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Param('classId', ParseBigIntPipe) classId: string,
    @Query('subjectId') subjectId: string,
    @Query('examId') examId: string,
  ): Promise<StudentExamMarkDto[]> {
    if (!subjectId || !examId) {
      throw new BadRequestException('subjectId and examId query parameters are required');
    }
    return this.resultsService.getStudentsWithExamMarks(instituteId, classId, subjectId, examId);
  }

  @Get(':id')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ anyInstituteRole: true })
  @ApiOperation({ summary: 'Get a result by ID' })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiParam({ name: 'classId', description: 'Class ID' })
  @ApiParam({ name: 'id', description: 'Result ID' })
  @ApiResponse({ status: 200, description: 'Result details', type: InstituteClassSubjectResaultResponseDto })
  @ApiResponse({ status: 404, description: 'Result not found' })
  @HttpCode(HttpStatus.OK)
  async findOne(
    @Param('id', ParseBigIntPipe) id: string,
  ): Promise<InstituteClassSubjectResaultResponseDto> {
    return this.resultsService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true, teacher: { requireClass: true, requireSubject: true } })
  @ApiOperation({ summary: 'Update a result' })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiParam({ name: 'classId', description: 'Class ID' })
  @ApiParam({ name: 'id', description: 'Result ID' })
  @ApiBody({ type: UpdateInstituteClassSubjectResaultDto })
  @ApiResponse({ status: 200, description: 'Result updated successfully', type: InstituteClassSubjectResaultResponseDto })
  @ApiResponse({ status: 404, description: 'Result not found' })
  @HttpCode(HttpStatus.OK)
  async update(
    @Param('id', ParseBigIntPipe) id: string,
    @Body() updateDto: UpdateInstituteClassSubjectResaultDto,
  ): Promise<InstituteClassSubjectResaultResponseDto> {
    return this.resultsService.update(id, updateDto);
  }

  @Delete(':id')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({ summary: 'Delete a result' })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiParam({ name: 'classId', description: 'Class ID' })
  @ApiParam({ name: 'id', description: 'Result ID' })
  @ApiResponse({ status: 204, description: 'Result deleted successfully' })
  @ApiResponse({ status: 404, description: 'Result not found' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseBigIntPipe) id: string): Promise<void> {
    return this.resultsService.remove(id);
  }
}
