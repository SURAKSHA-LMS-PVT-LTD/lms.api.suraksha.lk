import * as crypto from 'crypto';
import { ParseIdPipe } from '../../../common/pipes/parse-id.pipe';
import { ImageUrlDto, TeacherIdDto } from '../../../common/dto/common-body.dto';
import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards, UsePipes, ValidationPipe, Request, BadRequestException, Headers, HttpStatus, Inject, ParseIntPipe, ForbiddenException, UseInterceptors, ClassSerializerInterceptor } from '@nestjs/common';
import { getCurrentSriLankaTime, getCurrentSriLankaISO } from '../../../common/utils/timezone.util';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiConsumes } from '@nestjs/swagger';
import { InstitueClassService } from './institue_class.service';
import { InstituteClassStudentService } from '../../institute_class_modules/institute_class_student/institute_class_student.service';
import { DataSource } from 'typeorm';
import { CreateInstitueClassDto } from './dto/create-institue_class.dto';
import { UpdateInstitueClassDto } from './dto/update-institue_class.dto';
import { ClassFilterDto } from './dto/class-filter.dto';
import { ClassQueryDto } from './dto/class-query.dto';
import { 
  EnableSelfEnrollmentDto, 
  ClassSelfEnrollDto, 
  VerifyStudentDto 
} from './dto/enrollment.dto';
import { AssignStudentToClassDto, BulkAssignStudentsToClassDto, AssignStudentsToClassDto } from './dto/assign-student.dto';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { FlexibleAccessGuard } from '../../../auth/guards/flexible-access.guard';
import { RequireAnyOfRoles } from '../../../auth/decorators/flexible-access.decorator';
import { UserType } from '../../user/enums/user-type.enum';

import { ClassExistsPipe } from './pipes/class-exists.pipe';
import { UniqueClassCodePipe } from './pipes/unique-class-code.pipe';
import { ClassDateRangePipe } from './pipes/class-date-range.pipe';
import { PaginatedResponseDto } from '../../../common/dto/paginated-response.dto';
import { IInstituteClass } from './interfaces/institute-class.interface';
import { JwtRequest } from '@common/interfaces/jwt-request.interface';
import { CloudStorageService } from '../../../common/services/cloud-storage.service';


@ApiTags('Institute Classes')
@ApiBearerAuth()
@Controller('institute-classes')
@UseGuards(JwtAuthGuard)
@UseInterceptors(ClassSerializerInterceptor)
export class InstitueClassController {
  constructor(
    private readonly institueClassService: InstitueClassService,
    private readonly classStudentService: InstituteClassStudentService,
    private readonly dataSource: DataSource,
    private readonly cloudStorageService: CloudStorageService,
  ) {}

  // Helper methods for security and validation
  private generateRequestId(): string {
    return crypto.randomUUID();
  }

