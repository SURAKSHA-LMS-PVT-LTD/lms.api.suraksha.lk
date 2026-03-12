import { Controller, Get, Param, UseGuards, Req, Logger, Query, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { ChildrenAccessGuard } from '../../../auth/guards/children-access.guard';
import { ChildrenAccess } from '../../../auth/decorators/children-access.decorator';
import { EnhancedJwtPayload } from '../../../auth/interfaces/enhanced-jwt-payload.interface';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { getCurrentSriLankaISO } from '../../../common/utils/timezone.util';

// Import services and entities
import { StudentEntity } from '../../student/entities/student.entity';
import { InstituteClassStudentService } from '../../institute_class_modules/institute_class_student/institute_class_student.service';
import { InstituteClassSubjectStudentsService } from '../../institute_class_subject_modules/institute_class_subject_students/institute_class_subject_students.service';
import { InstitutesService } from '../../institute/institute.service';
import { CloudStorageService } from '../../../common/services/cloud-storage.service';

/**
 * Extended request interface with JWT v2 payload
 */
interface JwtRequest extends Request {
  user: EnhancedJwtPayload;
  params: any;
  query: any;
  accessibleChildrenIds?: string[];
}

@ApiTags('Parent Access - Student Data (JWT v2)')
@Controller('parent')
@UseGuards(JwtAuthGuard, ChildrenAccessGuard)
@ApiBearerAuth()
export class ParentAccessController {
  private readonly logger = new Logger(ParentAccessController.name);

  constructor(
    @InjectRepository(StudentEntity)
    private readonly studentRepository: Repository<StudentEntity>,
    private readonly instituteClassStudentService: InstituteClassStudentService,
    private readonly instituteClassSubjectStudentsService: InstituteClassSubjectStudentsService,
    private readonly institutesService: InstitutesService,
    private readonly cloudStorageService: CloudStorageService,
  ) {
  }

  @Get('my-children')
  @ApiOperation({ 
    summary: 'Get All Children',
    description: 'Returns all students that the current parent has access to (from JWT token c array)'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Children retrieved successfully'
  })
  async getMyChildren(@Req() request: JwtRequest) {
    const jwtPayload: EnhancedJwtPayload = request.user;
    const childrenIds = jwtPayload.c || [];
    
    
    if (childrenIds.length === 0) {
      return {
        success: true,
        children: [],
        total: 0,
        message: 'No children found in access list'
      };
    }
    
    // Fetch students by IDs from JWT token using repository
    const students = await this.studentRepository.find({
      where: { userId: In(childrenIds) },
      relations: ['user']
    });
    
    
    return {
      success: true,
      children: students.map(student => ({
        studentId: student.userId,
        name: `${student.user.firstName} ${student.user.lastName}`,
        nameWithInitials: student.user.nameWithInitials || undefined,
        email: student.user.email,
        isActive: student.isActive,
        studentIdNumber: student.studentId,
        emergencyContact: student.emergencyContact,
        bloodGroup: student.bloodGroup
      })),
      total: students.length
    };
  }

  @Get('child/:studentId')
  @ChildrenAccess('studentId')
  @ApiOperation({ 
    summary: 'Get Child Profile',
    description: 'Returns detailed profile information for a specific child (validated via JWT token c array)'
  })
  @ApiParam({ 
    name: 'studentId', 
    description: 'Student user ID',
    example: '12345'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Child profile retrieved successfully'
  })
  @ApiResponse({ 
    status: 403, 
    description: 'Forbidden - Parent does not have access to this child'
  })
  async getChildProfile(
    @Param('studentId') studentId: string,
    @Req() request: JwtRequest
  ) {
    const jwtPayload: EnhancedJwtPayload = request.user;
    
    // JWT validation already confirmed studentId is in c array
    const student = await this.studentRepository.findOne({
      where: { userId: studentId },
      relations: ['user']
    });
    
    if (!student) {
      throw new BadRequestException(`Student ${studentId} not found`);
    }
    
    return {
      success: true,
      child: {
        id: student.userId,
        name: `${student.user.firstName} ${student.user.lastName}`,
        nameWithInitials: student.user.nameWithInitials || undefined,
        email: student.user.email,
        phone: student.user.phoneNumber,
        dateOfBirth: student.user.dateOfBirth,
        gender: student.user.gender,
        address: {
          line1: student.user.addressLine1,
          line2: student.user.addressLine2,
          city: student.user.city,
        },
        studentIdNumber: student.studentId,
        emergencyContact: student.emergencyContact,
        medicalConditions: student.medicalConditions,
        allergies: student.allergies,
        bloodGroup: student.bloodGroup,
        isActive: student.isActive
      },
      accessedAt: getCurrentSriLankaISO()
    };
  }

  @Get('student/:studentId/institutes')
  @ChildrenAccess('studentId')
  @ApiOperation({ 
    summary: 'Get Student Institutes',
    description: 'Returns all institutes where the student is enrolled with complete institute details'
  })
  @ApiParam({ 
    name: 'studentId', 
    description: 'Student user ID',
    example: '12345'
  })
  @ApiQuery({ 
    name: 'activeOnly', 
    required: false, 
    description: 'Show only active enrollments',
    example: 'true'
  })
  @ApiQuery({ 
    name: 'verifiedOnly', 
    required: false, 
    description: 'Show only verified enrollments',
    example: 'false'
  })
  async getStudentInstitutes(
    @Param('studentId') studentId: string,
    @Req() request: JwtRequest,
    @Query('activeOnly') activeOnly: string = 'false',
    @Query('verifiedOnly') verifiedOnly: string = 'false'
  ) {
    const jwtPayload: EnhancedJwtPayload = request.user;
    
    try {
      // Get all student enrollments across all institutes
      const enrollments = await this.instituteClassStudentService
        .getStudentEnrolledClassesWithFilters(studentId, {
          activeOnly: activeOnly === 'true',
          verifiedOnly: verifiedOnly === 'true'
        });

      // Handle case where enrollments might not have expected structure
      const enrollmentData = enrollments?.data || enrollments || [];
      
      // Get unique institute IDs
      const instituteIds = [...new Set(enrollmentData.map(enrollment => enrollment.instituteId))];
      
      // Fetch complete institute details in bulk
      const institutes = await this.institutesService.findByIds(instituteIds.map(id => String(id)));
      const instituteDetails = institutes.map(institute => ({
        id: institute.id,
        name: institute.name,
        email: institute.email,
        phone: institute.phone,
        address: institute.address,
        city: institute.city,
        state: institute.state,
        country: institute.country,
        type: institute.type,
        isActive: institute.isActive,
        createdAt: institute.createdAt,
        // ✅ Transform imageUrl to full URL
        imageUrl: institute.imageUrl ? this.cloudStorageService.getFullUrl(institute.imageUrl) : institute.imageUrl
      }));

      return {
        success: true,
        message: `Student institutes retrieved successfully${activeOnly === 'true' ? ' (active only)' : ''}${verifiedOnly === 'true' ? ' (verified only)' : ''}`,
        institutes: instituteDetails,
        studentId,
        timestamp: getCurrentSriLankaISO()
      };

    } catch (error) {
      this.logger.error(`Failed to get student institutes: ${error.message}`);
      throw new BadRequestException(`Failed to get student institutes: ${error.message}`);
    }
  }

  @Get('student/:studentId/institute/:instituteId/classes')
  @ChildrenAccess('studentId')
  @ApiOperation({ 
    summary: 'Get Student Classes in Specific Institute',
    description: 'Returns all classes where the student is enrolled within a specific institute'
  })
  @ApiParam({ 
    name: 'studentId', 
    description: 'Student user ID',
    example: '8'
  })
  @ApiParam({ 
    name: 'instituteId', 
    description: 'Institute ID',
    example: '1'
  })
  @ApiQuery({ 
    name: 'page', 
    required: false, 
    description: 'Page number',
    example: 1
  })
  @ApiQuery({ 
    name: 'limit', 
    required: false, 
    description: 'Items per page (max 50)',
    example: 10
  })
  @ApiQuery({ 
    name: 'verifiedOnly', 
    required: false, 
    description: 'Show only verified enrollments',
    example: 'false'
  })
  @ApiQuery({ 
    name: 'activeOnly', 
    required: false, 
    description: 'Show only active enrollments',
    example: 'true'
  })
  async getStudentClassesInInstitute(
    @Param('studentId') studentId: string,
    @Param('instituteId') instituteId: string,
    @Req() request: JwtRequest,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('verifiedOnly') verifiedOnly: string = 'false',
    @Query('activeOnly') activeOnly: string = 'true'
  ) {
    const jwtPayload: EnhancedJwtPayload = request.user;
    
    try {
      const parsedPage = parseInt(page);
      const parsedLimit = Math.min(parseInt(limit), 50);

      const options = {
        skip: (parsedPage - 1) * parsedLimit,
        take: parsedLimit,
        activeOnly: activeOnly === 'true',
        instituteId: instituteId,
        verifiedOnly: verifiedOnly === 'true'
      };

      // Get student's classes in the specific institute
      const result = await this.instituteClassStudentService
        .getStudentEnrolledClassesWithFilters(studentId, options);

      // Handle different response structures
      const resultData = result?.data || result || [];
      
      // Filter to ensure we only get classes from the specified institute
      const instituteClasses = resultData.filter(classData => 
        classData.instituteId === instituteId
      );

      // Extract institute information from the first result
      const instituteInfo = instituteClasses.length > 0 ? {
        instituteId: instituteClasses[0].instituteId,
        instituteName: instituteClasses[0].institute?.name || `Institute ${instituteId}`,
        instituteCode: instituteClasses[0].institute?.code || `INST${instituteId}`
      } : {
        instituteId: instituteId,
        instituteName: `Institute ${instituteId}`,
        instituteCode: `INST${instituteId}`
      };

      // Format class data
      const formattedClasses = instituteClasses.map(classData => ({
        classId: classData.classId,
        className: classData.class?.name || `Class ${classData.classId}`,
        classCode: classData.class?.code || `CLS${classData.classId}`,
        grade: classData.class?.grade,
        academicYear: classData.class?.academicYear,
        specialty: classData.class?.specialty,
        isActive: classData.isActive,
        isVerified: classData.isVerified,
        enrolledAt: classData.enrolledAt || classData.createdAt,
        enrollmentMethod: classData.enrollmentMethod,
        lastModified: classData.updatedAt
      }));

      return {
        success: true,
        message: `Student classes in institute ${instituteId} retrieved successfully`,
        institute: instituteInfo,
        classes: formattedClasses,
        total: formattedClasses.length,
        page: parsedPage,
        limit: parsedLimit,
        studentId,
        filters: {
          instituteId,
          verifiedOnly: verifiedOnly === 'true',
          activeOnly: activeOnly === 'true'
        },
        timestamp: getCurrentSriLankaISO()
      };

    } catch (error) {
      this.logger.error(`Failed to get student classes in institute: ${error.message}`);
      throw new BadRequestException(`Failed to get student classes in institute: ${error.message}`);
    }
  }

  @Get('student/:studentId/institute/:instituteId/class/:classId/subjects')
  @ChildrenAccess('studentId')
  @ApiOperation({ 
    summary: 'Get Student Subjects in Specific Institute Class',
    description: 'Returns all subjects where the student is enrolled within a specific institute and class'
  })
  @ApiParam({ 
    name: 'studentId', 
    description: 'Student user ID',
    example: '8'
  })
  @ApiParam({ 
    name: 'instituteId', 
    description: 'Institute ID',
    example: '1'
  })
  @ApiParam({ 
    name: 'classId', 
    description: 'Class ID',
    example: '40'
  })
  @ApiQuery({ 
    name: 'page', 
    required: false, 
    description: 'Page number',
    example: 1
  })
  @ApiQuery({ 
    name: 'limit', 
    required: false, 
    description: 'Items per page (max 50)',
    example: 10
  })
  @ApiQuery({ 
    name: 'activeOnly', 
    required: false, 
    description: 'Show only active subject enrollments',
    example: 'true'
  })
  async getStudentSubjectsInInstituteClass(
    @Param('studentId') studentId: string,
    @Param('instituteId') instituteId: string,
    @Param('classId') classId: string,
    @Req() request: JwtRequest,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('activeOnly') activeOnly: string = 'true'
  ) {
    const jwtPayload: EnhancedJwtPayload = request.user;
    
    try {
      const parsedPage = parseInt(page);
      const parsedLimit = Math.min(parseInt(limit), 50);

      // First verify that the student is enrolled in this specific institute and class
      const classEnrollment = await this.instituteClassStudentService
        .getStudentEnrolledClassesWithFilters(studentId, {
          instituteId: instituteId,
          classId: classId,
          activeOnly: activeOnly === 'true'
        });

      const enrollmentData = classEnrollment?.data || classEnrollment || [];
      
      if (!enrollmentData || enrollmentData.length === 0) {
        throw new BadRequestException(`Student ${studentId} is not enrolled in class ${classId} of institute ${instituteId}`);
      }

      const enrollment = enrollmentData[0];

      // Get subjects for this specific institute, class, and student
      const subjectsResult = await this.instituteClassSubjectStudentsService
        .getStudentClassSubjects(instituteId, classId, studentId, parsedPage, parsedLimit);

      // Format context information
      const context = {
        institute: {
          instituteId: enrollment.instituteId,
          instituteName: enrollment.institute?.name || `Institute ${instituteId}`,
          instituteCode: enrollment.institute?.code || `INST${instituteId}`
        },
        class: {
          classId: enrollment.classId,
          className: enrollment.class?.name || `Class ${classId}`,
          classCode: enrollment.class?.code || `CLS${classId}`,
          grade: enrollment.class?.grade,
          academicYear: enrollment.class?.academicYear,
          specialty: enrollment.class?.specialty
        }
      };

      // Handle different response structures
      const subjectData = subjectsResult?.data || [];

      // Format subject data
      const formattedSubjects = subjectData.map(subjectData => ({
        subjectId: subjectData.subjectId,
        subjectName: subjectData.subject?.name || `Subject ${subjectData.subjectId}`,
        subjectCode: subjectData.subject?.code || `SUBJ${subjectData.subjectId}`,
        description: subjectData.subject?.description,
        category: subjectData.subject?.category,
        teacher: subjectData.teacher ? {
          teacherId: subjectData.teacher.userId,
          teacherName: subjectData.teacher.user?.nameWithInitials || `${subjectData.teacher.user?.firstName || ''} ${subjectData.teacher.user?.lastName || ''}`.trim(),
          teacherEmail: subjectData.teacher.user?.email
        } : null,
        enrollmentDate: subjectData.enrolledAt || subjectData.createdAt,
        isActive: subjectData.isActive,
        subjectType: subjectData.subjectType || 'regular',
        credits: subjectData.credits || 0,
        gradeWeight: subjectData.gradeWeight,
        lastModified: subjectData.updatedAt
      }));

      return {
        success: true,
        message: `Student subjects in institute ${instituteId}, class ${classId} retrieved successfully`,
        context,
        subjects: formattedSubjects,
        total: subjectsResult?.total || formattedSubjects.length,
        page: parsedPage,
        limit: parsedLimit,
        studentId,
        filters: {
          instituteId,
          classId,
          activeOnly: activeOnly === 'true'
        },
        timestamp: getCurrentSriLankaISO()
      };

    } catch (error) {
      this.logger.error(`Failed to get student subjects in institute class: ${error.message}`);
      throw new BadRequestException(`Failed to get student subjects in institute class: ${error.message}`);
    }
  }

  @Get('student/:studentId/classes')
  @ChildrenAccess('studentId')
  @ApiOperation({ 
    summary: 'Get Student Classes',
    description: 'Returns classes where the student is enrolled, optionally filtered by institute'
  })
  @ApiParam({ 
    name: 'studentId', 
    description: 'Student user ID',
    example: '12345'
  })
  @ApiQuery({ 
    name: 'instituteId', 
    required: false, 
    description: 'Filter by specific institute ID',
    example: '1'
  })
  @ApiQuery({ 
    name: 'page', 
    required: false, 
    description: 'Page number',
    example: 1
  })
  @ApiQuery({ 
    name: 'limit', 
    required: false, 
    description: 'Items per page (max 50)',
    example: 10
  })
  @ApiQuery({ 
    name: 'verifiedOnly', 
    required: false, 
    description: 'Show only verified enrollments',
    example: 'false'
  })
  async getStudentClasses(
    @Param('studentId') studentId: string,
    @Req() request: JwtRequest,
    @Query('instituteId') instituteId?: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('verifiedOnly') verifiedOnly: string = 'false'
  ) {
    const jwtPayload: EnhancedJwtPayload = request.user;
    
    try {
      const parsedPage = parseInt(page);
      const parsedLimit = Math.min(parseInt(limit), 50);

      const options = {
        skip: (parsedPage - 1) * parsedLimit,
        take: parsedLimit,
        activeOnly: true,
        instituteId: instituteId || undefined,
        verifiedOnly: verifiedOnly === 'true'
      };

      // Get student's classes using the existing service
      const result = await this.instituteClassStudentService
        .getStudentEnrolledClassesWithFilters(studentId, options);

      // Handle different response structures
      const resultData = result?.data || result || [];

      // Filter by institute if specified
      let filteredData = resultData;
      if (instituteId) {
        filteredData = resultData.filter(classData => classData.instituteId === instituteId);
      }

      return {
        success: true,
        message: `Student classes retrieved successfully${instituteId ? ` for institute ${instituteId}` : ''}`,
        data: filteredData,
        total: filteredData.length,
        page: parsedPage,
        limit: parsedLimit,
        studentId,
        filters: {
          instituteId: instituteId || 'all',
          verifiedOnly: verifiedOnly === 'true'
        },
        timestamp: getCurrentSriLankaISO()
      };

    } catch (error) {
      this.logger.error(`Failed to get student classes: ${error.message}`);
      throw new BadRequestException(`Failed to get student classes: ${error.message}`);
    }
  }

  @Get('student/:studentId/subjects')
  @ChildrenAccess('studentId')
  @ApiOperation({ 
    summary: 'Get Student Subjects',
    description: 'Returns institute class subjects the student is enrolled in, optionally filtered by institute and class'
  })
  @ApiParam({ 
    name: 'studentId', 
    description: 'Student user ID',
    example: '12345'
  })
  @ApiQuery({ 
    name: 'instituteId', 
    required: false, 
    description: 'Filter by specific institute ID',
    example: '1'
  })
  @ApiQuery({ 
    name: 'classId', 
    required: false, 
    description: 'Filter by specific class ID',
    example: '40'
  })
  @ApiQuery({ 
    name: 'page', 
    required: false, 
    description: 'Page number',
    example: 1
  })
  @ApiQuery({ 
    name: 'limit', 
    required: false, 
    description: 'Items per page (max 50)',
    example: 10
  })
  async getStudentSubjects(
    @Param('studentId') studentId: string,
    @Req() request: JwtRequest,
    @Query('instituteId') instituteId?: string,
    @Query('classId') classId?: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10'
  ) {
    const jwtPayload: EnhancedJwtPayload = request.user;
    
    try {
      const parsedPage = parseInt(page);
      const parsedLimit = Math.min(parseInt(limit), 50);

      let subjects = [];
      let total = 0;

      if (instituteId && classId) {
        // Get subjects for specific institute and class
        const result = await this.instituteClassSubjectStudentsService
          .getStudentClassSubjects(instituteId, classId, studentId, parsedPage, parsedLimit);
        
        subjects = result?.data || [];
        total = result?.total || 0;
      } else {
        // Get all subjects for the student across all institutes and classes
        const allSubjects = await this.instituteClassSubjectStudentsService
          .getClassSubjectsForStudent(studentId);

        // Filter by institute if specified
        let filteredSubjects = allSubjects || [];
        if (instituteId) {
          filteredSubjects = filteredSubjects.filter(subject => subject.instituteId === instituteId);
        }

        // Apply pagination
        total = filteredSubjects.length;
        const startIndex = (parsedPage - 1) * parsedLimit;
        subjects = filteredSubjects.slice(startIndex, startIndex + parsedLimit);
      }

      // Group subjects by institute for better organization
      const groupedByInstitute = subjects.reduce((acc, subject) => {
        const instId = subject.instituteId;
        if (!acc[instId]) {
          acc[instId] = {
            instituteId: instId,
            instituteName: 'Institute ' + instId,
            subjects: []
          };
        }
        acc[instId].subjects.push(subject);
        return acc;
      }, {});

      return {
        success: true,
        message: `Student subjects retrieved successfully${instituteId ? ` for institute ${instituteId}` : ''}${classId ? ` in class ${classId}` : ''}`,
        data: subjects,
        total,
        page: parsedPage,
        limit: parsedLimit,
        studentId,
        groupedByInstitute: Object.values(groupedByInstitute),
        filters: {
          instituteId: instituteId || 'all',
          classId: classId || 'all'
        },
        timestamp: getCurrentSriLankaISO()
      };

    } catch (error) {
      this.logger.error(`Failed to get student subjects: ${error.message}`);
      throw new BadRequestException(`Failed to get student subjects: ${error.message}`);
    }
  }

  @Get('student/:studentId/homework')
  @ChildrenAccess('studentId')
  @ApiOperation({ 
    summary: 'Get Student Homework',
    description: 'Returns homework assignments and submissions for the student'
  })
  @ApiParam({ 
    name: 'studentId', 
    description: 'Student user ID',
    example: '12345'
  })
  async getStudentHomework(
    @Param('studentId') studentId: string,
    @Req() request: JwtRequest
  ) {
    const jwtPayload: EnhancedJwtPayload = request.user;
    
    return {
      success: true,
      message: 'Student homework endpoint - implementation needed',
      studentId,
      note: 'This endpoint would integrate with homework and submissions modules'
    };
  }

  @Get('student/:studentId/attendance')
  @ChildrenAccess('studentId')
  @ApiOperation({ 
    summary: 'Get Student Attendance',
    description: 'Returns attendance records for the student'
  })
  @ApiParam({ 
    name: 'studentId', 
    description: 'Student user ID',
    example: '12345'
  })
  async getStudentAttendance(
    @Param('studentId') studentId: string,
    @Req() request: JwtRequest
  ) {
    const jwtPayload: EnhancedJwtPayload = request.user;
    
    return {
      success: true,
      message: 'Student attendance endpoint - implementation needed',
      studentId,
      note: 'This endpoint would integrate with attendance modules'
    };
  }

  @Get('student/:studentId/grades')
  @ChildrenAccess('studentId')
  @ApiOperation({ 
    summary: 'Get Student Grades',
    description: 'Returns grades and academic results for the student'
  })
  @ApiParam({ 
    name: 'studentId', 
    description: 'Student user ID',
    example: '12345'
  })
  async getStudentGrades(
    @Param('studentId') studentId: string,
    @Req() request: JwtRequest
  ) {
    const jwtPayload: EnhancedJwtPayload = request.user;
    
    return {
      success: true,
      message: 'Student grades endpoint - implementation needed',
      studentId,
      note: 'This endpoint would integrate with results/grades modules'
    };
  }

  @Get('student/:studentId/payments')
  @ChildrenAccess('studentId')
  @ApiOperation({ 
    summary: 'Get Student Payments',
    description: 'Returns payment records and status for the student'
  })
  @ApiParam({ 
    name: 'studentId', 
    description: 'Student user ID',
    example: '12345'
  })
  async getStudentPayments(
    @Param('studentId') studentId: string,
    @Req() request: JwtRequest
  ) {
    const jwtPayload: EnhancedJwtPayload = request.user;
    
    return {
      success: true,
      message: 'Student payments endpoint - implementation needed',
      studentId,
      note: 'This endpoint would integrate with payment modules'
    };
  }
}

