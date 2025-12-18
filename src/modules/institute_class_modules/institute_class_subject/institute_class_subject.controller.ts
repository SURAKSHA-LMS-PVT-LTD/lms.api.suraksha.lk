import { ParseBigIntPipe } from '../../../common/pipes/parse-bigint.pipe';
import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards, UsePipes, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { InstituteClassSubjectService } from './institute_class_subject.service';
import { CreateInstituteClassSubjectDto, BulkCreateInstituteClassSubjectDto } from './dto/create-institute_class_subject.dto';
import { UpdateInstituteClassSubjectDto } from './dto/update-institute_class_subject.dto';
import { QueryInstituteClassSubjectDto } from './dto/query-institute-class-subject.dto';
import { InstituteClassSubjectResponseDto, PaginatedInstituteClassSubjectResponseDto, BulkInstituteClassSubjectResponseDto, InstituteClassSubjectSuccessResponseDto } from './dto/institute-class-subject-response.dto';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { FlexibleAccessGuard } from '../../../auth/guards/flexible-access.guard';
import { RequireAnyOfRoles } from '../../../auth/decorators/flexible-access.decorator';
import {
  InstituteClassSubjectValidationPipe,
  BulkInstituteClassSubjectValidationPipe,
  InstituteClassSubjectParamsValidationPipe,
} from './pipes/institute-class-subject-validation.pipe';

import { UserType } from '../../user/enums/user-type.enum';


@ApiTags('Institute Class Subjects')
@ApiBearerAuth()
@Controller('institutes/:instituteId/classes/:classId/subjects')
@UseGuards(JwtAuthGuard)
export class InstituteClassSubjectController {
  constructor(private readonly instituteClassSubjectService: InstituteClassSubjectService) {}

