import { ParseBigIntPipe } from '../../../common/pipes/parse-bigint.pipe';
import { Controller, Get, Post, Body, Patch, Param, Delete, Query, HttpCode, HttpStatus, UseGuards, Request, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { FlexibleAccessGuard } from '../../../auth/guards/flexible-access.guard';
import { RequireAnyOfRoles } from '../../../auth/decorators/flexible-access.decorator';
import { InstituteClassSubjectStudentsService } from './institute_class_subject_students.service';
import { CreateInstituteClassSubjectStudentDto } from './dto/create-institute_class_subject_student.dto';
import { UpdateInstituteClassSubjectStudentDto } from './dto/update-institute_class_subject_student.dto';
import { QueryInstituteClassSubjectStudentDto, BulkEnrollStudentsDto } from './dto/query-institute_class_subject_student.dto';
import { InstituteClassSubjectStudentResponseDto } from './dto/institute_class_subject_student-response.dto';
import { SelfEnrollDto, SelfEnrollResponseDto } from './dto/self-enroll.dto';
import { TeacherAssignStudentsDto, TeacherAssignResponseDto } from './dto/teacher-assign.dto';
import { UpdateEnrollmentSettingsDto, EnrollmentSettingsResponseDto } from './dto/enrollment-settings.dto';
import {
  VerifyEnrollmentDto,
  RejectEnrollmentDto,
  BulkVerifyEnrollmentDto,
  BulkRejectEnrollmentDto,
  UnverifiedStudentResponseDto,
  VerificationActionResponseDto,
  BulkVerificationResponseDto,
} from './dto/verify-enrollment.dto';
import { PaginatedResponseDto } from '../../../common/dto/paginated-response.dto';
import { SubjectParentResponseDto, SubjectParentQueryDto, PaginatedSubjectParentResponseDto } from './dto/subject-parent-response.dto';
import { UserType } from '../../user/enums/user-type.enum';
import { JwtRequest } from '@common/interfaces/jwt-request.interface';
import { UpdateStudentTypeDto } from './dto/update-student-type.dto';

@ApiTags('Institute Class Subject Students')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('institute-class-subject-students')
export class InstituteClassSubjectStudentsController {
  constructor(private readonly studentsService: InstituteClassSubjectStudentsService) {}

  @Post()
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: { requireSubject: true }
  })
  @ApiOperation({ summary: 'Enroll a student in a class subject (Institute Admin or Teacher)' })
  @ApiResponse({ status: 201, description: 'Student enrolled successfully', type: InstituteClassSubjectStudentResponseDto })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 409, description: 'Student already enrolled' })
  @ApiResponse({ status: 403, description: 'Only institute admins and teachers can enroll students in subjects' })

  async create(@Body() createDto: CreateInstituteClassSubjectStudentDto): Promise<InstituteClassSubjectStudentResponseDto> {
    return await this.studentsService.create(createDto);
  }

  @Get()
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    anyInstituteRole: true
  })
  @ApiOperation({ summary: 'Get all student enrollments with filtering and pagination' })
  @ApiResponse({ status: 200, description: 'List of student enrollments', type: PaginatedResponseDto<InstituteClassSubjectStudentResponseDto> })
  async findAll(@Query() queryDto: QueryInstituteClassSubjectStudentDto): Promise<PaginatedResponseDto<InstituteClassSubjectStudentResponseDto>> {
    return await this.studentsService.findAll(queryDto);
  }

  @Get('class-subject/:instituteId/:classId/:subjectId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    anyInstituteRole: true
  })
  @ApiOperation({ summary: 'Get students in a specific class subject (teacher view)' })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiParam({ name: 'classId', description: 'Class ID' })
  @ApiParam({ name: 'subjectId', description: 'Subject ID' })
  @ApiResponse({ status: 200, description: 'List of students in class subject' })
  async getStudentsInClassSubject(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Param('classId', ParseBigIntPipe) classId: string,
    @Param('subjectId', ParseBigIntPipe) subjectId: string
  ): Promise<InstituteClassSubjectStudentResponseDto[]> {
    return await this.studentsService.getStudentsInClassSubject(instituteId, classId, subjectId);
  }

  // ==========================================
  // ENROLLMENT VERIFICATION ENDPOINTS
  // (Must be declared BEFORE wildcard param routes like :instituteId/:classId/:subjectId/:studentId)
  // ==========================================

  @Get('unverified-students/:instituteId/:classId/:subjectId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: {}
  })
  @ApiOperation({ 
    summary: 'Get unverified (pending) students for a class subject',
    description: `
    **Returns:** List of students who have self-enrolled and are awaiting verification
    **Authorization:**
    - Institute admins can view unverified students for any subject in their institute
    - Teachers can view unverified students for any subject in their institute
    - Superadmins can view all
    `
  })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiParam({ name: 'classId', description: 'Class ID' })
  @ApiParam({ name: 'subjectId', description: 'Subject ID' })
  @ApiResponse({ 
    status: 200, 
    description: 'List of unverified students',
    type: [UnverifiedStudentResponseDto]
  })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  async getUnverifiedStudents(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Param('classId', ParseBigIntPipe) classId: string,
    @Param('subjectId', ParseBigIntPipe) subjectId: string
  ): Promise<UnverifiedStudentResponseDto[]> {
    return await this.studentsService.getUnverifiedStudents(instituteId, classId, subjectId);
  }

  @Patch('verify-enrollment/:instituteId/:classId/:subjectId/:studentId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: {}
  })
  @ApiOperation({ 
    summary: 'Verify a student enrollment',
    description: `
    **Verifies a pending student enrollment:**
    - Changes verification status from 'pending' to 'verified'
    - Records who verified and when
    - Only pending enrollments can be verified
    
    **Authorization:**
    - Institute admins can verify students for any subject in their institute
    - Teachers can verify students for any subject in their institute
    `
  })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiParam({ name: 'classId', description: 'Class ID' })
  @ApiParam({ name: 'subjectId', description: 'Subject ID' })
  @ApiParam({ name: 'studentId', description: 'Student ID to verify' })
  @ApiResponse({ 
    status: 200, 
    description: 'Student enrollment verified successfully',
    type: VerificationActionResponseDto
  })
  @ApiResponse({ status: 404, description: 'Student enrollment not found' })
  @ApiResponse({ status: 409, description: 'Student enrollment is already verified' })
  async verifyStudentEnrollment(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Param('classId', ParseBigIntPipe) classId: string,
    @Param('subjectId', ParseBigIntPipe) subjectId: string,
    @Param('studentId', ParseBigIntPipe) studentId: string,
    @Request() req: JwtRequest
  ): Promise<VerificationActionResponseDto> {
    return await this.studentsService.verifyStudentEnrollment(
      req.user.s,
      instituteId,
      classId,
      subjectId,
      studentId
    );
  }

  @Patch('reject-enrollment/:instituteId/:classId/:subjectId/:studentId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: {}
  })
  @ApiOperation({ 
    summary: 'Reject a student enrollment',
    description: `
    **Rejects a pending or verified student enrollment:**
    - Changes verification status to 'rejected'
    - Sets isActive to false
    - Records who rejected and when
    - Optionally includes rejection reason
    
    **Authorization:**
    - Institute admins can reject students for any subject in their institute
    - Teachers can reject students for any subject in their institute
    `
  })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiParam({ name: 'classId', description: 'Class ID' })
  @ApiParam({ name: 'subjectId', description: 'Subject ID' })
  @ApiParam({ name: 'studentId', description: 'Student ID to reject' })
  @ApiResponse({ 
    status: 200, 
    description: 'Student enrollment rejected',
    type: VerificationActionResponseDto
  })
  @ApiResponse({ status: 404, description: 'Student enrollment not found' })
  @ApiResponse({ status: 409, description: 'Student enrollment is already rejected' })
  async rejectStudentEnrollment(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Param('classId', ParseBigIntPipe) classId: string,
    @Param('subjectId', ParseBigIntPipe) subjectId: string,
    @Param('studentId', ParseBigIntPipe) studentId: string,
    @Body() rejectDto: RejectEnrollmentDto,
    @Request() req: JwtRequest
  ): Promise<VerificationActionResponseDto> {
    return await this.studentsService.rejectStudentEnrollment(
      req.user.s,
      instituteId,
      classId,
      subjectId,
      studentId,
      rejectDto.rejectionReason
    );
  }

  @Patch('bulk-verify-enrollment/:instituteId/:classId/:subjectId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: {}
  })
  @ApiOperation({ 
    summary: 'Bulk verify multiple student enrollments',
    description: `
    **Bulk verifies multiple pending student enrollments:**
    - Changes verification status from 'pending' to 'verified' for all provided students
    - Records who verified and when
    - Returns details of successful and failed verifications
    
    **Authorization:**
    - Institute admins can verify students for any subject in their institute
    - Teachers can verify students for any subject in their institute
    `
  })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiParam({ name: 'classId', description: 'Class ID' })
  @ApiParam({ name: 'subjectId', description: 'Subject ID' })
  @ApiResponse({ 
    status: 200, 
    description: 'Bulk verification result',
    type: BulkVerificationResponseDto
  })
  async bulkVerifyEnrollment(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Param('classId', ParseBigIntPipe) classId: string,
    @Param('subjectId', ParseBigIntPipe) subjectId: string,
    @Body() bulkDto: BulkVerifyEnrollmentDto,
    @Request() req: JwtRequest
  ): Promise<BulkVerificationResponseDto> {
    return await this.studentsService.bulkVerifyStudentEnrollments(
      req.user.s,
      instituteId,
      classId,
      subjectId,
      bulkDto.studentIds
    );
  }

  @Patch('bulk-reject-enrollment/:instituteId/:classId/:subjectId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: {}
  })
  @ApiOperation({ 
    summary: 'Bulk reject multiple student enrollments',
    description: `
    **Bulk rejects multiple student enrollments:**
    - Changes verification status to 'rejected' for all provided students
    - Sets isActive to false
    - Records who rejected and when
    - Optionally includes rejection reason applied to all
    - Returns details of successful and failed rejections
    
    **Authorization:**
    - Institute admins can reject students for any subject in their institute
    - Teachers can reject students for any subject in their institute
    `
  })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiParam({ name: 'classId', description: 'Class ID' })
  @ApiParam({ name: 'subjectId', description: 'Subject ID' })
  @ApiResponse({ 
    status: 200, 
    description: 'Bulk rejection result',
    type: BulkVerificationResponseDto
  })
  async bulkRejectEnrollment(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Param('classId', ParseBigIntPipe) classId: string,
    @Param('subjectId', ParseBigIntPipe) subjectId: string,
    @Body() bulkDto: BulkRejectEnrollmentDto,
    @Request() req: JwtRequest
  ): Promise<BulkVerificationResponseDto> {
    return await this.studentsService.bulkRejectStudentEnrollments(
      req.user.s,
      instituteId,
      classId,
      subjectId,
      bulkDto.studentIds,
      bulkDto.rejectionReason
    );
  }

  @Get('student/:studentId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    student: {},
    parent: {},
    anyInstituteRole: true
  })
  @ApiOperation({ summary: 'Get class subjects for a specific student (student view)' })
  @ApiParam({ name: 'studentId', description: 'Student ID' })
  @ApiResponse({ status: 200, description: 'List of class subjects for student' })
  async getClassSubjectsForStudent(@Param('studentId', ParseBigIntPipe) studentId: string): Promise<InstituteClassSubjectStudentResponseDto[]> {
    return await this.studentsService.getClassSubjectsForStudent(studentId);
  }

  @Get('with-details/:instituteId/:classId/:subjectId/:studentId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    anyInstituteRole: true
  })
  @ApiOperation({ summary: 'Get a specific student enrollment with full related entity details' })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiParam({ name: 'classId', description: 'Class ID' })
  @ApiParam({ name: 'subjectId', description: 'Subject ID' })
  @ApiParam({ name: 'studentId', description: 'Student ID' })
  @ApiResponse({ status: 200, description: 'Student enrollment details with full related entities' })
  @ApiResponse({ status: 404, description: 'Student enrollment not found' })
  async findOneWithDetails(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Param('classId', ParseBigIntPipe) classId: string,
    @Param('subjectId', ParseBigIntPipe) subjectId: string,
    @Param('studentId', ParseBigIntPipe) studentId: string
  ): Promise<any> {
    return await this.studentsService.findOneWithDetails(instituteId, classId, subjectId, studentId);
  }

  @Get(':instituteId/:classId/:subjectId/:studentId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    anyInstituteRole: true
  })
  @ApiOperation({ summary: 'Get a specific student enrollment' })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiParam({ name: 'classId', description: 'Class ID' })
  @ApiParam({ name: 'subjectId', description: 'Subject ID' })
  @ApiParam({ name: 'studentId', description: 'Student ID' })
  @ApiResponse({ status: 200, description: 'Student enrollment details', type: InstituteClassSubjectStudentResponseDto })
  @ApiResponse({ status: 404, description: 'Student enrollment not found' })
  async findOne(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Param('classId', ParseBigIntPipe) classId: string,
    @Param('subjectId', ParseBigIntPipe) subjectId: string,
    @Param('studentId', ParseBigIntPipe) studentId: string
  ): Promise<InstituteClassSubjectStudentResponseDto> {
    return await this.studentsService.findOne(instituteId, classId, subjectId, studentId);
  }

  @Patch(':instituteId/:classId/:subjectId/:studentId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: { requireSubject: true }
  })
  @ApiOperation({ summary: 'Update a student enrollment (Institute Admin or Teacher)' })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiParam({ name: 'classId', description: 'Class ID' })
  @ApiParam({ name: 'subjectId', description: 'Subject ID' })
  @ApiParam({ name: 'studentId', description: 'Student ID' })
  @ApiResponse({ status: 200, description: 'Student enrollment updated successfully', type: InstituteClassSubjectStudentResponseDto })
  @ApiResponse({ status: 404, description: 'Student enrollment not found' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 403, description: 'Only institute admins and teachers can update student enrollments' })


  async update(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Param('classId', ParseBigIntPipe) classId: string,
    @Param('subjectId', ParseBigIntPipe) subjectId: string,
    @Param('studentId', ParseBigIntPipe) studentId: string,
    @Body() updateDto: UpdateInstituteClassSubjectStudentDto
  ): Promise<InstituteClassSubjectStudentResponseDto> {
    return await this.studentsService.update(instituteId, classId, subjectId, studentId, updateDto);
  }

  @Delete(':instituteId/:classId/:subjectId/:studentId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN]
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a student from class subject (Institute Admin or Teacher)' })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiParam({ name: 'classId', description: 'Class ID' })
  @ApiParam({ name: 'subjectId', description: 'Subject ID' })
  @ApiParam({ name: 'studentId', description: 'Student ID' })
  @ApiResponse({ status: 204, description: 'Student enrollment removed successfully' })
  @ApiResponse({ status: 404, description: 'Student enrollment not found' })
  @ApiResponse({ status: 403, description: 'Only institute admins and teachers can remove students from subjects' })


  async remove(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Param('classId', ParseBigIntPipe) classId: string,
    @Param('subjectId', ParseBigIntPipe) subjectId: string,
    @Param('studentId', ParseBigIntPipe) studentId: string
  ): Promise<void> {
    await this.studentsService.remove(instituteId, classId, subjectId, studentId);
  }

  @Post('bulk-enroll')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: { requireSubject: true }
  })
  @ApiOperation({ summary: 'Enroll multiple students in a class subject (Institute Admin or Teacher)' })
  @ApiResponse({ status: 201, description: 'Students enrolled successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 403, description: 'Only institute admins and teachers can bulk enroll students in subjects' })

  async bulkEnroll(
    @Body() bulkDto: BulkEnrollStudentsDto,
    @Request() req: JwtRequest
  ): Promise<InstituteClassSubjectStudentResponseDto[]> {
    return await this.studentsService.bulkEnroll(bulkDto, req.user);
  }

  @Get('parents')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    anyInstituteRole: true
  })
  @ApiOperation({ 
    summary: 'Get parents of students enrolled in class subjects',
    description: `
    **Returns:** Parent information for students enrolled in any class subject
    **Security Features:**
    - Avoids SELECT * queries - only selects specific safe fields
    - Implements input sanitization and parameterized queries 
    - Supports pagination with maximum limit of 100 items
    - Returns only non-sensitive parent data (no passwords, sensitive details)
    
    **Filtering Options:**
    - Filter by specific student ID
    - Filter by relationship type (father/mother/guardian)
    - Search by parent name (partial match)
    - Search by student name (partial match)
    
    **Response Format:**
    - Parent details: ID, name, email, phone, occupation, workplace
    - Student details: Student ID, student name, subject ID, subject name
    - Relationship type: father/mother/guardian
    - Pagination metadata with total count
    `
  })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (default: 1)', example: 1 })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page (default: 10, max: 100)', example: 10 })
  @ApiQuery({ name: 'studentId', required: false, description: 'Filter by specific student ID', example: '123' })
  @ApiQuery({ name: 'relationship', required: false, description: 'Filter by relationship type', enum: ['father', 'mother', 'guardian'] })
  @ApiQuery({ name: 'parentName', required: false, description: 'Search by parent name (partial match)', example: 'John' })
  @ApiQuery({ name: 'studentName', required: false, description: 'Search by student name (partial match)', example: 'Jane' })
  @ApiResponse({ 
    status: 200, 
    description: 'Parents retrieved successfully with pagination',
    type: PaginatedSubjectParentResponseDto,
    schema: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', example: '123', description: 'Parent user ID' },
              name: { type: 'string', example: 'John Doe', description: 'Parent full name' },
              email: { type: 'string', example: 'john.doe@example.com', description: 'Parent email' },
              phoneNumber: { type: 'string', example: '+94123456789', description: 'Parent phone' },
              occupation: { type: 'string', example: 'Software Engineer', description: 'Parent occupation' },
              workplace: { type: 'string', example: 'Tech Company Ltd', description: 'Parent workplace' },
              relationship: { type: 'string', example: 'father', enum: ['father', 'mother', 'guardian'] },
              studentId: { type: 'string', example: '456', description: 'Student user ID' },
              studentName: { type: 'string', example: 'Jane Doe', description: 'Student name' },
              subjectId: { type: 'string', example: '789', description: 'Subject ID' },
              subjectName: { type: 'string', example: 'Mathematics', description: 'Subject name' }
            }
          }
        },
        meta: {
          type: 'object',
          properties: {
            total: { type: 'number', example: 100, description: 'Total number of records' },
            page: { type: 'number', example: 1, description: 'Current page' },
            limit: { type: 'number', example: 10, description: 'Items per page' },
            totalPages: { type: 'number', example: 10, description: 'Total pages' }
          }
        }
      }
    }
  })
  @ApiResponse({ status: 400, description: 'Bad request - Invalid query parameters' })
  @ApiResponse({ status: 401, description: 'Unauthorized - JWT token required' })
  @ApiResponse({ status: 403, description: 'Forbidden - Insufficient permissions' })
  async getSubjectParents(@Query() queryDto: SubjectParentQueryDto): Promise<PaginatedSubjectParentResponseDto> {
    return await this.studentsService.getSubjectParents(queryDto);
  }

  // New Secure API Endpoints with Authorization Logic

  @Get(':instituteId/student-subjects/class/:classId/student/:studentId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    student: {},
    parent: {},
    anyInstituteRole: true
  })
  @ApiOperation({ 
    summary: 'Get class subjects that a student is enrolled in with detailed information',
    description: `
    **Returns:** Class and subject details for student enrollments (includes institute, class, and subject information)
    **Authorization Logic:**
    - **Student**: Can only access their own data (studentId from JWT token must match :studentId parameter)
    - **Institute Admin**: Can access data only if class belongs to their institute
    **JWT Validation:** Response class IDs and subject IDs must be included in JWT token permissions
    `
  })
  @ApiParam({ name: 'instituteId', description: 'Institute ID (Long ID)', example: '1' })
  @ApiParam({ name: 'classId', description: 'Class ID (Long ID)', example: '40' })
  @ApiParam({ name: 'studentId', description: 'Student ID (Long ID)', example: '40' })


  @ApiQuery({ name: 'page', required: false, description: 'Page number', example: 1 })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page', example: 10 })
  @ApiResponse({ 
    status: 200, 
    description: 'Student enrolled class subjects retrieved successfully with detailed information',
    schema: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              instituteId: { type: 'string', example: '1' },
              classId: { type: 'string', example: '40' },
              subjectId: { type: 'string', example: '5' },
              subject: {
                type: 'object',
                properties: {
                  id: { type: 'string', example: '5' },
                  name: { type: 'string', example: 'Mathematics' },
                  code: { type: 'string', example: 'MATH10' },
                  category: { type: 'string', example: 'CORE' },
                  description: { type: 'string', example: 'Advanced Mathematics for Grade 10' }
                }
              }
            }
          }
        },
        total: { type: 'number', example: 50 },
        page: { type: 'number', example: 1 },
        limit: { type: 'number', example: 10 }
      }
    }
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - JWT token required' })
  @ApiResponse({ status: 403, description: 'Forbidden - Access denied' })
  @ApiResponse({ status: 404, description: 'Class or student not found' })
  async getStudentClassSubjects(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Param('classId', ParseBigIntPipe) classId: string,
    @Param('studentId', ParseBigIntPipe) studentId: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Request() req: JwtRequest
  ): Promise<{ data: any[], total: number, page: number, limit: number }> {
    const user = req.user;

    // Access control will be handled by decorators

    return await this.studentsService.getStudentClassSubjects(instituteId, classId, studentId, page, limit);
  }

  @Get('teacher-subjects/class/:classId/teacher/:teacherId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    teacher: {},
    anyInstituteRole: true
  })
  @ApiOperation({ 
    summary: 'Get class subjects assigned to a teacher with detailed information',
    description: `
    **Returns:** Class and subject details for teacher assignments (includes institute, class, and subject information)
    **Authorization Logic:**
    - **Teacher**: Can only access their own data (teacherId from JWT token must match :teacherId parameter)  
    - **Institute Admin**: Can access data only if class subjects belong to their institute
    **JWT Validation:** Response class IDs and subject IDs must be included in JWT token permissions
    `
  })
  @ApiParam({ name: 'classId', description: 'Class ID (Long ID)', example: '40' })
  @ApiParam({ name: 'teacherId', description: 'Teacher ID (Long ID)', example: '40' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number', example: 1 })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page', example: 10 })

  @ApiResponse({ 
    status: 200, 
    description: 'Teacher class subjects retrieved successfully with detailed information',
    schema: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              instituteId: { type: 'string', example: '1' },
              classId: { type: 'string', example: '40' },
              subjectId: { type: 'string', example: '5' },
              teacherId: { type: 'string', example: '41' },
              isActive: { type: 'boolean', example: true },
              assignedAt: { type: 'string', format: 'date-time' },
              subject: {
                type: 'object',
                properties: {
                  id: { type: 'string', example: '5' },
                  name: { type: 'string', example: 'Mathematics' },
                  code: { type: 'string', example: 'MATH10' },
                  category: { type: 'string', example: 'CORE' },
                  description: { type: 'string', example: 'Advanced Mathematics for Grade 10' }
                }
              }
            }
          }
        },
        total: { type: 'number', example: 10 },
        page: { type: 'number', example: 1 },
        limit: { type: 'number', example: 10 }
      }
    }
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - JWT token required' })
  @ApiResponse({ status: 403, description: 'Forbidden - Access denied' })
  @ApiResponse({ status: 404, description: 'Class or teacher not found' })
  async getTeacherClassSubjects(
    @Param('classId', ParseBigIntPipe) classId: string,
    @Param('teacherId', ParseBigIntPipe) teacherId: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Request() req: JwtRequest
  ): Promise<{ data: any[], total: number, page: number, limit: number }> {
    const user = req.user;

    // Access control will be handled by decorators

    return await this.studentsService.getTeacherClassSubjects(classId, teacherId, page, limit);
  }

  // New Enrollment Endpoints

  @Post('self-enroll')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    student: {},
    parent: {}
  })
  @ApiOperation({ 
    summary: 'Self-enroll in a subject using institute ID, class ID, subject ID, and enrollment key',
    description: `
    **Student Self-Enrollment:**
    - Students can enroll themselves in subjects if enrollment is enabled
    - Requires institute ID, class ID, subject ID, and valid enrollment key
    - Student must be enrolled in the class first
    - Prevents duplicate enrollments
    - Creates enrollment with **pending** verification status
    - Admin or teacher must verify the enrollment before it becomes active
    
    **Security Features:**
    - Validates enrollment key against the subject's stored key
    - Checks class enrollment prerequisites
    - Prevents duplicate subject enrollments
    - Differentiates between pending, rejected, and verified states
    `
  })
  @ApiResponse({ 
    status: 201, 
    description: 'Successfully enrolled in subject (pending verification)',
    type: SelfEnrollResponseDto
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 403, description: 'Not enrolled in required class' })
  @ApiResponse({ status: 404, description: 'Invalid enrollment key' })
  @ApiResponse({ status: 409, description: 'Already enrolled in subject' })
  async selfEnroll(
    @Body() enrollDto: SelfEnrollDto,
    @Request() req: JwtRequest
  ): Promise<SelfEnrollResponseDto> {
    const user = req.user;
    
    // If parent is enrolling on behalf of child, validate and use child's ID
    let effectiveStudentId = user.s;
    if (enrollDto.targetStudentId) {
      const childrenIds = user.c ? user.c.map(id => String(id)) : [];
      if (!childrenIds.includes(String(enrollDto.targetStudentId))) {
        throw new ForbiddenException('Access denied. The target student is not your child.');
      }
      effectiveStudentId = enrollDto.targetStudentId;
    }

    return await this.studentsService.selfEnroll(effectiveStudentId, enrollDto);
  }

  @Patch('claim-free-card/:instituteId/:classId/:subjectId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    student: {},
    parent: {}
  })
  @ApiOperation({ 
    summary: 'Student claims free card status for a pending_payment enrollment',
    description: 'Changes the enrollment from pending_payment to pending with studentType=free_card. Admin must verify.'
  })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiParam({ name: 'classId', description: 'Class ID' })
  @ApiParam({ name: 'subjectId', description: 'Subject ID' })
  @ApiResponse({ status: 200, description: 'Free card claim submitted' })
  @ApiResponse({ status: 400, description: 'Not in pending_payment state' })
  @ApiResponse({ status: 404, description: 'Enrollment not found' })
  async claimFreeCard(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Param('classId', ParseBigIntPipe) classId: string,
    @Param('subjectId', ParseBigIntPipe) subjectId: string,
    @Body() body: { targetStudentId?: string },
    @Request() req: JwtRequest
  ) {
    // If parent is claiming on behalf of child, validate and use child's ID
    let effectiveStudentId = req.user.s;
    if (body?.targetStudentId) {
      const childrenIds = req.user.c ? req.user.c.map(id => String(id)) : [];
      if (!childrenIds.includes(String(body.targetStudentId))) {
        throw new ForbiddenException('Access denied. The target student is not your child.');
      }
      effectiveStudentId = body.targetStudentId;
    }
    return await this.studentsService.claimFreeCard(effectiveStudentId, instituteId, classId, subjectId);
  }

  @Patch('student-type/:instituteId/:classId/:subjectId/:studentId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: { requireSubject: true }
  })
  @ApiOperation({ 
    summary: 'Update student type (paid/free_card) for an enrollment',
    description: 'Admin or teacher can change the student type between paid and free_card.'
  })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiParam({ name: 'classId', description: 'Class ID' })
  @ApiParam({ name: 'subjectId', description: 'Subject ID' })
  @ApiParam({ name: 'studentId', description: 'Student ID' })
  @ApiResponse({ status: 200, description: 'Student type updated' })
  @ApiResponse({ status: 404, description: 'Enrollment not found' })
  async updateStudentType(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Param('classId', ParseBigIntPipe) classId: string,
    @Param('subjectId', ParseBigIntPipe) subjectId: string,
    @Param('studentId', ParseBigIntPipe) studentId: string,
    @Body() body: UpdateStudentTypeDto
  ) {
    return await this.studentsService.updateStudentType(instituteId, classId, subjectId, studentId, body.studentType);
  }

  @Post('teacher-assign/:instituteId/:classId/:subjectId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: { requireSubject: true }
  })
  @ApiOperation({ 
    summary: 'Institute Admin or Teacher assigns students to subject',
    description: `
    **Institute Admin & Teacher Assignment:**
    - Institute admins and teachers can assign multiple students to subjects
    - Students must be enrolled in the class first
    - Prevents duplicate enrollments
    - Returns detailed success/failure information
    
    **Authorization:**
    - Institute admins can assign students to any subject in their institute
    - Teachers can assign students to subjects they are assigned to teach
    - Must have access to the specified institute
    `
  })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiParam({ name: 'classId', description: 'Class ID' })
  @ApiParam({ name: 'subjectId', description: 'Subject ID' })
  @ApiResponse({ 
    status: 201, 
    description: 'Students assigned successfully',
    type: TeacherAssignResponseDto
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 403, description: 'Only institute admins and teachers can assign students to subjects' })


  async teacherAssignStudents(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Param('classId', ParseBigIntPipe) classId: string,
    @Param('subjectId', ParseBigIntPipe) subjectId: string,
    @Body() assignDto: TeacherAssignStudentsDto,
    @Request() req: JwtRequest
  ): Promise<TeacherAssignResponseDto> {
    const user = req.user;
    
    return await this.studentsService.teacherAssignStudents(
      user.s, 
      instituteId, 
      classId, 
      subjectId, 
      assignDto
    );
  }

  @Patch('enrollment-settings/:instituteId/:classId/:subjectId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: { requireSubject: true }
  })
  @ApiOperation({ 
    summary: 'Update enrollment settings for a subject (Institute Admin or Teacher)',
    description: `
    **Enrollment Settings Management:**
    - Institute admins can enable/disable self-enrollment for subjects
    - Teachers assigned to the subject can manage enrollment settings
    - Automatically generates unique enrollment keys when enabled
    - Returns enrollment key only to authorized admins/teachers
    
    **Authorization:**
    - Institute admins can modify any subject settings
    - Teachers can modify settings for their assigned subjects
    - Must have access to the specified institute
    `
  })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiParam({ name: 'classId', description: 'Class ID' })
  @ApiParam({ name: 'subjectId', description: 'Subject ID' })
  @ApiResponse({ 
    status: 200, 
    description: 'Enrollment settings updated successfully',
    type: EnrollmentSettingsResponseDto
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 403, description: 'Only institute admins can modify enrollment settings' })


  async updateEnrollmentSettings(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Param('classId', ParseBigIntPipe) classId: string,
    @Param('subjectId', ParseBigIntPipe) subjectId: string,
    @Body() updateDto: UpdateEnrollmentSettingsDto,
    @Request() req: JwtRequest
  ): Promise<EnrollmentSettingsResponseDto> {
    const user = req.user;
    
    return await this.studentsService.updateEnrollmentSettings(
      user.s, 
      instituteId, 
      classId, 
      subjectId, 
      updateDto
    );
  }

  @Get('enrollment-settings/:instituteId/:classId/:subjectId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    anyInstituteRole: true
  })
  @ApiOperation({ 
    summary: 'Get enrollment settings for a subject (Institute Admin Only)',
    description: `
    **View Enrollment Settings:**
    - Institute admins can view current enrollment settings for subjects
    - Returns enrollment key for enabled subjects
    - Shows current enrollment count
    
    **Authorization:**
    - Only institute admins can view settings
    - Must have access to the specified institute
    `
  })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiParam({ name: 'classId', description: 'Class ID' })
  @ApiParam({ name: 'subjectId', description: 'Subject ID' })
  @ApiResponse({ 
    status: 200, 
    description: 'Enrollment settings retrieved successfully',
    type: EnrollmentSettingsResponseDto
  })
  @ApiResponse({ status: 403, description: 'Only institute admins can view enrollment settings' })


  async getEnrollmentSettings(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Param('classId', ParseBigIntPipe) classId: string,
    @Param('subjectId', ParseBigIntPipe) subjectId: string,
    @Request() req: JwtRequest
  ): Promise<EnrollmentSettingsResponseDto> {
    const user = req.user;
    
    return await this.studentsService.getEnrollmentSettings(
      user.s, 
      instituteId, 
      classId, 
      subjectId
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  //  Class-level enrollment type summary (free card / paid / normal)
  // ─────────────────────────────────────────────────────────────────────────────

  @Get('class-enrollment-summary/:instituteId/:classId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true, teacher: true })
  @ApiOperation({
    summary: 'Get enrollment type summary for all students in a class',
    description: 'Returns each student with their per-subject enrollment type (free_card/paid/normal). Optionally filter by studentType.',
  })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiParam({ name: 'classId', description: 'Class ID' })
  @ApiQuery({ name: 'filterType', required: false, enum: ['all', 'free_card', 'paid', 'normal', 'half_paid', 'quarter_paid'] })
  @ApiResponse({ status: 200, description: 'Enrollment type summary' })
  async getClassEnrollmentSummary(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Param('classId', ParseBigIntPipe) classId: string,
    @Query('filterType') filterType?: 'free_card' | 'paid' | 'normal' | 'half_paid' | 'quarter_paid' | 'all',
  ) {
    return this.studentsService.getClassEnrollmentTypeSummary(instituteId, classId, filterType);
  }

  @Patch('class-student-type/:instituteId/:classId/:studentId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true, teacher: true })
  @ApiOperation({
    summary: 'Update student type across ALL subjects in a class',
    description: 'Sets free_card/paid/normal for every active subject enrollment of the student in this class.',
  })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiParam({ name: 'classId', description: 'Class ID' })
  @ApiParam({ name: 'studentId', description: 'Student User ID' })
  @ApiResponse({ status: 200, description: 'Student type updated for all subject enrollments' })
  @ApiResponse({ status: 404, description: 'No active enrollments found' })
  async updateClassStudentType(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Param('classId', ParseBigIntPipe) classId: string,
    @Param('studentId', ParseBigIntPipe) studentId: string,
    @Body() body: UpdateStudentTypeDto,
  ) {
    return this.studentsService.updateStudentTypeForClass(instituteId, classId, studentId, body.studentType);
  }

}
