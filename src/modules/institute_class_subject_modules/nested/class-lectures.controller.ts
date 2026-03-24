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
import {
  InstituteClassSubjectLecturesService,
  QueryLectureDto,
} from '../institute_class_subject_lectures/institute_class_subject_lectures.service';
import { CreateInstituteClassSubjectLectureDto } from '../institute_class_subject_lectures/dto/create-institute_class_subject_lecture.dto';
import { UpdateInstituteClassSubjectLectureDto } from '../institute_class_subject_lectures/dto/update-institute-class-subject-lecture.dto';
import { InstituteClassSubjectLecture } from '../institute_class_subject_lectures/entities/institute_class_subject_lecture.entity';
import { PaginatedResponseDto } from '../../../common/dto/paginated-response.dto';
import { UserType } from '../../user/enums/user-type.enum';
import { SerializeDatesInterceptor } from '../institute_class_subject_lectures/interceptors/serialize-dates.interceptor';

@ApiTags('Institute Class Lectures')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@UseInterceptors(SerializeDatesInterceptor)
@Controller('institutes/:instituteId/classes/:classId/lectures')
export class ClassLecturesController {
  constructor(private readonly lecturesService: InstituteClassSubjectLecturesService) {}

  @Post()
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true, teacher: true })
  @ApiOperation({ summary: 'Create a lecture for a class' })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiParam({ name: 'classId', description: 'Class ID' })
  @ApiBody({ type: CreateInstituteClassSubjectLectureDto })
  @ApiResponse({ status: 201, description: 'Lecture created successfully', type: InstituteClassSubjectLecture })
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Param('classId', ParseBigIntPipe) classId: string,
    @Body() createDto: CreateInstituteClassSubjectLectureDto,
  ): Promise<InstituteClassSubjectLecture> {
    createDto.instituteId = instituteId;
    createDto.classId = classId;
    return this.lecturesService.create(createDto);
  }

  @Get()
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ anyInstituteRole: true })
  @ApiOperation({ summary: 'Get all lectures for a class' })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiParam({ name: 'classId', description: 'Class ID' })
  @ApiQuery({ name: 'subjectId', required: false, description: 'Filter by subject' })
  @ApiQuery({ name: 'lectureType', required: false, description: 'Filter by lecture type' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by status' })
  @ApiQuery({ name: 'dateFrom', required: false, description: 'Filter from date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'dateTo', required: false, description: 'Filter to date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'search', required: false, description: 'Search in title' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page' })
  @ApiResponse({ status: 200, description: 'Lectures retrieved successfully', type: PaginatedResponseDto<InstituteClassSubjectLecture> })
  @HttpCode(HttpStatus.OK)
  async findAll(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Param('classId', ParseBigIntPipe) classId: string,
    @Query() query: QueryLectureDto,
    @Request() req: any,
  ): Promise<PaginatedResponseDto<InstituteClassSubjectLecture>> {
    query.instituteId = instituteId;
    query.classId = classId;
    return this.lecturesService.findAll(query, req.user);
  }

  @Get('schedule/:date')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ anyInstituteRole: true })
  @ApiOperation({ summary: 'Get lecture schedule for a specific date' })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiParam({ name: 'classId', description: 'Class ID' })
  @ApiParam({ name: 'date', description: 'Date in YYYY-MM-DD format' })
  @ApiResponse({ status: 200, description: 'Schedule retrieved successfully' })
  @HttpCode(HttpStatus.OK)
  async getSchedule(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Param('classId', ParseBigIntPipe) classId: string,
    @Param('date') date: string,
    @Query() query: QueryLectureDto,
    @Request() req: any,
  ): Promise<InstituteClassSubjectLecture[]> {
    query.instituteId = instituteId;
    query.classId = classId;
    return this.lecturesService.getSchedule(date, query, req.user);
  }

  @Get(':id')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ anyInstituteRole: true })
  @ApiOperation({ summary: 'Get a lecture by ID' })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiParam({ name: 'classId', description: 'Class ID' })
  @ApiParam({ name: 'id', description: 'Lecture ID' })
  @ApiResponse({ status: 200, description: 'Lecture retrieved successfully', type: InstituteClassSubjectLecture })
  @ApiResponse({ status: 404, description: 'Lecture not found' })
  @HttpCode(HttpStatus.OK)
  async findOne(
    @Param('id', ParseBigIntPipe) id: string,
    @Request() req: any,
  ): Promise<InstituteClassSubjectLecture> {
    return this.lecturesService.findOne(id, req.user);
  }

  @Patch(':id')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true, teacher: true })
  @ApiOperation({ summary: 'Update a lecture' })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiParam({ name: 'classId', description: 'Class ID' })
  @ApiParam({ name: 'id', description: 'Lecture ID' })
  @ApiBody({ type: UpdateInstituteClassSubjectLectureDto })
  @ApiResponse({ status: 200, description: 'Lecture updated successfully', type: InstituteClassSubjectLecture })
  @ApiResponse({ status: 404, description: 'Lecture not found' })
  @HttpCode(HttpStatus.OK)
  async update(
    @Param('id', ParseBigIntPipe) id: string,
    @Body() updateDto: UpdateInstituteClassSubjectLectureDto,
    @Request() req: any,
  ): Promise<InstituteClassSubjectLecture> {
    return this.lecturesService.update(id, updateDto, req.user);
  }

  @Delete(':id')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({ summary: 'Delete a lecture (Institute Admin or Super Admin)' })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiParam({ name: 'classId', description: 'Class ID' })
  @ApiParam({ name: 'id', description: 'Lecture ID' })
  @ApiResponse({ status: 204, description: 'Lecture deleted successfully' })
  @ApiResponse({ status: 404, description: 'Lecture not found' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseBigIntPipe) id: string): Promise<void> {
    return this.lecturesService.remove(id);
  }
}