  @Post()
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ 
    global: [UserType.SUPERADMIN], 
    instituteAdmin: true,
    teacher: { requireClass: true }
  })
  @ApiOperation({ summary: 'Assign a subject to a class (Institute Admin, Teacher, or System Admin)' })
  @ApiResponse({ status: 201, description: 'Subject assigned successfully', type: InstituteClassSubjectSuccessResponseDto })
  @ApiResponse({ status: 409, description: 'Subject already assigned to this class' })
  @ApiResponse({ status: 403, description: 'Only institute admins, teachers, or system admins can assign subjects to classes' })
  @UsePipes(InstituteClassSubjectValidationPipe)


  async create(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Param('classId', ParseBigIntPipe) classId: string,
    @Body() createDto: CreateInstituteClassSubjectDto,
  ): Promise<InstituteClassSubjectSuccessResponseDto> {
    createDto.instituteId = instituteId;
    createDto.classId = classId;
    return this.instituteClassSubjectService.create(createDto);
  }

  @Post('bulk')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ 
    global: [UserType.SUPERADMIN], 
    instituteAdmin: true,
    teacher: { requireClass: true }
  })
  @ApiOperation({ summary: 'Bulk assign subjects to a class (Institute Admin, Teacher, or System Admin)' })
  @ApiResponse({ status: 201, description: 'Subjects assignment processed successfully', type: BulkInstituteClassSubjectResponseDto })
  @ApiResponse({ status: 403, description: 'Only institute admins, teachers, or system admins can bulk assign subjects to classes' })
  @UsePipes(BulkInstituteClassSubjectValidationPipe)


  async bulkCreate(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Param('classId', ParseBigIntPipe) classId: string,
    @Body() bulkCreateDto: BulkCreateInstituteClassSubjectDto,
  ): Promise<BulkInstituteClassSubjectResponseDto> {
    bulkCreateDto.instituteId = instituteId;
    bulkCreateDto.classId = classId;
    return this.instituteClassSubjectService.bulkCreate(bulkCreateDto);
  }

  @Get()
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ 
    teacher: { requireClass: true },
    student: { requireClass: true },
    attendanceMarker: true,  // Institute-level access (no class requirement)
    instituteAdmin: true
  })
  @ApiOperation({ summary: 'Get subjects for a specific class (Attendance Marker has institute-level access)' })
  @ApiResponse({ status: 200, description: 'Subjects retrieved successfully', type: PaginatedInstituteClassSubjectResponseDto })


  async findByClass(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Param('classId', ParseBigIntPipe) classId: string,
    @Query() query: QueryInstituteClassSubjectDto,
  ): Promise<PaginatedInstituteClassSubjectResponseDto> {
    query.instituteId = instituteId;
    query.classId = classId;
    return this.instituteClassSubjectService.findAll(query);
  }

  @Get(':subjectId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ 
    teacher: { requireClass: true, requireSubject: true },
    student: { requireClass: true },
    attendanceMarker: true,  // Institute-level access (no class requirement)
    instituteAdmin: true
  })
  @ApiOperation({ summary: 'Get a specific subject assignment (Attendance Marker has institute-level access)' })
  @ApiParam({ name: 'subjectId', description: 'Subject ID' })
  @ApiResponse({ status: 200, description: 'Subject assignment retrieved successfully', type: InstituteClassSubjectResponseDto })
  @ApiResponse({ status: 404, description: 'Subject assignment not found' })


  async findOne(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Param('classId', ParseBigIntPipe) classId: string,
    @Param('subjectId', ParseBigIntPipe) subjectId: string,
  ): Promise<InstituteClassSubjectResponseDto> {
    return this.instituteClassSubjectService.findOne(instituteId, classId, subjectId);
  }

  @Patch(':subjectId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ 
    global: [UserType.SUPERADMIN], 
    instituteAdmin: true,
    teacher: { requireClass: true, requireSubject: true }
  })
  @ApiOperation({ summary: 'Update a subject assignment (Institute Admin, Teacher, or System Admin)' })
  @ApiParam({ name: 'subjectId', description: 'Subject ID' })
  @ApiResponse({ status: 200, description: 'Subject assignment updated successfully', type: InstituteClassSubjectResponseDto })
  @ApiResponse({ status: 404, description: 'Subject assignment not found' })
  @ApiResponse({ status: 403, description: 'Only institute admins, teachers, or system admins can update subject assignments including teacher assignments' })


  async update(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Param('classId', ParseBigIntPipe) classId: string,
    @Param('subjectId', ParseBigIntPipe) subjectId: string,
    @Body() updateDto: UpdateInstituteClassSubjectDto,
  ): Promise<InstituteClassSubjectResponseDto> {
    return this.instituteClassSubjectService.update(instituteId, classId, subjectId, updateDto);
  }

  @Delete(':subjectId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ 
    global: [UserType.SUPERADMIN], 
    instituteAdmin: true,
    teacher: { requireClass: true, requireSubject: true }
  })
  @ApiOperation({ summary: 'Remove a subject from a class (Institute Admin, Teacher, or System Admin)' })
  @ApiParam({ name: 'subjectId', description: 'Subject ID' })
  @ApiResponse({ status: 204, description: 'Subject removed successfully' })
  @ApiResponse({ status: 404, description: 'Subject assignment not found' })
  @ApiResponse({ status: 403, description: 'Only institute admins, teachers, or system admins can remove subjects from classes' })
  @HttpCode(HttpStatus.NO_CONTENT)


  async remove(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Param('classId', ParseBigIntPipe) classId: string,
    @Param('subjectId', ParseBigIntPipe) subjectId: string,
  ): Promise<void> {
    return this.instituteClassSubjectService.remove(instituteId, classId, subjectId);
  }

  // Teacher assignment endpoints
  @Patch(':subjectId/assign-teacher')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ 
    global: [UserType.SUPERADMIN], 
    instituteAdmin: true 
  })
  @ApiOperation({ 
    summary: 'Assign a teacher to a subject in a class',
    description: 'Assign a teacher to teach a specific subject in a class. Only institute admins and system admins can assign teachers.'
  })
  @ApiParam({ name: 'subjectId', description: 'Subject ID' })
  @ApiResponse({ status: 200, description: 'Teacher assigned to subject successfully' })
  @ApiResponse({ status: 404, description: 'Subject assignment not found' })
  @ApiResponse({ status: 403, description: 'Access denied - Institute admin or SUPERADMIN access required' })
  async assignTeacher(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Param('classId', ParseBigIntPipe) classId: string,
    @Param('subjectId', ParseBigIntPipe) subjectId: string,
    @Body() body: { teacherId: string }
  ) {
    return this.instituteClassSubjectService.assignTeacher(instituteId, classId, subjectId, body.teacherId);
  }

  @Patch(':subjectId/unassign-teacher')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ 
    global: [UserType.SUPERADMIN], 
    instituteAdmin: true 
  })
  @ApiOperation({ 
    summary: 'Remove teacher assignment from a subject',
    description: 'Unassign the teacher from a specific subject in a class. Only institute admins and system admins can unassign teachers.'
  })
  @ApiParam({ name: 'subjectId', description: 'Subject ID' })
  @ApiResponse({ status: 200, description: 'Teacher unassigned from subject successfully' })
  @ApiResponse({ status: 404, description: 'Subject assignment not found' })
  @ApiResponse({ status: 403, description: 'Access denied - Institute admin or SUPERADMIN access required' })
  async unassignTeacher(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Param('classId', ParseBigIntPipe) classId: string,
    @Param('subjectId', ParseBigIntPipe) subjectId: string
  ) {
    return this.instituteClassSubjectService.unassignTeacher(instituteId, classId, subjectId);
  }

  @Get('teacher/:teacherId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ 
    teacher: true,
    instituteAdmin: true
  })
  @ApiOperation({ summary: 'Get subjects assigned to a teacher in a specific class' })
  @ApiParam({ name: 'teacherId', description: 'Teacher ID' })
  @ApiResponse({ status: 200, description: 'Teacher subjects for class retrieved successfully', type: [InstituteClassSubjectResponseDto] })


  async findByClassAndTeacher(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Param('classId', ParseBigIntPipe) classId: string,
    @Param('teacherId', ParseBigIntPipe) teacherId: string,
  ): Promise<InstituteClassSubjectResponseDto[]> {
    return this.instituteClassSubjectService.findByInstituteClassAndTeacher(instituteId, classId, teacherId);
  }
}

