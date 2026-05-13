import { ParseBigIntPipe } from '../../../common/pipes/parse-bigint.pipe';
import { StudentUserIdsDto } from '../../../common/dto/common-body.dto';
import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards, UsePipes, HttpCode, HttpStatus, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { InstituteClassStudentService } from './institute_class_student.service';
import { 
  CreateInstituteClassStudentDto, 
  BulkCreateInstituteClassStudentDto 
} from './dto/create-institute_class_student.dto';
import { UpdateInstituteClassStudentDto, InstituteClassStudentResponseDto } from './dto/update-institute_class_student.dto';
import { ClassParentResponseDto, ClassParentQueryDto, PaginatedClassParentResponseDto } from './dto/class-parent-response.dto';
import { SelfEnrollClassDto, AdminTeacherAssignClassDto, BulkVerifyStudentsDto } from './dto/self-enroll-class.dto';
import { SecureUnverifiedStudentResponseDto, PaginatedUnverifiedStudentsResponseDto, VerificationResultDto, ClassEnrollmentStatsDto } from './dto/secure-response.dto';
import { InstituteClassStudentValidationPipe, BulkInstituteClassStudentValidationPipe, InstituteClassStudentParamsValidationPipe } from './pipes/institute-class-student-validation.pipe';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { FlexibleAccessGuard } from '../../../auth/guards/flexible-access.guard';
import { RequireAnyOfRoles } from '../../../auth/decorators/flexible-access.decorator';
import { UserType } from '../../user/enums/user-type.enum';
import { UpdateClassStudentTypeDto } from './dto/update-class-student-type.dto';