  private sanitizeString(str: string): string {
    return str.replace(/[<>\"'&]/g, (match) => {
      const entityMap = {
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#x27;',
        '&': '&amp;'
      };
      return entityMap[match];
    }).replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '');
  }

  @Post()
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ 
    global: [UserType.SUPERADMIN], 
    instituteAdmin: true 
  })
  @ApiOperation({ 
    summary: 'Create a new class with optional imageUrl',
    description: 'Creates a new class. Provide imageUrl from /upload/verify-and-publish endpoint.'
  })
  @ApiConsumes('application/json')
  @ApiResponse({ status: 201, description: 'Class created successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @UsePipes(UniqueClassCodePipe)
  async create(
    @Body(new ValidationPipe({ transform: true }), ClassDateRangePipe) createInstitueClassDto: CreateInstitueClassDto
  ) {
    // Create class with imageUrl already in DTO (from signed URL upload)
    const result = await this.institueClassService.create(createInstitueClassDto);
    return result;
  }

  @Get()
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], anyInstituteRole: true })
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async findAll(@Query() filterDto: ClassFilterDto): Promise<PaginatedResponseDto<IInstituteClass>> {
    return this.institueClassService.findAllPaginated(filterDto);
  }

  @Patch(':id/upload-image')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ 
    global: [UserType.SUPERADMIN], 
    instituteAdmin: true 
  })
  @ApiOperation({ 
    summary: 'Update class image URL',
    description: 'Updates class image URL from /upload/verify-and-publish endpoint. Replaces existing image if present.'
  })
  @ApiConsumes('application/json')
  @ApiResponse({ status: 200, description: 'Class image updated successfully' })
  @ApiResponse({ status: 400, description: 'Bad request - imageUrl required' })
  @ApiResponse({ status: 404, description: 'Class not found' })
  async uploadClassImage(
    @Param('id') classId: string,
    @Body() body: ImageUrlDto
  ) {
    if (!body.imageUrl) {
      throw new BadRequestException('imageUrl is required');
    }
    
    return this.institueClassService.updateClassImage(classId, body.imageUrl);
  }

  @Get('institute/:instituteId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], anyInstituteRole: true })
  //   instituteId: true,
  //   instituteIdParam: 'instituteId'
  // })
  findByInstitute(@Param('instituteId', ParseIdPipe) instituteId: string) {
    return this.institueClassService.findByInstitute(instituteId);
  }

  @Get('academic-year/:instituteId/:academicYear')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], anyInstituteRole: true })
  //   instituteId: true,
  //   instituteIdParam: 'instituteId'
  // })
  findByAcademicYear(
    @Param('instituteId', ParseIdPipe) instituteId: string,
    @Param('academicYear') academicYear: string
  ) {
    return this.institueClassService.findByAcademicYear(instituteId, academicYear);
  }

  @Get('grade/:instituteId/:grade')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ anyInstituteRole: true })
  //   instituteId: true,
  //   instituteIdParam: 'instituteId'
  // })
  findByGrade(
    @Param('instituteId', ParseIdPipe) instituteId: string,
    @Param('grade') grade: number
  ) {
    return this.institueClassService.findByGrade(instituteId, +grade);
  }

  @Get('specialty/:instituteId/:specialty')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ anyInstituteRole: true })
  //   instituteId: true,
  //   instituteIdParam: 'instituteId'
  // })
  findBySpecialty(
    @Param('instituteId', ParseIdPipe) instituteId: string,
    @Param('specialty') specialty: string
  ) {
    return this.institueClassService.findBySpecialty(instituteId, specialty);
  }

  @Get('teacher/:teacherId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ teacher: true })
  findByTeacher(@Param('teacherId', ParseIdPipe) teacherId: string) {
    return this.institueClassService.findByTeacher(teacherId);
  }

  @Get('active/:instituteId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], anyInstituteRole: true })
  //   instituteId: true,
  //   instituteIdParam: 'instituteId'
  // })
  findActive(@Param('instituteId', ParseIdPipe) instituteId: string) {
    return this.institueClassService.findActive(instituteId);
  }

  @Get(':id')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], anyInstituteRole: true })
  @ApiOperation({ 
    summary: 'Get class by ID',
    description: 'Retrieves complete class information including enrollment settings (enrollmentCode, enrollmentEnabled, requireTeacherVerification) and dates (startDate, endDate).'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Class retrieved successfully with all fields including enrollment settings and dates.' 
  })
  @ApiResponse({ status: 404, description: 'Class not found' })
  findOne(@Param('id', ClassExistsPipe) id: string) {
    return this.institueClassService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ 
    global: [UserType.SUPERADMIN], 
    instituteAdmin: true 
  })
  @ApiOperation({ 
    summary: 'Update class details',
    description: 'Updates class information including enrollment settings and dates. Supports both JSON and FormData. Can optionally upload a new class image.'
  })
  @ApiConsumes('application/json')
  @ApiResponse({ 
    status: 200, 
    description: 'Class updated successfully. Returns all class fields including enrollment settings (enrollmentCode, enrollmentEnabled, requireTeacherVerification) and dates (startDate, endDate).' 
  })
  @ApiResponse({ status: 400, description: 'Bad request or validation error' })
  @ApiResponse({ status: 404, description: 'Class not found' })
  //   userType: UserType.INSTITUTE_ADMIN,
  //   classId: true,
  //   classIdParam: 'id'
  // })
  async update(
    @Param('id', ClassExistsPipe) id: string, 
    @Body(new ValidationPipe({ transform: true, whitelist: true }), ClassDateRangePipe) updateInstitueClassDto: UpdateInstitueClassDto
  ) {
    // Update class details with imageUrl from DTO (from signed URL upload)
    const result = await this.institueClassService.update(id, updateInstitueClassDto);
    return result;
  }

  @Patch(':id/activate')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ 
    global: [UserType.SUPERADMIN], 
    instituteAdmin: true 
  })
  //   userType: UserType.INSTITUTE_ADMIN,
  //   classId: true,
  //   classIdParam: 'id'
  // })
  async activate(@Param('id', ClassExistsPipe) id: string) {
    return this.institueClassService.activate(id);
  }

  @Patch(':id/deactivate')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ 
    global: [UserType.SUPERADMIN], 
    instituteAdmin: true 
  })
  //   userType: UserType.INSTITUTE_ADMIN,
  //   classId: true,
  //   classIdParam: 'id'
  // })
  async deactivate(@Param('id', ClassExistsPipe) id: string) {
    return this.institueClassService.deactivate(id);
  }

  @Delete(':id')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ 
    global: [UserType.SUPERADMIN], 
    instituteAdmin: true 
  })
  //   userType: UserType.INSTITUTE_ADMIN,
  //   classId: true,
  //   classIdParam: 'id'
  // })
  async remove(@Param('id', ClassExistsPipe) id: string) {
    return this.institueClassService.remove(id);
  }

  // Teacher assignment endpoints
  @Patch(':id/assign-teacher')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ 
    global: [UserType.SUPERADMIN], 
    instituteAdmin: true 
  })
  @ApiOperation({ 
    summary: 'Assign a teacher to a class',
    description: 'Assign a class teacher (class_teacher_id). Only institute admins and system admins can assign teachers.'
  })
  @ApiResponse({ status: 200, description: 'Teacher assigned successfully' })
  @ApiResponse({ status: 404, description: 'Class or teacher not found' })
  @ApiResponse({ status: 403, description: 'Access denied - Institute admin or SUPERADMIN access required' })
  async assignTeacher(
    @Param('id', ParseIdPipe) id: string,
    @Body() body: TeacherIdDto
  ) {
    return this.institueClassService.assignTeacher(id, body.teacherId);
  }

  @Patch(':id/unassign-teacher')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ 
    global: [UserType.SUPERADMIN], 
    instituteAdmin: true 
  })
  @ApiOperation({ 
    summary: 'Remove teacher assignment from a class',
    description: 'Unassign the class teacher (set class_teacher_id to null). Only institute admins and system admins can unassign teachers.'
  })
  @ApiResponse({ status: 200, description: 'Teacher unassigned successfully' })
  @ApiResponse({ status: 404, description: 'Class not found' })
  @ApiResponse({ status: 403, description: 'Access denied - Institute admin or SUPERADMIN access required' })
  async unassignTeacher(
    @Param('id', ParseIdPipe) id: string
  ) {
    return this.institueClassService.unassignTeacher(id);
  }

  // Self-enrollment endpoints
  @Post(':id/enable-enrollment')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({ 
    summary: 'Enable self-enrollment for a class',
    description: 'Accessible to institute admins and system admins. Enables students to self-enroll using an enrollment code.'
  })
  @ApiResponse({ status: 200, description: 'Self-enrollment enabled successfully' })
  @ApiResponse({ status: 403, description: 'Access denied - Institute admin or SUPERADMIN access required' })
  async enableSelfEnrollment(
    @Param('id', ClassExistsPipe) id: string,
    @Body() enableEnrollmentDto: EnableSelfEnrollmentDto,
  ) {
    return this.institueClassService.enableSelfEnrollment(
      id,
      enableEnrollmentDto.enrollmentCode,
      enableEnrollmentDto.requireTeacherVerification ?? true
    );
  }

  @Post(':id/disable-enrollment')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({ 
    summary: 'Disable self-enrollment for a class',
    description: 'Accessible to institute admins and system admins. Prevents students from self-enrolling.'
  })
  @ApiResponse({ status: 200, description: 'Self-enrollment disabled successfully' })
  @ApiResponse({ status: 403, description: 'Access denied - Institute admin or SUPERADMIN access required' })
  async disableSelfEnrollment(
    @Param('id', ClassExistsPipe) id: string,
  ) {
    return this.institueClassService.disableSelfEnrollment(id);
  }

  @Get(':id/enrollment-settings')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({ 
    summary: 'Get enrollment settings for a class',
    description: 'Accessible to institute admins and system admins. Returns enrollment configuration.'
  })
  @ApiResponse({ status: 200, description: 'Enrollment settings retrieved successfully' })
  @ApiResponse({ status: 403, description: 'Access denied - Institute admin or SUPERADMIN access required' })
  async getEnrollmentSettings(
    @Param('id', ClassExistsPipe) id: string,
  ) {
    return this.institueClassService.getEnrollmentSettings(id);
  }

  @Get(':id/enrollment-code')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({ 
    summary: 'Get enrollment code for a class',
    description: 'Accessible to institute admins and system admins. Returns enrollment code if enrollment is enabled.'
  })
  @ApiResponse({ status: 200, description: 'Enrollment code retrieved successfully' })
  @ApiResponse({ status: 400, description: 'Class not found or enrollment not enabled' })
  @ApiResponse({ status: 403, description: 'Access denied - Institute admin or SUPERADMIN access required' })
  async getEnrollmentCode(
    @Param('id', ClassExistsPipe) id: string,
    @Request() req: JwtRequest
  ) {
    const classEntity = await this.institueClassService.findOne(id);
    
    if (!classEntity) {
      throw new BadRequestException('Class not found');
    }

    if (!classEntity.enrollmentEnabled) {
      throw new BadRequestException('Enrollment is not enabled for this class');
    }

    return {
      classId: classEntity.id,
      enrollmentCode: classEntity.enrollmentCode,
      enrollmentEnabled: classEntity.enrollmentEnabled,
      requireTeacherVerification: classEntity.requireTeacherVerification
    };
  }

  @Post('enroll')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ 
    student: true 
  })
  //   userType: UserType.STUDENT,
  //   instituteId: true
  // })
  async selfEnroll(
    @Body() selfEnrollDto: ClassSelfEnrollDto,
    @Request() req: JwtRequest
  ) {
    try {
      // Find class by ID directly
      const classEntity = await this.institueClassService.findOne(selfEnrollDto.classId);
      
      if (!classEntity) {
        throw new BadRequestException('Class not found');
      }
      
      // Check if enrollment is enabled for this class
      if (!classEntity.enrollmentEnabled) {
        throw new BadRequestException('Self-enrollment is not enabled for this class');
      }
      
      // Validate enrollment code
      if (classEntity.enrollmentCode !== selfEnrollDto.enrollmentCode) {
        throw new BadRequestException('Invalid enrollment code');
      }
      
      // Get student ID from the authenticated user
      const studentId = req.user?.s;
      
      if (!studentId) {
        throw new BadRequestException('Student ID not found in token');
      }

      // Create enrollment record using the proper service method
      const enrollment = await this.classStudentService.selfEnroll(
        classEntity.instituteId,
        classEntity.id,
        studentId
      );

      return {
        message: classEntity.requireTeacherVerification 
          ? 'Enrollment submitted. Waiting for teacher verification.'
          : 'Successfully enrolled in class.',
        class: {
          id: classEntity.id,
          name: classEntity.name,
          code: classEntity.code
        },
        enrollment: {
          studentUserId: enrollment.studentUserId,
          isVerified: enrollment.isVerified,
          enrollmentMethod: enrollment.enrollmentMethod,
          enrolledAt: enrollment.createdAt
        },
        requiresVerification: classEntity.requireTeacherVerification
      };
    } catch (error) {
      throw new BadRequestException(`Failed to enroll in class: ${error.message}`);
    }
  }

  @Get(':id/unverified-students')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ 
    global: [UserType.SUPERADMIN], 
    instituteAdmin: true,
    teacher: { requireClass: true }
  })
  //   userType: UserType.TEACHER,
  //   instituteId: true,
  //    : true,
  //   classIdParam: 'id'
  // })
  async getUnverifiedStudents(@Param('id', ClassExistsPipe) id: string) {
    try {
      // Get class details from service/repository
      const classEntity = await this.institueClassService.findOne(id);
      
      if (!classEntity) {
        throw new BadRequestException('Class not found');
      }

      // Call InstituteClassStudentService to get unverified students from repository
      const unverifiedStudents = await this.classStudentService.getUnverifiedStudents(
        classEntity.instituteId, 
        id
      );
      
      return {
        message: 'Unverified students retrieved successfully',
        classId: id,
        className: classEntity.name,
        classCode: classEntity.code,
        instituteId: classEntity.instituteId,
        students: unverifiedStudents.map(student => ({
          id: student.id,
          name: student.name,
          addressLine1: student.addressLine1,
          addressLine2: student.addressLine2,
          phoneNumber: student.phoneNumber,
          // ✅ Transform imageUrl to full URL
          imageUrl: student.imageUrl ? this.cloudStorageService.getFullUrl(student.imageUrl) : student.imageUrl,
          dateOfBirth: student.dateOfBirth,
          userIdByInstitute: student.sByInstitute,
          studentUserId: student.studentUserId,
          enrollmentDate: student.enrollmentDate,
          enrollmentMethod: student.enrollmentMethod,
          studentType: student.studentType || 'normal',
          isVerified: student.isVerified,
          isActive: student.isActive
        })),
        count: unverifiedStudents.length,
        totalPendingVerifications: unverifiedStudents.length
      };
    } catch (error) {
      throw new BadRequestException(`Failed to get unverified students: ${error.message}`);
    }
  }

  @Post(':id/verify-student')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ 
    global: [UserType.SUPERADMIN], 
    instituteAdmin: true,
    teacher: { requireClass: true }
  })
  //   userType: UserType.INSTITUTE_ADMIN,
  //   classId: true,
  //   classIdParam: 'id'
  // })
  async verifyStudent(
    @Param('id', ClassExistsPipe) id: string,
    @Body() verifyDto: VerifyStudentDto,
    @Request() req: JwtRequest
  ) {
    try {
      // Get class details from service/repository
      const classEntity = await this.institueClassService.findOne(id);
      
      if (!classEntity) {
        throw new BadRequestException('Class not found');
      }

      // Get teacher ID from authenticated user
      const teacherId = req.user?.s;
      
      if (!teacherId) {
        throw new BadRequestException('Teacher ID not found in request');
      }

      // Call InstituteClassStudentService to verify the student
      const result = await this.classStudentService.verifyStudent(
        classEntity.instituteId,
        id,
        verifyDto.studentUserId,
        verifyDto.approve,
        teacherId
      );

      return {
        message: verifyDto.approve 
          ? 'Student verified and approved successfully' 
          : 'Student verification rejected and removed from class',
        classId: id,
        className: classEntity.name,
        studentUserId: verifyDto.studentUserId,
        approved: verifyDto.approve,
        verifiedBy: teacherId,
        verifiedAt: new Date(), // real UTC — MySQL2 timezone:'+05:30' stores as Sri Lanka time
        student: result ? {
          instituteId: result.instituteId,
          classId: result.classId,
          studentUserId: result.studentUserId,
          isVerified: result.isVerified,
          verifiedAt: result.verifiedAt,
          verifiedBy: result.verifiedBy
        } : null
      };
    } catch (error) {
      throw new BadRequestException(`Failed to verify student: ${error.message}`);
    }
  }

  // Unified student assignment endpoint (handles single or multiple students)
  @Post(':id/assign-students')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ 
    global: [UserType.SUPERADMIN], 
    instituteAdmin: true,
    teacher: { requireClass: true }
  })
  //   userType: [UserType.INSTITUTE_ADMIN, UserType.TEACHER],
  //   classId: true,
  //   classIdParam: 'id'
  // })
  async assignStudentsToClass(
    @Param('id', ClassExistsPipe) classId: string,
    @Body() assignStudentsDto: AssignStudentsToClassDto,
    @Request() req: JwtRequest
  ) {
    try {
      // Get class details to ensure it exists and get institute ID
      const classEntity = await this.institueClassService.findOne(classId);
      
      if (!classEntity) {
        throw new BadRequestException('Class not found');
      }

      const results: any[] = [];
      const errors: any[] = [];
      const alreadyEnrolled: any[] = [];
      const studentIds = assignStudentsDto.studentUserIds;


      // Process each student assignment
      for (const studentId of studentIds) {
        try {
          const assignment = await this.classStudentService.assignStudentToClass({
            instituteId: classEntity.instituteId,
            classId: classId,
            studentUserId: studentId,
            isActive: assignStudentsDto.isActive ?? true
          });

          results.push({
            studentUserId: studentId,
            success: true,
            status: 'newly_assigned',
            assignment: {
              instituteId: assignment.instituteId,
              classId: assignment.classId,
              studentUserId: assignment.studentUserId,
              isActive: assignment.isActive,
              isVerified: assignment.isVerified,
              enrollmentMethod: assignment.enrollmentMethod,
              assignedAt: assignment.createdAt
            }
          });
        } catch (error) {
          if (error.message?.includes('already assigned') || error.message?.includes('ALREADY_EXISTS')) {
            // Handle already enrolled students separately
            alreadyEnrolled.push({
              studentUserId: studentId,
              success: false,
              status: 'already_enrolled',
              message: 'Student is already enrolled in this class'
            });
          } else {
            // Handle other errors
            errors.push({
              studentUserId: studentId,
              success: false,
              status: 'failed',
              error: error.message
            });
          }
        }
      }

      // Create detailed message
      let message: string;
      const totalNew = results.length;
      const totalAlreadyEnrolled = alreadyEnrolled.length;
      const totalFailed = errors.length;

      if (studentIds.length === 1) {
        if (totalNew === 1) {
          message = 'Student assigned to class successfully';
        } else if (totalAlreadyEnrolled === 1) {
          message = `Student ${studentIds[0]} is already enrolled in this class`;
        } else {
          message = `Failed to assign student: ${errors[0]?.error || 'Unknown error'}`;
        }
      } else {
        const parts: string[] = [];
        if (totalNew > 0) parts.push(`${totalNew} newly assigned`);
        if (totalAlreadyEnrolled > 0) {
          const enrolledIds = alreadyEnrolled.map(s => s.studentUserId).join(', ');
          parts.push(`${enrolledIds} already enrolled`);
        }
        if (totalFailed > 0) parts.push(`${totalFailed} failed`);
        
        message = `Assignment completed: ${parts.join(', ')}.`;
      }

      // Build response object
      const response: any = {
        message: message,
        class: {
          id: classEntity.id,
          name: classEntity.name,
          code: classEntity.code,
          instituteId: classEntity.instituteId
        },
        summary: {
          totalRequested: studentIds.length,
          newlyAssigned: totalNew,
          alreadyEnrolled: totalAlreadyEnrolled,
          failed: totalFailed,
          assignedBy: req.user?.s,
          operationType: studentIds.length === 1 ? 'single' : 'bulk'
        }
      };

      // Add details arrays only if they have content
      if (results.length > 0) {
        response.newlyAssigned = results;
      }
      
      if (alreadyEnrolled.length > 0) {
        response.alreadyEnrolled = alreadyEnrolled;
        
        // Create a readable list of already enrolled student IDs
        const enrolledIds = alreadyEnrolled.map(student => student.studentUserId);
        response.alreadyEnrolledStudentIds = enrolledIds;
        
        // Add a clear summary message for already enrolled students
        if (enrolledIds.length === 1) {
          response.alreadyEnrolledMessage = `Student ${enrolledIds[0]} is already enrolled in this class.`;
        } else {
          response.alreadyEnrolledMessage = `Students ${enrolledIds.join(', ')} are already enrolled in this class.`;
        }
        
        // Additional detailed breakdown
        response.enrollmentStatus = {
          alreadyEnrolledCount: enrolledIds.length,
          alreadyEnrolledList: enrolledIds,
          newlyAddedCount: results.length,
          newlyAddedList: results.map(r => r.studentUserId)
        };
      }
      
      if (errors.length > 0) {
        response.errors = errors;
      }

      return response;
    } catch (error) {
      throw new BadRequestException(`Failed to assign students to class: ${error.message}`);
    }
  }

  // Backward compatibility endpoints (legacy support)
  @Post(':id/assign-student')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ 
    global: [UserType.SUPERADMIN], 
    instituteAdmin: true,
    teacher: { requireClass: true }
  })
  //   userType: [UserType.INSTITUTE_ADMIN, UserType.TEACHER],
  //   classId: true,
  //   classIdParam: 'id'
  // })
  async assignSingleStudentToClass(
    @Param('id', ClassExistsPipe) classId: string,
    @Body() assignStudentDto: AssignStudentToClassDto,
    @Request() req: JwtRequest
  ) {
    // Convert single student to array and use the unified method
    const assignStudentsDto: AssignStudentsToClassDto = {
      studentUserIds: [assignStudentDto.studentUserId],
      isActive: assignStudentDto.isActive
    };
    
    return this.assignStudentsToClass(classId, assignStudentsDto, req);
  }

  @Post(':id/assign-students-bulk')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ 
    global: [UserType.SUPERADMIN], 
    instituteAdmin: true,
    teacher: { requireClass: true }
  })
  //   userType: [UserType.INSTITUTE_ADMIN, UserType.TEACHER],
  //   classId: true,
  //   classIdParam: 'id'
  // })
  async assignStudentsToClassBulk(
    @Param('id', ClassExistsPipe) classId: string,
    @Body() bulkAssignDto: BulkAssignStudentsToClassDto,
    @Request() req: JwtRequest
  ) {
    // Convert bulk DTO to unified DTO and use the unified method
    const assignStudentsDto: AssignStudentsToClassDto = {
      studentUserIds: bulkAssignDto.studentUserIds,
      isActive: bulkAssignDto.isActive
    };
    
    return this.assignStudentsToClass(classId, assignStudentsDto, req);
  }

  @Delete(':id/remove-student/:studentId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ 
    global: [UserType.SUPERADMIN], 
    instituteAdmin: true,
    teacher: { requireClass: true }
  })
  //   userType: [UserType.INSTITUTE_ADMIN, UserType.TEACHER],
  //   classId: true,
  //   classIdParam: 'id'
  // })
  async removeStudentFromClass(
    @Param('id', ClassExistsPipe) classId: string,
    @Param('studentUserId', ParseIdPipe) studentUserId: string,
    @Request() req: JwtRequest
  ) {
    try {
      // Get class details to ensure it exists and get institute ID
      const classEntity = await this.institueClassService.findOne(classId);
      
      if (!classEntity) {
        throw new BadRequestException('Class not found');
      }

      // Remove the student from the class
      const removed = await this.classStudentService.removeStudentFromClass({
        instituteId: classEntity.instituteId,
        classId: classId,
        studentUserId: studentUserId
      });

      if (removed) {
        return {
          message: 'Student removed from class successfully',
          class: {
            id: classEntity.id,
            name: classEntity.name,
            code: classEntity.code,
            instituteId: classEntity.instituteId
          },
          studentUserId: studentUserId,
          removedBy: req.user?.s,
          removedAt: new Date()
        };
      } else {
        throw new BadRequestException('Failed to remove student from class');
      }
    } catch (error) {
      if (error.message?.includes('not found') || error.message?.includes('NOT_FOUND')) {
        throw new BadRequestException('Student is not assigned to this class');
      }
      throw new BadRequestException(`Failed to remove student from class: ${error.message}`);
    }
  }

  @Get(':id/students')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ 
    instituteAdmin: true,
    teacher: { requireClass: true }
  })
  //   classId: true,
  //   classIdParam: 'id'
  // })
  async getClassStudents(
    @Param('id', ClassExistsPipe) classId: string
  ) {
    try {
      // Get class details to ensure it exists and get institute ID
      const classEntity = await this.institueClassService.findOne(classId);
      
      if (!classEntity) {
        throw new BadRequestException('Class not found');
      }

      // Get all students in the class
      const students = await this.classStudentService.getClassStudents(classId);

      return {
        message: 'Class students retrieved successfully',
        class: {
          id: classEntity.id,
          name: classEntity.name,
          code: classEntity.code,
          instituteId: classEntity.instituteId
        },
        students: students.map(student => ({
          instituteId: student.instituteId,
          classId: student.classId,
          studentUserId: student.studentUserId,
          isActive: student.isActive,
          isVerified: student.isVerified,
          enrollmentMethod: student.enrollmentMethod,
          enrolledAt: student.createdAt,
          verifiedAt: student.verifiedAt,
          verifiedBy: student.verifiedBy,
          updatedAt: student.updatedAt
        })),
        count: students.length,
        activeStudents: students.filter(s => s.isActive).length,
        verifiedStudents: students.filter(s => s.isVerified).length
      };
    } catch (error) {
      throw new BadRequestException(`Failed to get class students: ${error.message}`);
    }
  }

  @Get(':instituteId/student/:studentId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ 
    student: { requireClass: true },
    parent: { requireStudent: true },
    teacher: true,
    instituteAdmin: true
  })
  @UsePipes(new ValidationPipe({ 
    transform: true, 
    whitelist: true, 
    validateCustomDecorators: true
  }))
  @ApiOperation({
    summary: 'Get all classes (verified and unverified) for a specific student within an institute',
    description: 'Ultra-secure endpoint that retrieves all classes that a student is enrolled in within a specific institute, including both verified and pending enrollments. Returns isVerified field to indicate enrollment status. Protected by JWT authentication, institute-scoped access control, role-based authorization, and comprehensive input validation. Uses parameterized queries to prevent SQL injection. Returns paginated results with sanitized response data. Includes anti-hacking protections against XSS, CSRF, injection attacks, and privilege escalation.'
  })
  @ApiParam({
    name: 'instituteId',
    description: 'Institute ID (BigInt format) - must match JWT institute context',
    example: '1'
  })
  @ApiParam({
    name: 'studentId',
    description: 'Student User ID (BigInt format)',
    example: '40'
  })
  @ApiQuery({
    name: 'page',
    description: 'Page number for pagination (1-1000)',
    example: 1,
    required: false
  })
  @ApiQuery({
    name: 'limit',
    description: 'Number of records per page (1-100)',
    example: 10,
    required: false
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Verified student classes retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              instituteId: { type: 'string', example: '1' },
              classId: { type: 'string', example: '6' },
              isActive: { type: 'boolean', example: true },
              isVerified: { type: 'boolean', example: true },
              enrolledAt: { type: 'string', format: 'date-time', example: '2025-09-11T11:29:17.332Z' },
              class: {
                type: 'object',
                properties: {
                  id: { type: 'string', example: '6' },
                  name: { type: 'string', example: 'English' },
                  code: { type: 'string', example: 'G10Engs' },
                  grade: { type: 'number', example: 10 },
                  specialty: { type: 'string', example: 'English' },
                  academicYear: { type: 'string', example: '2025/2026' },
                  classType: { type: 'string', example: 'REGULAR' },
                  imageUrl: { type: 'string', example: 'https://example.com/class-images/english-class.jpg', nullable: true }
                }
              }
            }
          }
        },
        total: { type: 'number', example: 1 },
        page: { type: 'number', example: 1 },
        limit: { type: 'number', example: 10 },
        totalPages: { type: 'number', example: 1 },
        hasNext: { type: 'boolean', example: false },
        hasPrevious: { type: 'boolean', example: false }
      }
    }
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid parameters or validation errors'
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Authentication required'
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Access denied - insufficient permissions or institute mismatch'
  })
  async getStudentClasses(
    @Param('instituteId', ParseIdPipe) instituteId: string,
    @Param('studentId', ParseIdPipe) studentId: string,
    @Query() queryDto: ClassQueryDto,
    @Request() req: JwtRequest,
    @Headers() headers: any
  ) {
    const requestId = headers['x-request-id'] || this.generateRequestId();
    
    try {
      // Extract and validate query parameters from DTO
      const { page = 1, limit = 10 } = queryDto;
      
      // Comprehensive input validation
      if (!instituteId || isNaN(Number(instituteId))) {
        throw new BadRequestException('Invalid institute ID format');
      }
      
      if (!studentId || isNaN(Number(studentId))) {
        throw new BadRequestException('Invalid student ID format');
      }

      // Validate pagination parameters
      if (page < 1 || page > 1000) {
        throw new BadRequestException('Page must be between 1 and 1000');
      }
      
      if (limit < 1 || limit > 100) {
        throw new BadRequestException('Limit must be between 1 and 100');
      }

      // Authorization logic - extract user info from JWT
      const currentUserId = req.user?.s;
      
      // Extract institute IDs from JWT hierarchical access structure (array of {i, r, c})
      const userInstituteIds = Array.isArray(req.user?.i) ? req.user.i.map(entry => entry.i) : [];
      const adminInstituteIds = Array.isArray(req.user?.i) ? req.user.i.filter(entry => (entry.r & 2) === 2).map(entry => entry.i) : [];

      // Access control will be handled by decorators

      // Calculate pagination with bounds checking
      const offset = Math.max(0, (page - 1) * limit);

      // Enhanced secure parameterized query with mandatory institute filtering (includes verified and unverified)
      const query = `
        SELECT 
          ics.institute_id as "instituteId",
          ics.institute_class_id as "classId",
          ics.is_active as "isActive",
          ics.is_verified as "isVerified",
          ics.created_at as "enrolledAt",
          
          -- Class details with XSS protection and image URL
          TRIM(ic.name) as "className",
          TRIM(ic.code) as "classCode",
          ic.grade as "classGrade",
          TRIM(ic.specialty) as "classSpecialty",
          TRIM(ic.academic_year) as "classAcademicYear",
          TRIM(ic.class_type) as "classType",
          TRIM(ic.image_url) as "classImageUrl"
          
        FROM institute_class_students ics
        LEFT JOIN institute_classes ic ON ics.institute_class_id = ic.id
        WHERE ics.student_user_id = ? 
        AND ics.institute_id = ?
        AND ics.is_active = true
        ORDER BY ics.is_verified DESC, ics.created_at DESC
        LIMIT ? OFFSET ?
      `;

      // Enhanced secure parameterized count query with institute filtering (includes verified and unverified)
      const countQuery = `
        SELECT COUNT(*) as total
        FROM institute_class_students ics
        WHERE ics.student_user_id = ? 
        AND ics.institute_id = ?
        AND ics.is_active = true
      `;

      // Execute secure parameterized queries with institute ID validation
      const [result, countResult] = await Promise.all([
        this.dataSource.query(query, [studentId, instituteId, limit, offset]),
        this.dataSource.query(countQuery, [studentId, instituteId])
      ]);

      const total = parseInt(countResult[0]?.total || '0');

      // Enhanced data sanitization with XSS prevention and institute validation
      const data = result.map((row: any) => ({
        instituteId: String(row.instituteId || ''),
        classId: String(row.classId || ''),
        isActive: Boolean(row.isActive),
        isVerified: Boolean(row.isVerified),
        enrolledAt: row.enrolledAt || null,
        class: {
          id: String(row.classId || ''),
          name: this.sanitizeString(String(row.className || '').trim()),
          code: this.sanitizeString(String(row.classCode || '').trim()),
          grade: row.classGrade ? parseInt(row.classGrade) : null,
          specialty: this.sanitizeString(String(row.classSpecialty || '').trim()),
          academicYear: this.sanitizeString(String(row.classAcademicYear || '').trim()),
          classType: this.sanitizeString(String(row.classType || '').trim()),
          imageUrl: row.classImageUrl ? this.sanitizeString(String(row.classImageUrl).trim()) : null
        }
      })).filter(item => {
        // Validate institute ID matches request and filter out invalid entries
        return item.classId && item.instituteId === instituteId;
      });

      // Enhanced response with security headers and tracking
      return {
        data,
        total,
        page,
        limit,
        instituteId,
        requestId,
        timestamp: getCurrentSriLankaISO(),
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrevious: page > 1
      };
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof ForbiddenException) {
        throw error;
      }
      
      // Include original error message for debugging
      throw new BadRequestException(`Operation failed: ${error.message}`);
    }
  }

  @Get(':instituteId/teacher/:teacherId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ 
    teacher: true,
    instituteAdmin: true
  })
  @UsePipes(new ValidationPipe({ 
    transform: true, 
    whitelist: true, 
    validateCustomDecorators: true
  }))
  @ApiOperation({
    summary: 'Get classes for a specific teacher within an institute',
    description: 'Ultra-secure endpoint that retrieves all classes that a teacher is associated with within a specific institute. Returns classes where the teacher either teaches specific subjects (priority 1) or serves as the class teacher (priority 2). Automatically removes duplicates and prioritizes subject-teaching assignments. Protected by JWT authentication, institute-scoped access control, role-based authorization, and comprehensive input validation. Uses parameterized queries to prevent SQL injection. Returns paginated results with sanitized response data.'
  })
  @ApiParam({
    name: 'instituteId',
    description: 'Institute ID (BigInt format) - must match JWT institute context',
    example: '1'
  })
  @ApiParam({
    name: 'teacherId',
    description: 'Teacher User ID (BigInt format)',
    example: '41'
  })
  @ApiQuery({
    name: 'page',
    description: 'Page number for pagination (1-1000)',
    example: 1,
    required: false
  })
  @ApiQuery({
    name: 'limit',
    description: 'Number of records per page (1-100)',
    example: 10,
    required: false
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Teacher classes retrieved successfully'
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid parameters or validation errors'
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Authentication required'
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Access denied - insufficient permissions or institute mismatch'
  })
  async getTeacherClasses(
    @Param('instituteId', ParseIdPipe) instituteId: string,
    @Param('teacherId', ParseIdPipe) teacherId: string,
    @Query() queryDto: ClassQueryDto,
    @Request() req: JwtRequest,
    @Headers() headers: any
  ) {
    const requestId = headers['x-request-id'] || this.generateRequestId();
    
    try {
      // Extract and validate query parameters from DTO
      const { page = 1, limit = 10 } = queryDto;
      
      // Comprehensive input validation
      if (!instituteId || isNaN(Number(instituteId))) {
        throw new BadRequestException('Invalid institute ID format');
      }
      
      if (!teacherId || isNaN(Number(teacherId))) {
        throw new BadRequestException('Invalid teacher ID format');
      }

      // Validate pagination parameters
      if (page < 1 || page > 1000) {
        throw new BadRequestException('Page must be between 1 and 1000');
      }
      
      if (limit < 1 || limit > 100) {
        throw new BadRequestException('Limit must be between 1 and 100');
      }

      // Authorization logic - extract user info from JWT
      const currentUserId = req.user?.s;
      
      // Extract institute IDs from JWT hierarchical access structure (array of {i, r, c})
      const userInstituteIds = Array.isArray(req.user?.i) ? req.user.i.map(entry => entry.i) : [];
      const adminInstituteIds = Array.isArray(req.user?.i) ? req.user.i.filter(entry => (entry.r & 2) === 2).map(entry => entry.i) : [];

      // Access control will be handled by decorators

      // Call service method to get teacher classes
      const result = await this.institueClassService.getTeacherClasses(teacherId, instituteId, page, limit);

      // Enhanced response with security headers and tracking
      return {
        data: result.data,
        total: result.total,
        page: result.page,
        limit: result.limit,
        instituteId: result.instituteId,
        requestId,
        timestamp: result.timestamp,
        totalPages: Math.ceil(result.total / limit),
        hasNext: page < Math.ceil(result.total / limit),
        hasPrevious: page > 1
      };
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof ForbiddenException) {
        throw error;
      }
      
      throw new BadRequestException('Operation failed');
    }
  }
}

