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
import { InstituteClassSubjectHomeworksSubmissionsService } from '../institute_class_subject_homeworks_submissions/institute_class_subject_homeworks_submissions.service';
import { CreateInstituteClassSubjectHomeworksSubmissionDto } from '../institute_class_subject_homeworks_submissions/dto/create-institute_class_subject_homeworks_submission.dto';
import { UpdateInstituteClassSubjectHomeworksSubmissionDto } from '../institute_class_subject_homeworks_submissions/dto/update-institute_class_subject_homeworks_submission.dto';
import { QueryInstituteClassSubjectHomeworksSubmissionDto } from '../institute_class_subject_homeworks_submissions/dto/query-institute_class_subject_homeworks_submission.dto';
import { InstituteClassSubjectHomeworksSubmissionResponseDto } from '../institute_class_subject_homeworks_submissions/dto/institute_class_subject_homeworks_submission-response.dto';
import { PaginatedResponseDto } from '../../../common/dto/paginated-response.dto';
import { UserType } from '../../user/enums/user-type.enum';
import { SerializeDatesInterceptor } from '../institute_class_subject_homeworks_submissions/interceptors/serialize-dates.interceptor';

@ApiTags('Institute Class Homework Submissions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@UseInterceptors(SerializeDatesInterceptor)
@Controller('institutes/:instituteId/classes/:classId/homeworks/:homeworkId/submissions')
export class ClassHomeworkSubmissionsController {
  constructor(private readonly submissionsService: InstituteClassSubjectHomeworksSubmissionsService) {}

  @Post()
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ anyInstituteRole: true })
  @ApiOperation({ summary: 'Submit a homework' })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiParam({ name: 'classId', description: 'Class ID' })
  @ApiParam({ name: 'homeworkId', description: 'Homework ID' })
  @ApiBody({ type: CreateInstituteClassSubjectHomeworksSubmissionDto })
  @ApiResponse({ status: 201, description: 'Submission created successfully', type: InstituteClassSubjectHomeworksSubmissionResponseDto })
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Param('classId', ParseBigIntPipe) classId: string,
    @Param('homeworkId', ParseBigIntPipe) homeworkId: string,
    @Body() createDto: CreateInstituteClassSubjectHomeworksSubmissionDto,
  ): Promise<InstituteClassSubjectHomeworksSubmissionResponseDto> {
    createDto.homeworkId = homeworkId;
    return this.submissionsService.create(createDto);
  }

  @Get()
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ anyInstituteRole: true })
  @ApiOperation({ summary: 'Get all submissions for a homework' })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiParam({ name: 'classId', description: 'Class ID' })
  @ApiParam({ name: 'homeworkId', description: 'Homework ID' })
  @ApiQuery({ name: 'studentId', required: false, description: 'Filter by student ID' })
  @ApiQuery({ name: 'subjectId', required: false, description: 'Filter by subject ID' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page' })
  @ApiResponse({ status: 200, description: 'Submissions retrieved successfully' })
  @HttpCode(HttpStatus.OK)
  async findAll(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Param('classId', ParseBigIntPipe) classId: string,
    @Param('homeworkId', ParseBigIntPipe) homeworkId: string,
    @Query() queryDto: QueryInstituteClassSubjectHomeworksSubmissionDto,
    @Request() req: any,
  ): Promise<PaginatedResponseDto<InstituteClassSubjectHomeworksSubmissionResponseDto>> {
    queryDto.instituteId = instituteId;
    queryDto.classId = classId;
    queryDto.homeworkId = homeworkId;
    return this.submissionsService.findAll(queryDto, req.user);
  }

  @Get(':id')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ anyInstituteRole: true })
  @ApiOperation({ summary: 'Get a submission by ID' })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiParam({ name: 'classId', description: 'Class ID' })
  @ApiParam({ name: 'homeworkId', description: 'Homework ID' })
  @ApiParam({ name: 'id', description: 'Submission ID' })
  @ApiResponse({ status: 200, description: 'Submission details', type: InstituteClassSubjectHomeworksSubmissionResponseDto })
  @ApiResponse({ status: 404, description: 'Submission not found' })
  @HttpCode(HttpStatus.OK)
  async findOne(
    @Param('id', ParseBigIntPipe) id: string,
  ): Promise<InstituteClassSubjectHomeworksSubmissionResponseDto> {
    return this.submissionsService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true, teacher: true })
  @ApiOperation({ summary: 'Update a submission (grade/remarks)' })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiParam({ name: 'classId', description: 'Class ID' })
  @ApiParam({ name: 'homeworkId', description: 'Homework ID' })
  @ApiParam({ name: 'id', description: 'Submission ID' })
  @ApiBody({ type: UpdateInstituteClassSubjectHomeworksSubmissionDto })
  @ApiResponse({ status: 200, description: 'Submission updated successfully', type: InstituteClassSubjectHomeworksSubmissionResponseDto })
  @ApiResponse({ status: 404, description: 'Submission not found' })
  @HttpCode(HttpStatus.OK)
  async update(
    @Param('id', ParseBigIntPipe) id: string,
    @Body() updateDto: UpdateInstituteClassSubjectHomeworksSubmissionDto,
    @Request() req: any,
  ): Promise<InstituteClassSubjectHomeworksSubmissionResponseDto> {
    return this.submissionsService.update(id, updateDto, req.user);
  }

  @Delete(':id')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true, teacher: true })
  @ApiOperation({ summary: 'Delete a submission' })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiParam({ name: 'classId', description: 'Class ID' })
  @ApiParam({ name: 'homeworkId', description: 'Homework ID' })
  @ApiParam({ name: 'id', description: 'Submission ID' })
  @ApiResponse({ status: 204, description: 'Submission deleted successfully' })
  @ApiResponse({ status: 404, description: 'Submission not found' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id', ParseBigIntPipe) id: string,
    @Request() req: any,
  ): Promise<void> {
    return this.submissionsService.remove(id, req.user);
  }
}