// Additional controller for global queries
@ApiTags('Institute Class Subjects - Global')
@ApiBearerAuth()
@Controller('institute-class-subjects')
@UseGuards(JwtAuthGuard)
export class InstituteClassSubjectGlobalController {
  constructor(private readonly instituteClassSubjectService: InstituteClassSubjectService) {}

  @Get()
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ anyInstituteRole: true })
  @ApiOperation({ summary: 'Get all institute class subjects with filtering' })
  @ApiResponse({ status: 200, description: 'Subjects retrieved successfully', type: PaginatedInstituteClassSubjectResponseDto })
  async findAll(@Query() query: QueryInstituteClassSubjectDto): Promise<PaginatedInstituteClassSubjectResponseDto> {
    return this.instituteClassSubjectService.findAll(query);
  }

  @Get('teacher/:teacherId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ 
    teacher: true,
    instituteAdmin: true
  })
  @ApiOperation({ summary: 'Get subjects assigned to a specific teacher' })
  @ApiParam({ name: 'teacherId', description: 'Teacher ID' })
  @ApiResponse({ status: 200, description: 'Teacher subjects retrieved successfully', type: [InstituteClassSubjectResponseDto] })
  async findByTeacher(@Param('teacherId', ParseBigIntPipe) teacherId: string): Promise<InstituteClassSubjectResponseDto[]> {
    return this.instituteClassSubjectService.findByTeacher(teacherId);
  }

  @Get('institute/:instituteId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ anyInstituteRole: true })
  @ApiOperation({ summary: 'Get all subjects for a specific institute' })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiResponse({ status: 200, description: 'Institute subjects retrieved successfully', type: [InstituteClassSubjectResponseDto] })


  async findByInstitute(@Param('instituteId', ParseBigIntPipe) instituteId: string): Promise<InstituteClassSubjectResponseDto[]> {
    return this.instituteClassSubjectService.findByInstitute(instituteId);
  }

  @Get('institute/:instituteId/teacher/:teacherId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ 
    teacher: true,
    instituteAdmin: true
  })
  @ApiOperation({ summary: 'Get classes and subjects assigned to a teacher in a specific institute' })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiParam({ name: 'teacherId', description: 'Teacher ID' })
  @ApiResponse({ status: 200, description: 'Institute teacher classes with subjects retrieved successfully', type: [InstituteClassSubjectResponseDto] })


  async findByInstituteAndTeacher(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Param('teacherId', ParseBigIntPipe) teacherId: string,
  ): Promise<InstituteClassSubjectResponseDto[]> {
    return this.instituteClassSubjectService.findByInstituteAndTeacher(instituteId, teacherId);
  }

  @Get('stats')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ 
    global: [UserType.SUPERADMIN],
    instituteAdmin: true
  })
  @ApiOperation({ summary: 'Get institute class subject statistics' })
  @ApiResponse({ status: 200, description: 'Statistics retrieved successfully' })
  async getStats(@Query('instituteId') instituteId?: string) {
    return this.instituteClassSubjectService.getStats(instituteId);
  }
}