@ApiTags('Institute Class Students')
@Controller('institutes/:instituteId/classes/:classId/students')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class InstituteClassStudentController {
  constructor(private readonly instituteClassStudentService: InstituteClassStudentService) {}

  @Post()
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({ summary: 'Assign a student to a class (Institute Admin Only)' })
  @ApiResponse({ status: 201, description: 'Student successfully assigned to class', type: InstituteClassStudentResponseDto })
  @ApiResponse({ status: 409, description: 'Student already assigned to class' })
  @ApiResponse({ status: 403, description: 'Only institute admins can assign students to classes' })


  @UsePipes(InstituteClassStudentValidationPipe)
  async assignStudent(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Param('classId', ParseBigIntPipe) classId: string,
    @Body() createDto: CreateInstituteClassStudentDto
  ) {
    // Override IDs from URL params
    createDto.instituteId = instituteId;
    createDto.classId = classId;
    
    return await this.instituteClassStudentService.assignStudentToClass(createDto);
  }

  @Post('bulk')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({ summary: 'Bulk assign students to a class (Institute Admin Only)' })
  @ApiResponse({ status: 201, description: 'Students successfully assigned to class' })
  @ApiResponse({ status: 403, description: 'Only institute admins can bulk assign students to classes' })


  @UsePipes(BulkInstituteClassStudentValidationPipe)
  async bulkAssignStudents(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Param('classId', ParseBigIntPipe) classId: string,
    @Body() bulkCreateDto: BulkCreateInstituteClassStudentDto
  ) {
    bulkCreateDto.instituteId = instituteId;
    bulkCreateDto.classId = classId;
    
    return await this.instituteClassStudentService.bulkAssignStudents(bulkCreateDto);
  }

  @Get()
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ anyInstituteRole: true })
  @ApiOperation({ summary: 'Get all students in a class (Optimized)' })
  @ApiResponse({ status: 200, description: 'List of students in the class' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page' })
  @ApiQuery({ name: 'activeOnly', required: false, description: 'Filter active students only' })
  async getClassStudents(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Param('classId', ParseBigIntPipe) classId: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('activeOnly') activeOnly: string = 'true'
  ) {
    const options = {
      skip: (parseInt(page) - 1) * parseInt(limit),
      take: parseInt(limit),
      activeOnly: activeOnly === 'true',
    };
    
    // Use optimized method for better performance
    return await this.instituteClassStudentService.getClassStudentsOptimized(classId, options);
  }

  @Get(':studentUserId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ anyInstituteRole: true })
  @ApiOperation({ summary: 'Get specific student assignment in a class' })
  @ApiResponse({ status: 200, description: 'Student assignment details' })
  @ApiResponse({ status: 404, description: 'Student assignment not found' })
  async getStudentAssignment(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Param('classId', ParseBigIntPipe) classId: string,
    @Param('studentUserId', ParseBigIntPipe) studentUserId: string,
    @Request() req: any
  ) {
    return await this.instituteClassStudentService.findOne({
      instituteId,
      classId,
      studentUserId,
    }, req.user);
  }

  @Patch('student-type/:studentUserId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true, teacher: { requireClass: true } })
  @ApiOperation({ summary: 'Update class-level student type (Admin/Teacher only)' })
  @ApiResponse({ status: 200, description: 'Student type updated at class level' })
  async updateClassStudentType(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Param('classId', ParseBigIntPipe) classId: string,
    @Param('studentUserId', ParseBigIntPipe) studentUserId: string,
    @Body() body: UpdateClassStudentTypeDto,
  ) {
    return this.instituteClassStudentService.updateClassStudentType(
      instituteId, classId, studentUserId, body.studentType,
    );
  }

  @Patch(':studentUserId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({ summary: 'Update student assignment in a class (Institute Admin Only)' })
  @ApiResponse({ status: 200, description: 'Student assignment updated successfully' })
  @ApiResponse({ status: 404, description: 'Student assignment not found' })
  @ApiResponse({ status: 403, description: 'Only institute admins can update student assignments' })


  async updateStudentAssignment(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Param('classId', ParseBigIntPipe) classId: string,
    @Param('studentUserId', ParseBigIntPipe) studentUserId: string,
    @Body() updateDto: UpdateInstituteClassStudentDto
  ) {
    return await this.instituteClassStudentService.updateStudentAssignment(
      { instituteId, classId, studentUserId },
      updateDto
    );
  }

  @Delete(':studentUserId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({ summary: 'Remove a student from a class (Institute Admin Only)' })
  @ApiResponse({ status: 204, description: 'Student successfully removed from class' })
  @ApiResponse({ status: 404, description: 'Student assignment not found' })
  @ApiResponse({ status: 403, description: 'Only institute admins can remove students from classes' })


  @HttpCode(HttpStatus.NO_CONTENT)
  async removeStudent(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Param('classId', ParseBigIntPipe) classId: string,
    @Param('studentUserId', ParseBigIntPipe) studentUserId: string
  ) {
    await this.instituteClassStudentService.removeStudentFromClass({
      instituteId,
      classId,
      studentUserId,
    });
  }

  @Delete('bulk')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({ summary: 'Bulk remove students from a class (Institute Admin Only)' })
  @ApiResponse({ status: 204, description: 'Students successfully removed from class' })
  @ApiResponse({ status: 403, description: 'Only institute admins can bulk remove students from classes' })


  @HttpCode(HttpStatus.NO_CONTENT)
  async bulkRemoveStudents(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Param('classId', ParseBigIntPipe) classId: string,
    @Body() body: StudentUserIdsDto
  ) {
    await this.instituteClassStudentService.bulkRemoveStudents({
      instituteId,
      classId,
      studentUserIds: body.studentUserIds,
    });
  }

  @Get('count')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ anyInstituteRole: true })
  @ApiOperation({ summary: 'Get student count in a class' })
  @ApiResponse({ status: 200, description: 'Number of students in the class' })
  async getStudentCount(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Param('classId', ParseBigIntPipe) classId: string,
    @Query('activeOnly') activeOnly: string = 'true'
  ) {
    const criteria = activeOnly === 'true' 
      ? { instituteId, classId, isActive: true }
      : { instituteId, classId };
      
    const count = await this.instituteClassStudentService.getStudentCount(criteria);
    return { count };
  }

  // =================== NEW ENROLLMENT ENDPOINTS ===================

  @Post('self-enroll')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ student: { requireClass: false } })
  @ApiOperation({ summary: 'Student self-enrollment to class with verification requirement' })
  @ApiResponse({ status: 201, description: 'Self-enrollment request submitted successfully (requires verification)', type: InstituteClassStudentResponseDto })
  @ApiResponse({ status: 400, description: 'Student not enrolled in institute or invalid enrollment code' })
  @ApiResponse({ status: 409, description: 'Student already enrolled in class' })
  async selfEnrollToClass(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Param('classId', ParseBigIntPipe) classId: string,
    @Body() enrollDto: SelfEnrollClassDto,
    @Request() req
  ) {
    const studentUserId = req.user.sub; // Get student ID from JWT token
    return await this.instituteClassStudentService.selfEnrollToClass(
      instituteId, 
      classId, 
      studentUserId, 
      enrollDto
    );
  }

  @Post('teacher-assign')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true, teacher: { requireClass: true } })
  @ApiOperation({ summary: 'Institute Admin assignment of students to class (no verification required)' })
  @ApiResponse({ status: 201, description: 'Students assigned successfully' })
  @ApiResponse({ status: 400, description: 'Some students could not be assigned' })
  @ApiResponse({ status: 403, description: 'Only institute admins can assign students to classes' })


  async teacherAssignToClass(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Param('classId', ParseBigIntPipe) classId: string,
    @Body() assignDto: AdminTeacherAssignClassDto,
    @Request() req
  ) {
    const assignedBy = req.user.sub; // Get admin ID from JWT token
    return await this.instituteClassStudentService.adminTeacherAssignToClass(
      instituteId,
      classId,
      assignDto.studentUserIds,
      assignedBy,
      { 
        skipVerification: assignDto.skipVerification,
        assignmentNotes: assignDto.assignmentNotes 
      }
    );
  }

  @Get('unverified')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({ 
    summary: 'Get unverified students (secure response with masked phone numbers) - Institute Admin Only',
    description: 'Returns students who have self-enrolled but are pending institute admin verification. Phone numbers are masked for security.'
  })
  @ApiResponse({ status: 200, description: 'Unverified students retrieved successfully', type: PaginatedUnverifiedStudentsResponseDto })
  @ApiResponse({ status: 403, description: 'Only institute admins can view unverified students' })


  async getUnverifiedStudents(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Param('classId', ParseBigIntPipe) classId: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10'
  ) {
    return await this.instituteClassStudentService.getUnverifiedStudentsSecure(
      instituteId,
      classId,
      {
        page: parseInt(page),
        limit: parseInt(limit)
      }
    );
  }

  @Post('verify-students')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({ 
    summary: 'Bulk verify/reject student enrollment requests - Institute Admin Only',
    description: 'Institute admins can approve or reject multiple student enrollment requests in bulk'
  })
  @ApiResponse({ status: 200, description: 'Verification completed', type: VerificationResultDto })
  @ApiResponse({ status: 403, description: 'Only institute admins can verify students' })


  async bulkVerifyStudents(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Param('classId', ParseBigIntPipe) classId: string,
    @Body() verifyDto: BulkVerifyStudentsDto,
    @Request() req
  ) {
    const verifiedBy = req.user.sub; // Get admin ID from JWT token
    return await this.instituteClassStudentService.bulkVerifyStudentsEnhanced(
      instituteId,
      classId,
      verifyDto.verifications,
      verifiedBy
    );
  }

  @Get('enrollment-stats')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true, teacher: { requireClass: true } })
  @ApiOperation({ 
    summary: 'Get class enrollment statistics',
    description: 'Returns comprehensive enrollment statistics including verified/unverified counts and enrollment methods'
  })
  @ApiResponse({ status: 200, description: 'Enrollment statistics retrieved successfully', type: ClassEnrollmentStatsDto })
  async getEnrollmentStats(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Param('classId', ParseBigIntPipe) classId: string
  ) {
    return await this.instituteClassStudentService.getClassEnrollmentStats(instituteId, classId);
  }

  @Get('parents')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true, teacher: { requireClass: true } })
  @ApiOperation({ 
    summary: 'Get all parents of students in a class',
    description: 'Retrieves all parent details for students enrolled in a specific class. Returns only non-sensitive data with proper pagination and filtering. Supports filtering by student ID, relationship type, and name searches.'
  })
  @ApiParam({ name: 'instituteId', description: 'Institute ID', example: '1' })
  @ApiParam({ name: 'classId', description: 'Class ID', example: '2' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (default: 1)', example: 1 })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page (default: 10, max: 100)', example: 10 })
  @ApiQuery({ name: 'studentId', required: false, description: 'Filter by specific student ID', example: '123' })
  @ApiQuery({ name: 'relationship', required: false, description: 'Filter by relationship type', enum: ['father', 'mother', 'guardian'] })
  @ApiQuery({ name: 'parentName', required: false, description: 'Search by parent name (partial match)', example: 'John' })
  @ApiQuery({ name: 'studentName', required: false, description: 'Search by student name (partial match)', example: 'Jane' })
  @ApiResponse({ 
    status: 200, 
    description: 'Class parents retrieved successfully',
    type: PaginatedClassParentResponseDto 
  })
  @ApiResponse({ status: 400, description: 'Invalid parameters' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Institute or class not found' })
  async getClassParents(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Param('classId', ParseBigIntPipe) classId: string,
    @Query() query: ClassParentQueryDto
  ): Promise<PaginatedClassParentResponseDto> {
    return await this.instituteClassStudentService.getClassParents(instituteId, classId, query);
  }
}

// Additional controller for student-centric operations
@ApiTags('Student Classes')
@Controller('students/:studentUserId/classes')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class StudentClassesController {
  constructor(private readonly instituteClassStudentService: InstituteClassStudentService) {}

  @Get()
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ student: {}, parent: {}, teacher: {}, instituteAdmin: true, global: [UserType.SUPERADMIN] })
  @ApiOperation({ 
    summary: 'Get all classes for a student (Optimized)', 
    description: 'Parents can access their children\'s classes. FlexibleAccessGuard validates parent-child relationship via JWT.'
  })
  @ApiResponse({ status: 200, description: 'List of classes for the student' })
  @ApiResponse({ status: 403, description: 'Access denied - not authorized to view this student\'s classes' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page' })
  @ApiQuery({ name: 'activeOnly', required: false, description: 'Filter active classes only' })
  async getStudentClasses(
    @Param('studentUserId', ParseBigIntPipe) studentUserId: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('activeOnly') activeOnly: string = 'true'
  ) {
    const options = {
      skip: (parseInt(page) - 1) * parseInt(limit),
      take: parseInt(limit),
      activeOnly: activeOnly === 'true',
    };
    
    // Use optimized method for better performance
    return await this.instituteClassStudentService.getStudentClassesOptimized(studentUserId, options);
  }

  @Get('enrolled')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ student: {}, parent: {}, teacher: {}, instituteAdmin: true, global: [UserType.SUPERADMIN] })
  @ApiOperation({ 
    summary: 'Get student enrolled classes with advanced filtering (Ultra-Optimized)',
    description: 'Retrieves classes a student is enrolled in with optional filters. Includes verified and pending enrollments. Parents can access children\'s data via JWT validation.'
  })
  @ApiResponse({ status: 200, description: 'List of enrolled classes with verification status and access permission flags' })
  @ApiResponse({ status: 403, description: 'Access denied - not authorized to view this student\'s enrolled classes' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page (default: 10, max: 100)' })
  @ApiQuery({ name: 'instituteId', required: false, description: 'Filter by institute ID' })
  @ApiQuery({ name: 'verifiedOnly', required: false, description: 'Filter by verification status: true (verified only), false (pending only), or omit for all (default: show all)' })
  @ApiQuery({ name: 'enrollmentMethod', required: false, description: 'Filter by enrollment method (admin_assigned, self_enrollment)' })
  async getEnrolledClasses(
    @Param('studentUserId', ParseBigIntPipe) studentUserId: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('instituteId', ParseBigIntPipe) instituteId?: string,
    @Query('verifiedOnly') verifiedOnly?: string,
    @Query('enrollmentMethod') enrollmentMethod?: string
  ) {
    const parsedLimit = Math.min(parseInt(limit), 100); // Max 100 items per page
    
    // Parse verifiedOnly - undefined means show all
    let parsedVerifiedOnly: boolean | undefined;
    if (verifiedOnly === 'true') {
      parsedVerifiedOnly = true;
    } else if (verifiedOnly === 'false') {
      parsedVerifiedOnly = false;
    }
    // Otherwise leave undefined to show all
    
    const filters = {
      skip: (parseInt(page) - 1) * parsedLimit,
      take: parsedLimit,
      activeOnly: true, // Only active enrollments
      instituteId,
      verifiedOnly: parsedVerifiedOnly,
      enrollmentMethod,
    };
    
    // Use ultra-optimized method with advanced filtering (includes pending enrollments by default)
    return await this.instituteClassStudentService.getStudentEnrolledClassesWithFilters(studentUserId, filters);
  }
}

