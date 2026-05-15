import { ParseIdPipe } from '../../../common/pipes/parse-id.pipe';
import { Controller, Get, Post, Body, Patch, Param, Delete, Query, HttpCode, HttpStatus, UseGuards, Request, UseInterceptors } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { FlexibleAccessGuard } from '../../../auth/guards/flexible-access.guard';
import { RequireAnyOfRoles } from '../../../auth/decorators/flexible-access.decorator';
import { InstituteClassSubjectLecturesService, QueryLectureDto } from './institute_class_subject_lectures.service';
import { CreateInstituteClassSubjectLectureDto, BulkCreateLecturesDto, CreateSingleLectureDto } from './dto/create-institute_class_subject_lecture.dto';
import { UpdateInstituteClassSubjectLectureDto } from './dto/update-institute-class-subject-lecture.dto';
import { InstituteClassSubjectLecture } from './entities/institute_class_subject_lecture.entity';
import { PaginatedResponseDto } from '../../../common/dto/paginated-response.dto';
import { UserType } from '../../user/enums/user-type.enum';
import { SerializeDatesInterceptor } from './interceptors/serialize-dates.interceptor';

@ApiTags('Institute Class Subject Lectures')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@UseInterceptors(SerializeDatesInterceptor)
@Controller('institute-class-subject-lectures')
export class InstituteClassSubjectLecturesController {
  constructor(private readonly lecturesService: InstituteClassSubjectLecturesService) {}

