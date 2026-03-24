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
import { InstituteClassSubjectHomeworksService } from '../institute_class_subject_homeworks/institute_class_subject_homeworks.service';
import { CreateInstituteClassSubjectHomeworkDto } from '../institute_class_subject_homeworks/dto/create-institute_class_subject_homework.dto';
import { UpdateInstituteClassSubjectHomeworkDto } from '../institute_class_subject_homeworks/dto/update-institute_class_subject_homework.dto';
import { QueryInstituteClassSubjectHomeworkDto } from '../institute_class_subject_homeworks/dto/query-institute-class-subject-homework.dto';
import {
  InstituteClassSubjectHomeworkResponseDto,
  PaginatedInstituteClassSubjectHomeworkResponseDto,
} from '../institute_class_subject_homeworks/dto/institute-class-subject-homework-response.dto';
import { UserType } from '../../user/enums/user-type.enum';
import { SerializeDatesInterceptor } from '../institute_class_subject_homeworks/interceptors/serialize-dates.interceptor';

@ApiTags('Institute Class Homeworks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@UseInterceptors(SerializeDatesInterceptor)
@UsePipes(new ValidationPipe({ transform: true }))
@Controller('institutes/:instituteId/classes/:classId/homeworks')
export class ClassHomeworksController {
  constructor(private readonly homeworksService: InstituteClassSubjectHomeworksService) {}

  @Post()
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true, teacher: true })
  @ApiOperation({ summary: 'Create a homework for a class' })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiParam({ name: 'classId', description: 'Class ID' })
  @ApiBody({ type: CreateInstituteClassSubjectHomeworkDto })
  @ApiResponse({ status: 201, description: 'Homework created successfully', type: InstituteClassSubjectHomeworkResponseDto })
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Param('classId', ParseBigIntPipe) classId: string,
    @Body() createDto: CreateInstituteClassSubjectHomeworkDto,
  ): Promise<InstituteClassSubjectHomeworkResponseDto> {
    createDto.instituteId = instituteId;
    createDto.classId = classId;
    return this.homeworksService.create(createDto);
  }

  @Get()
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ anyInstituteRole: true })
  @ApiOperation({ summary: 'Get all homeworks for a class' })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiParam({ name: 'classId', description: 'Class ID' })
  @ApiQuery({ name: 'subjectId', required: false, description: 'Filter by subject ID' })
  @ApiQuery({ name: 'teacherId', required: false, description: 'Filter by teacher ID' })
  @ApiQuery({ name: 'search', required: false, description: 'Search in title or description' })
  @ApiQuery({ name: 'fromDate', required: false, description: 'Filter from start date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'toDate', required: false, description: 'Filter to end date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page (default: 10)' })
  @ApiQuery({ name: 'sortBy', required: false, enum: ['title', 'startDate', 'endDate', 'createdAt'], description: 'Sort field' })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['ASC', 'DESC'], description: 'Sort order' })
  @ApiQuery({ name: 'includeReferences', required: false, type: Boolean, description: 'Include reference materials' })
  @ApiQuery({ name: 'includeSubmissions', required: false, type: Boolean, description: 'Include student submissions (JWT filtered)' })
  @ApiResponse({ status: 200, description: 'Homeworks retrieved successfully', type: PaginatedInstituteClassSubjectHomeworkResponseDto })
  @HttpCode(HttpStatus.OK)
  async findAll(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Param('classId', ParseBigIntPipe) classId: string,
    @Query() query: QueryInstituteClassSubjectHomeworkDto,
    @Request() req: any,
  ): Promise<PaginatedInstituteClassSubjectHomeworkResponseDto> {
    query.instituteId = instituteId;
    query.classId = classId;
    return this.homeworksService.findAll(query, req.user);
  }

  @Get(':id')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ anyInstituteRole: true })
  @ApiOperation({ summary: 'Get a homework by ID' })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiParam({ name: 'classId', description: 'Class ID' })
  @ApiParam({ name: 'id', description: 'Homework ID' })
  @ApiResponse({ status: 200, description: 'Homework retrieved successfully', type: InstituteClassSubjectHomeworkResponseDto })
  @ApiResponse({ status: 404, description: 'Homework not found' })
  @HttpCode(HttpStatus.OK)
  async findOne(
    @Param('id', ParseBigIntPipe) id: string,
    @Request() req: any,
  ): Promise<InstituteClassSubjectHomeworkResponseDto> {
    return this.homeworksService.findOne(id, req.user);
  }

  @Patch(':id')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true, teacher: true })
  @ApiOperation({ summary: 'Update a homework' })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiParam({ name: 'classId', description: 'Class ID' })
  @ApiParam({ name: 'id', description: 'Homework ID' })
  @ApiBody({ type: UpdateInstituteClassSubjectHomeworkDto })
  @ApiResponse({ status: 200, description: 'Homework updated successfully', type: InstituteClassSubjectHomeworkResponseDto })
  @ApiResponse({ status: 404, description: 'Homework not found' })
  @HttpCode(HttpStatus.OK)
  async update(
    @Param('id', ParseBigIntPipe) id: string,
    @Body() updateDto: UpdateInstituteClassSubjectHomeworkDto,
    @Request() req: any,
  ): Promise<InstituteClassSubjectHomeworkResponseDto> {
    return this.homeworksService.update(id, updateDto, req.user);
  }

  @Delete(':id')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true, teacher: true })
  @ApiOperation({ summary: 'Delete a homework' })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiParam({ name: 'classId', description: 'Class ID' })
  @ApiParam({ name: 'id', description: 'Homework ID' })
  @ApiResponse({ status: 204, description: 'Homework deleted successfully' })
  @ApiResponse({ status: 404, description: 'Homework not found' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id', ParseBigIntPipe) id: string,
    @Request() req: any,
  ): Promise<void> {
    return this.homeworksService.remove(id, req.user);
  }
}