  @Post()
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: true
  })
  @ApiOperation({ summary: 'Create a new lecture (Institute Admin or Teacher)' })
  @ApiResponse({ status: 201, description: 'Lecture created successfully', type: InstituteClassSubjectLecture })
  @ApiResponse({ status: 400, description: 'Bad request' })
  async create(@Body() createDto: CreateInstituteClassSubjectLectureDto | CreateSingleLectureDto): Promise<InstituteClassSubjectLecture> {
    // Handle both structures - check if lectures property exists (nested structure)
    if ('lectures' in createDto && typeof createDto.lectures === 'object' && !Array.isArray(createDto.lectures)) {
      // Handle recodingUrl typo in nested structure
      const lectureData = { ...createDto.lectures };
      if ('recodingUrl' in lectureData && !lectureData.recordingUrl) {
        lectureData.recordingUrl = (lectureData as any).recodingUrl;
        delete (lectureData as any).recodingUrl;
      }
      
      // Convert nested structure to flat structure
      // Only map fields that exist in LectureDataDto
      const flatDto: CreateInstituteClassSubjectLectureDto = {
        instituteId: createDto.instituteId,
        classId: createDto.classId,
        subjectId: createDto.subjectId,
        instructorId: createDto.instructorId,
        title: lectureData.title,
        description: lectureData.description,
        lectureType: lectureData.lectureType,
        venue: lectureData.venue,
        startTime: lectureData.startTime, // Explicitly include startTime
        endTime: lectureData.endTime, // Explicitly include endTime
        meetingLink: lectureData.meetingLink,
        meetingId: lectureData.meetingId,
        meetingPassword: lectureData.meetingPassword,
        recordingUrl: lectureData.recordingUrl,
        isRecorded: (lectureData as any).isRecorded,
        maxParticipants: lectureData.maxParticipants,
        status: (lectureData as any).status,
        isActive: (lectureData as any).isActive,
        materials: (lectureData as any).materials,
        thumbnailUrl: (lectureData as any).thumbnailUrl,
        welcomeMessageEnabled: (lectureData as any).welcomeMessageEnabled,
        welcomeMessageText: (lectureData as any).welcomeMessageText,
        welcomeMessageVoiceEnabled: (lectureData as any).welcomeMessageVoiceEnabled,
      };
      return await this.lecturesService.create(flatDto);
    }
    
    // Handle recodingUrl typo in flat structure
    const dto = { ...createDto } as any;
    if ('recodingUrl' in dto && !dto.recordingUrl) {
      dto.recordingUrl = dto.recodingUrl;
      delete dto.recodingUrl;
    }
    
    // Handle original flat structure
    return await this.lecturesService.create(dto as CreateInstituteClassSubjectLectureDto);
  }

  @Get()
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    anyInstituteRole: true
  })
  @ApiOperation({ summary: 'Get all lectures with filtering and pagination' })
  @ApiResponse({ status: 200, description: 'List of lectures', type: PaginatedResponseDto<InstituteClassSubjectLecture> })
  async findAll(
    @Query() queryDto: QueryLectureDto,
    @Request() req: any
  ): Promise<PaginatedResponseDto<InstituteClassSubjectLecture>> {
    return await this.lecturesService.findAll(queryDto, req.user);
  }

  @Get('schedule/:date')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    anyInstituteRole: true
  })
  @ApiOperation({ summary: 'Get lecture schedule for a specific date' })
  @ApiParam({ name: 'date', description: 'Date in YYYY-MM-DD format' })
  @ApiResponse({ status: 200, description: 'Schedule retrieved successfully' })
  async getSchedule(@Param('date') date: string, @Query() query: QueryLectureDto, @Request() req: any): Promise<InstituteClassSubjectLecture[]> {
    return await this.lecturesService.getSchedule(date, query, req.user);
  }

  @Get(':id')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    anyInstituteRole: true
  })
  @ApiOperation({ summary: 'Get lecture by ID' })
  @ApiParam({ name: 'id', description: 'Lecture ID' })
  @ApiResponse({ status: 200, description: 'Lecture retrieved successfully', type: InstituteClassSubjectLecture })
  @ApiResponse({ status: 404, description: 'Lecture not found' })
  async findOne(@Param('id', ParseIdPipe) id: string, @Request() req: any): Promise<InstituteClassSubjectLecture> {
    return await this.lecturesService.findOne(id, req.user);
  }

  @Patch(':id')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: true
  })
  @ApiOperation({ summary: 'Update lecture (Institute Admin or Teacher)' })
  @ApiParam({ name: 'id', description: 'Lecture ID' })
  @ApiResponse({ status: 200, description: 'Lecture updated successfully', type: InstituteClassSubjectLecture })
  @ApiResponse({ status: 404, description: 'Lecture not found' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  async update(
    @Param('id', ParseIdPipe) id: string, 
    @Body() updateDto: UpdateInstituteClassSubjectLectureDto,
    @Request() req: any
  ): Promise<InstituteClassSubjectLecture> {
    return await this.lecturesService.update(id, updateDto, req.user);
  }

  @Delete(':id')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN]
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete lecture (Super Admin Only)' })
  @ApiParam({ name: 'id', description: 'Lecture ID' })
  @ApiResponse({ status: 204, description: 'Lecture deleted successfully' })
  @ApiResponse({ status: 404, description: 'Lecture not found' })
  async remove(@Param('id', ParseIdPipe) id: string): Promise<void> {
    await this.lecturesService.remove(id);
  }

  @Delete(':id/permanent')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true
  })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Permanently delete lecture (Institute Admin or Super Admin)',
    description: 'Permanently deletes the lecture from database. This action cannot be undone. Only accessible to Institute Admins and Super Admins.'
  })
  @ApiParam({ name: 'id', description: 'Lecture ID' })
  @ApiResponse({ 
    status: 200, 
    description: 'Lecture permanently deleted successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'Lecture permanently deleted successfully' },
        lectureId: { type: 'string', example: '123' },
        instituteId: { type: 'string', example: '1' }
      }
    }
  })
  @ApiResponse({ status: 404, description: 'Lecture not found' })
  @ApiResponse({ status: 403, description: 'Forbidden - Only institute admins and super admins can permanently delete lectures' })
  async removePermanent(
    @Param('id', ParseIdPipe) id: string,
    @Request() req: any
  ): Promise<any> {
    return await this.lecturesService.removePermanent(id, req.user);
  }

  @Post('bulk')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: true
  })
  @ApiOperation({ summary: 'Create multiple lectures (Institute Admin or Teacher)' })
  @ApiResponse({ status: 201, description: 'Lectures created successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  async createBulk(@Body() bulkDto: BulkCreateLecturesDto): Promise<InstituteClassSubjectLecture[]> {
    // Convert bulk DTO to array of individual DTOs
    const createDtos: CreateInstituteClassSubjectLectureDto[] = bulkDto.lectures.map(lecture => ({
      instituteId: bulkDto.instituteId,
      classId: bulkDto.classId,
      subjectId: bulkDto.subjectId,
      instructorId: bulkDto.instructorId,
      ...lecture
    }));
    
    return await this.lecturesService.createBulk(createDtos);
  }
}

