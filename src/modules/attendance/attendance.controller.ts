import { Controller, Post, Get, Patch, Query, Param, Body, HttpException, HttpStatus, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AttendanceService } from './attendance.service';
import { MarkAttendanceDto, BulkAttendanceDto, AttendanceResponseDto, GetStudentAttendanceDto, GetStudentAttendanceQueryDto, StudentAttendanceResponseDto, MyAttendanceQueryDto, MyAttendanceResponseDto } from './dto/attendance.dto';
import { MarkAttendanceByCardDto, GetAttendanceByCardDto, BulkCardAttendanceDto } from './dto/card-attendance.dto';
import { MarkAttendanceByInstituteCardDto, GetInstituteUserByCardDto, InstituteCardUserResponseDto } from './dto/institute-card-attendance.dto';
import { GetClassStudentsInstituteAttendanceQueryDto, BulkMarkClassFromInstituteDto } from './dto/class-attendance-from-institute.dto';
import { GetSubjectStudentsClassAttendanceQueryDto, BulkMarkSubjectFromClassDto } from './dto/subject-attendance-from-class.dto';
import { UserType } from '../user/enums/user-type.enum';
import { Request } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { FlexibleAccessGuard } from '../../auth/guards/flexible-access.guard';
import { RequireAnyOfRoles } from '../../auth/decorators/flexible-access.decorator';

@ApiTags('Attendance')
@Controller('api/attendance')
export class AttendanceController {
  constructor(
    private readonly attendanceService: AttendanceService
  ) {}

  @Post('mark')
  @Throttle({ default: { limit: 30, ttl: 60000 } }) // 🔒 30 attendance marks per minute
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: true,
    attendanceMarker: true
  })
  @ApiOperation({ 
    summary: 'Mark single student attendance',
    description: 'Mark attendance for a single student. Accessible by SUPERADMIN, Institute Admin, Teacher, or Attendance Marker.'
  })
  @ApiResponse({ 
    status: 201, 
    description: 'Attendance marked successfully',
    type: AttendanceResponseDto 
  })
  @ApiResponse({ status: 400, description: 'Bad request - validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized - invalid JWT token' })
  @ApiResponse({ status: 403, description: 'Forbidden - insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Student not found' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async markAttendance(
    @Body() attendanceData: MarkAttendanceDto,
    @Req() request: Request & { user: any }
  ): Promise<AttendanceResponseDto> {
    try {
      const user = request.user;
      
      // Get user ID from JWT token (support JWT v2 and legacy formats)
      const markedByUser = user.s || user.subject || user.sub || user.id;

      const result = await this.attendanceService.markAttendance(attendanceData, markedByUser);
      return result;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to mark attendance',
        },
        error.message?.includes('not found') ? HttpStatus.NOT_FOUND : HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Post('mark-bulk')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: true,
    attendanceMarker: true
  })
  @ApiOperation({ 
    summary: 'Mark bulk student attendance',
    description: 'Mark attendance for multiple students in a single request. Accessible by SUPERADMIN, Institute Admin, Teacher, or Attendance Marker.'
  })
  @ApiResponse({ 
    status: 201, 
    description: 'Bulk attendance processed',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        summary: {
          type: 'object',
          properties: {
            successful: { type: 'number' },
            failed: { type: 'number' },
            total: { type: 'number' }
          }
        },
        results: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              studentId: { type: 'string' },
              success: { type: 'boolean' },
              attendanceId: { type: 'string' },
              error: { type: 'string' }
            }
          }
        }
      }
    }
  })
  @ApiResponse({ status: 400, description: 'Bad request - validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized - invalid JWT token' })
  @ApiResponse({ status: 403, description: 'Forbidden - insufficient permissions' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async markBulkAttendance(
    @Body() bulkData: BulkAttendanceDto,
    @Req() request: Request & { user: any }
  ) {
    try {
      const user = request.user;
      
      // Get user ID from JWT token (support JWT v2 and legacy formats)
      const markedByUser = user.s || user.subject || user.sub || user.id;

      // Validate bulk size
      const maxBulkSize = parseInt(process.env.MAX_BULK_ATTENDANCE_SIZE || '100');
      if (bulkData.students.length > maxBulkSize) {
        throw new HttpException(
          {
            success: false,
            message: `Bulk attendance size cannot exceed ${maxBulkSize} records`,
          },
          HttpStatus.BAD_REQUEST
        );
      }

      const result = await this.attendanceService.markBulkAttendance(bulkData, markedByUser);
      return result;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to process bulk attendance',
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get('student/:studentId')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: true,
    student: true,
    parent: true,
    attendanceMarker: true
  })
  @ApiOperation({ 
    summary: 'Get student attendance records with date filtering and pagination',
    description: 'Retrieve attendance records for a specific student. Accessible by SUPERADMIN, Institute Admin, Teacher, Student (own data), Parent (children data), or Attendance Marker.'
  })
  @ApiParam({ name: 'studentId', description: 'Student ID to filter attendance records' })
  @ApiResponse({ 
    status: 200, 
    description: 'Attendance records retrieved successfully',
    type: StudentAttendanceResponseDto 
  })
  @ApiResponse({ status: 400, description: 'Bad request - validation error' })
  @ApiResponse({ status: 404, description: 'Student not found or no records found' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async getStudentAttendance(
    @Param('studentId') studentId: string,
    @Query() queryDto: GetStudentAttendanceQueryDto,
    @Request() req: any
  ): Promise<StudentAttendanceResponseDto> {
    try {
      // Combine path parameter with query parameters
      const fullQueryDto: GetStudentAttendanceDto = {
        studentId,
        ...queryDto
      };

      // Validate date range
      const startDate = new Date(fullQueryDto.startDate);
      const endDate = new Date(fullQueryDto.endDate);
      
      if (startDate > endDate) {
        throw new HttpException(
          {
            success: false,
            message: 'Start date cannot be later than end date',
          },
          HttpStatus.BAD_REQUEST
        );
      }

      // Check if date range is not too large (e.g., max 1 year)
      const maxRangeDays = 365;
      const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      
      if (daysDiff > maxRangeDays) {
        throw new HttpException(
          {
            success: false,
            message: `Date range cannot exceed ${maxRangeDays} days`,
          },
          HttpStatus.BAD_REQUEST
        );
      }

      const result = await this.attendanceService.getStudentAttendance(fullQueryDto, req.user);
      
      return result;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to retrieve student attendance records',
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Post('mark-by-card')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: true,
    attendanceMarker: true
  })
  @ApiOperation({ 
    summary: 'Mark single student attendance by card ID',
    description: 'Mark attendance for a single student using their RFID card. Accessible by SUPERADMIN, Institute Admin, Teacher, or Attendance Marker. Student details will be fetched automatically using the card ID.'
  })
  @ApiResponse({ 
    status: 201, 
    description: 'Attendance marked successfully using card ID',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        attendanceId: { type: 'string' },
        studentId: { type: 'string' },
        studentCardId: { type: 'string' },
        studentName: { type: 'string' }
      }
    }
  })
  @ApiResponse({ status: 400, description: 'Bad request - validation error' })
  @ApiResponse({ status: 404, description: 'Student with card ID not found' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async markAttendanceByCard(
    @Body() attendanceData: MarkAttendanceByCardDto,
    @Req() request: Request & { user: any }
  ) {
    try {
      const user = request.user;
      // Support JWT v2 format (s) and legacy formats (subject, sub, id)
      const actualMarkedBy = user.s || user.subject || user.sub || user.id;
      
      if (!actualMarkedBy) {
        throw new HttpException(
          {
            success: false,
            message: 'Unable to identify user from JWT token',
          },
          HttpStatus.BAD_REQUEST
        );
      }

      const result = await this.attendanceService.markAttendanceByCard(attendanceData, actualMarkedBy);
      return result;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to mark attendance by card',
        },
        error.message?.includes('not found') ? HttpStatus.NOT_FOUND : HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Post('mark-bulk-by-card')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: true,
    attendanceMarker: true
  })
  @ApiOperation({ 
    summary: 'Mark bulk student attendance by card IDs',
    description: 'Mark attendance for multiple students using their RFID cards. Accessible by SUPERADMIN, Institute Admin, Teacher, or Attendance Marker. Student details will be fetched automatically using the card IDs.'
  })
  @ApiResponse({ 
    status: 201, 
    description: 'Bulk card attendance processed',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        summary: {
          type: 'object',
          properties: {
            successful: { type: 'number' },
            failed: { type: 'number' },
            total: { type: 'number' }
          }
        },
        results: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              studentCardId: { type: 'string' },
              studentId: { type: 'string' },
              studentName: { type: 'string' },
              success: { type: 'boolean' },
              attendanceId: { type: 'string' },
              error: { type: 'string' }
            }
          }
        }
      }
    }
  })
  @ApiResponse({ status: 400, description: 'Bad request - validation error' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async markBulkAttendanceByCard(
    @Body() bulkData: BulkCardAttendanceDto,
    @Req() request: Request & { user: any }
  ) {
    try {
      const user = request.user;
      // Support JWT v2 format (s) and legacy formats (subject, sub, id)
      const actualMarkedBy = user.s || user.subject || user.sub || user.id;
      
      if (!actualMarkedBy) {
        throw new HttpException(
          {
            success: false,
            message: 'Unable to identify user from JWT token',
          },
          HttpStatus.BAD_REQUEST
        );
      }

      // Validate bulk size
      const maxBulkSize = parseInt(process.env.MAX_BULK_ATTENDANCE_SIZE || '100');
      if (bulkData.students.length > maxBulkSize) {
        throw new HttpException(
          {
            success: false,
            message: `Bulk attendance size cannot exceed ${maxBulkSize} records`,
          },
          HttpStatus.BAD_REQUEST
        );
      }

      const result = await this.attendanceService.markBulkAttendanceByCard(bulkData, actualMarkedBy);
      return result;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to process bulk card attendance',
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get('by-cardId/:cardId')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: true,
    student: true,
    parent: true,
    attendanceMarker: true
  })
  @ApiOperation({ 
    summary: 'Get student attendance records by card ID with date filtering and pagination',
    description: 'Retrieve attendance records for a specific student using their RFID card. Accessible by SUPERADMIN, Institute Admin, Teacher, Student (own data), Parent (children data), or Attendance Marker.'
  })
  @ApiParam({ name: 'cardId', description: 'Student Card ID (RFID) to filter attendance records' })
  @ApiResponse({ 
    status: 200, 
    description: 'Attendance records retrieved successfully using card ID',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        studentInfo: {
          type: 'object',
          properties: {
            studentId: { type: 'string' },
            studentCardId: { type: 'string' },
            studentName: { type: 'string' },
            instituteName: { type: 'string' },
            className: { type: 'string' }
          }
        },
        pagination: {
          type: 'object',
          properties: {
            currentPage: { type: 'number' },
            totalPages: { type: 'number' },
            totalRecords: { type: 'number' },
            recordsPerPage: { type: 'number' },
            hasNextPage: { type: 'boolean' },
            hasPrevPage: { type: 'boolean' }
          }
        },
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              attendanceId: { type: 'string' },
              studentId: { type: 'string' },
              studentCardId: { type: 'string' },
              studentName: { type: 'string' },
              instituteId: { type: 'string' },
              instituteName: { type: 'string' },
              classId: { type: 'string' },
              className: { type: 'string' },
              subjectId: { type: 'string' },
              subjectName: { type: 'string' },
              address: { type: 'string' },
              markedBy: { type: 'string' },
              markedAt: { type: 'string' },
              markingMethod: { type: 'string' },
              status: { type: 'string' },
              createdAt: { type: 'string' },
              updatedAt: { type: 'string' }
            }
          }
        },
        summary: {
          type: 'object',
          properties: {
            totalPresent: { type: 'number' },
            totalAbsent: { type: 'number' },
            totalLate: { type: 'number' },
            totalLeft: { type: 'number' },
            totalLeftEarly: { type: 'number' },
            totalLeftLately: { type: 'number' },
            attendanceRate: { type: 'number' }
          }
        }
      }
    }
  })
  @ApiResponse({ status: 400, description: 'Bad request - validation error' })
  @ApiResponse({ status: 404, description: 'Student not found or no records found' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async getStudentAttendanceByCard(
    @Param('cardId') cardId: string,
    @Query() queryDto: GetAttendanceByCardDto,
    @Req() request: Request & { user: any }
  ) {
    try {
      // Combine path parameter with query parameters
      const fullQueryDto: GetAttendanceByCardDto = {
        studentCardId: cardId,
        ...queryDto
      };

      // Validate date range if provided
      if (fullQueryDto.startDate && fullQueryDto.endDate) {
        const startDate = new Date(fullQueryDto.startDate);
        const endDate = new Date(fullQueryDto.endDate);
        
        if (startDate > endDate) {
          throw new HttpException(
            {
              success: false,
              message: 'Start date cannot be later than end date',
            },
            HttpStatus.BAD_REQUEST
          );
        }

        // Check if date range is not too large (e.g., max 1 year)
        const maxRangeDays = 365;
        const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
        
        if (daysDiff > maxRangeDays) {
          throw new HttpException(
            {
              success: false,
              message: `Date range cannot exceed ${maxRangeDays} days`,
            },
            HttpStatus.BAD_REQUEST
          );
        }
      }

      const result = await this.attendanceService.getAttendanceByCard(fullQueryDto);
      
      return result;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to retrieve student attendance records by card',
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get('institute/:instituteId')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: true,
    attendanceMarker: true,
    student: { allowSelfOnly: true }, // Students can access when filtering by their own studentId
    parent: { requireStudent: true } // Parents can access when filtering by their child's studentId
  })
  @ApiOperation({ 
    summary: 'Get all attendance records for an institute',
    description: 'Retrieve all attendance records for a specific institute. Date range limit: 5 days for all students, 30 days when filtering by specific studentId. Accessible by SUPERADMIN, Institute Admin, Teacher, Attendance Marker, Students (own data), or Parents (children data). Supports filtering by status and studentId.'
  })
  @ApiParam({ name: 'instituteId', description: 'Institute ID to filter attendance records' })
  @ApiResponse({ 
    status: 200, 
    description: 'Institute attendance records retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        instituteInfo: {
          type: 'object',
          properties: {
            instituteId: { type: 'string' },
            instituteName: { type: 'string' }
          }
        },
        pagination: {
          type: 'object',
          properties: {
            currentPage: { type: 'number' },
            totalPages: { type: 'number' },
            totalRecords: { type: 'number' },
            recordsPerPage: { type: 'number' },
            hasNextPage: { type: 'boolean' },
            hasPrevPage: { type: 'boolean' }
          }
        },
        dateRange: {
          type: 'object',
          properties: {
            startDate: { type: 'string' },
            endDate: { type: 'string' },
            totalDays: { type: 'number' }
          }
        },
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              attendanceId: { type: 'string' },
              studentId: { type: 'string' },
              studentName: { type: 'string' },
              classId: { type: 'string' },
              className: { type: 'string' },
              subjectId: { type: 'string' },
              subjectName: { type: 'string' },
              markedAt: { type: 'string' },
              status: { type: 'string' },
              markingMethod: { type: 'string' },
              markedBy: { type: 'string' }
            }
          }
        },
        summary: {
          type: 'object',
          properties: {
            totalPresent: { type: 'number' },
            totalAbsent: { type: 'number' },
            totalLate: { type: 'number' },
            totalLeft: { type: 'number' },
            totalLeftEarly: { type: 'number' },
            totalLeftLately: { type: 'number' },
            uniqueStudents: { type: 'number' },
            totalClasses: { type: 'number' },
            totalSubjects: { type: 'number' }
          }
        }
      }
    }
  })
  async getInstituteAttendance(
    @Param('instituteId') instituteId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 50,
    @Query('status') status?: string,
    @Query('studentId') studentId?: string
  ) {
    try {
      // Default to last 7 days if dates not provided
      if (!startDate || !endDate) {
        const now = new Date();
        const sevenDaysAgo = new Date(now);
        sevenDaysAgo.setDate(now.getDate() - 7);
        
        startDate = startDate || sevenDaysAgo.toISOString().split('T')[0];
        endDate = endDate || now.toISOString().split('T')[0];
      }

      // Validate date range: 30 days max when filtering by studentId, 7 days otherwise
      const start = new Date(startDate);
      const end = new Date(endDate);
      const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      
      const maxDays = studentId ? 30 : 7;
      if (daysDiff > maxDays) {
        throw new HttpException(
          {
            success: false,
            message: studentId 
              ? 'Date range cannot exceed 30 days when filtering by studentId'
              : 'Date range cannot exceed 7 days for institute-wide queries. Add studentId parameter to query up to 30 days.',
          },
          HttpStatus.BAD_REQUEST
        );
      }

      const result = await this.attendanceService.getInstituteAttendance({
        instituteId,
        startDate,
        endDate,
        page,
        limit,
        status,
        studentId
      });
      
      return result;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to retrieve institute attendance records',
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get('institute/:instituteId/class/:classId')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: true,
    attendanceMarker: true,
    student: { allowSelfOnly: true }, // Students can access when filtering by their own studentId
    parent: { requireStudent: true } // Parents can access when filtering by their child's studentId
  })
  @ApiOperation({ 
    summary: 'Get all attendance records for a specific class',
    description: 'Retrieve all attendance records for a specific class within an institute. Date range limit: 5 days for all students, 30 days when filtering by specific studentId. Accessible by SUPERADMIN, Institute Admin, Teacher, Attendance Marker, Students (own data), or Parents (children data). Supports filtering by status and studentId.'
  })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiParam({ name: 'classId', description: 'Class ID to filter attendance records' })
  @ApiResponse({ 
    status: 200, 
    description: 'Class attendance records retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        classInfo: {
          type: 'object',
          properties: {
            instituteId: { type: 'string' },
            instituteName: { type: 'string' },
            classId: { type: 'string' },
            className: { type: 'string' }
          }
        },
        pagination: {
          type: 'object',
          properties: {
            currentPage: { type: 'number' },
            totalPages: { type: 'number' },
            totalRecords: { type: 'number' },
            recordsPerPage: { type: 'number' },
            hasNextPage: { type: 'boolean' },
            hasPrevPage: { type: 'boolean' }
          }
        },
        dateRange: {
          type: 'object',
          properties: {
            startDate: { type: 'string' },
            endDate: { type: 'string' },
            totalDays: { type: 'number' }
          }
        },
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              attendanceId: { type: 'string' },
              studentId: { type: 'string' },
              studentName: { type: 'string' },
              subjectId: { type: 'string' },
              subjectName: { type: 'string' },
              markedAt: { type: 'string' },
              status: { type: 'string' },
              markingMethod: { type: 'string' },
              markedBy: { type: 'string' }
            }
          }
        },
        summary: {
          type: 'object',
          properties: {
            totalPresent: { type: 'number' },
            totalAbsent: { type: 'number' },
            totalLate: { type: 'number' },
            totalLeft: { type: 'number' },
            totalLeftEarly: { type: 'number' },
            totalLeftLately: { type: 'number' },
            uniqueStudents: { type: 'number' },
            totalSubjects: { type: 'number' }
          }
        }
      }
    }
  })
  async getClassAttendance(
    @Param('instituteId') instituteId: string,
    @Param('classId') classId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 50,
    @Query('status') status?: string,
    @Query('studentId') studentId?: string
  ) {
    try {
      // Validate required parameters
      if (!startDate || !endDate) {
        throw new HttpException(
          {
            success: false,
            message: 'startDate and endDate are required parameters',
          },
          HttpStatus.BAD_REQUEST
        );
      }

      // Validate date range: 31 days max
      const start = new Date(startDate);
      const end = new Date(endDate);
      const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      
      const maxDays = 31;
      if (daysDiff > maxDays) {
        throw new HttpException(
          {
            success: false,
            message: 'Date range cannot exceed 31 days for class-wide queries.',
          },
          HttpStatus.BAD_REQUEST
        );
      }

      const result = await this.attendanceService.getClassAttendance({
        instituteId,
        classId,
        startDate,
        endDate,
        page,
        limit,
        status,
        studentId
      });
      
      return result;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to retrieve class attendance records',
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // CLASS ATTENDANCE FROM INSTITUTE — new endpoints
  // ───────────────────────────────────────────────────────────────────────────

  @Get('institute/:instituteId/class/:classId/students-with-institute-status')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: true,
    attendanceMarker: true,
  })
  @ApiOperation({
    summary: 'Get class students with their institute-level attendance status',
    description:
      'Returns all active+verified students enrolled in a class along with their '
      + 'institute-level attendance (check-in) and any existing class-level attendance '
      + 'for the given date. Use this to decide who to bulk-mark present/absent.',
  })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiParam({ name: 'classId', description: 'Class ID' })
  @ApiResponse({
    status: 200,
    description: 'Student list with institute & class attendance snapshots',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        date: { type: 'string', example: '2026-04-10' },
        summary: {
          type: 'object',
          properties: {
            total: { type: 'number' },
            presentInInstitute: { type: 'number' },
            absentInInstitute: { type: 'number' },
            notMarkedInInstitute: { type: 'number' },
            alreadyMarkedInClass: { type: 'number' },
          },
        },
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              studentId: { type: 'string' },
              studentName: { type: 'string' },
              studentImageUrl: { type: 'string', nullable: true },
              instituteAttendance: {
                nullable: true,
                type: 'object',
                properties: {
                  statusCode: { type: 'number', description: '0=Absent,1=Present,2=Late,3=Left,4=LeftEarly,5=LeftLately' },
                  status: { type: 'string' },
                  date: { type: 'string' },
                  time: { type: 'string' },
                  timestamp: { type: 'string' },
                  remarks: { type: 'string', nullable: true },
                },
              },
              classAttendance: {
                nullable: true,
                type: 'object',
                properties: {
                  statusCode: { type: 'number' },
                  status: { type: 'string' },
                  date: { type: 'string' },
                  time: { type: 'string' },
                  timestamp: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async getClassStudentsWithInstituteStatus(
    @Param('instituteId') instituteId: string,
    @Param('classId') classId: string,
    @Query() query: GetClassStudentsInstituteAttendanceQueryDto,
    @Req() _req: Request,
  ) {
    try {
      return await this.attendanceService.getClassStudentsWithInstituteAttendance(
        instituteId,
        classId,
        query.date,
      );
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        { success: false, message: error.message || 'Failed to retrieve student institute attendance status' },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('institute/:instituteId/class/:classId/bulk-mark-from-institute')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: true,
    attendanceMarker: true,
  })
  @ApiOperation({
    summary: 'Bulk-mark class attendance derived from institute-level attendance',
    description:
      'Automatically marks class-level attendance for all enrolled students based on '
      + 'their institute (check-in) attendance status. Students present at the institute '
      + '(status ≠ absent) are marked PRESENT in the class; students with no institute '
      + 'attendance are marked ABSENT. Students who already have class attendance are '
      + 'skipped (idempotent). Control both actions with markPresentFromInstitute and '
      + 'markAbsentForUnmarked flags (both default to true).',
  })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiParam({ name: 'classId', description: 'Class ID' })
  @ApiResponse({
    status: 201,
    description: 'Class attendance bulk-marked successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        date: { type: 'string' },
        summary: {
          type: 'object',
          properties: {
            total: { type: 'number' },
            markedPresent: { type: 'number' },
            markedAbsent: { type: 'number' },
            skipped: { type: 'number' },
            failed: { type: 'number' },
          },
        },
        results: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              studentId: { type: 'string' },
              studentName: { type: 'string' },
              action: { type: 'string', enum: ['marked_present', 'marked_absent', 'skipped_already_marked', 'skipped_no_action'] },
              classStatus: { type: 'string', nullable: true },
              success: { type: 'boolean' },
              error: { type: 'string' },
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async bulkMarkClassFromInstituteAttendance(
    @Param('instituteId') instituteId: string,
    @Param('classId') classId: string,
    @Body() dto: BulkMarkClassFromInstituteDto,
    @Req() request: Request & { user: any },
  ) {
    try {
      const markedBy = request.user?.s || request.user?.subject || request.user?.sub || request.user?.id;
      return await this.attendanceService.bulkMarkClassAttendanceFromInstituteAttendance(
        instituteId,
        classId,
        dto,
        markedBy,
      );
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        { success: false, message: error.message || 'Failed to bulk-mark class attendance' },
        error.message?.includes('not found') ? HttpStatus.NOT_FOUND : HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // SINGLE STUDENT STATUS UPDATE — inline status change
  // ───────────────────────────────────────────────────────────────────────────

  @Patch('institute/:instituteId/class/:classId/student/:studentId/status')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: true,
    attendanceMarker: true,
  })
  @ApiOperation({
    summary: 'Update a single student attendance status for today',
    description: 'Change the attendance status of an already-marked student. Only works for today\'s date.',
  })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiParam({ name: 'classId', description: 'Class ID' })
  @ApiParam({ name: 'studentId', description: 'Student user ID' })
  @ApiResponse({ status: 200, description: 'Status updated successfully' })
  @ApiResponse({ status: 400, description: 'Bad request — no existing record or invalid status' })
  async updateStudentAttendanceStatus(
    @Param('instituteId') instituteId: string,
    @Param('classId') classId: string,
    @Param('studentId') studentId: string,
    @Body() body: { status: string; subjectId?: string; instituteName?: string; className?: string; subjectName?: string },
  ) {
    try {
      return await this.attendanceService.updateStudentAttendanceStatus(
        instituteId,
        classId,
        studentId,
        body.status as any,
        body.subjectId,
        body.instituteName,
        body.className,
        body.subjectName,
      );
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        { success: false, message: error.message || 'Failed to update student attendance status' },
        error.message?.includes('not found') ? HttpStatus.BAD_REQUEST : HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // SUBJECT ATTENDANCE FROM CLASS — new endpoints
  // ───────────────────────────────────────────────────────────────────────────

  @Get('institute/:instituteId/class/:classId/subject/:subjectId/students-with-class-status')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: true,
    attendanceMarker: true,
  })
  @ApiOperation({
    summary: 'Get subject students with their class-level attendance status',
    description:
      'Returns all active+verified students enrolled in a subject along with their '
      + 'class-level attendance and any existing subject-level attendance '
      + 'for the given date. Use this to decide who to bulk-mark present/absent at subject level.',
  })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiParam({ name: 'classId', description: 'Class ID' })
  @ApiParam({ name: 'subjectId', description: 'Subject ID' })
  @ApiResponse({
    status: 200,
    description: 'Student list with class & subject attendance snapshots',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        date: { type: 'string', example: '2026-04-10' },
        summary: {
          type: 'object',
          properties: {
            total: { type: 'number' },
            presentInClass: { type: 'number' },
            absentInClass: { type: 'number' },
            notMarkedInClass: { type: 'number' },
            alreadyMarkedInSubject: { type: 'number' },
          },
        },
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              studentId: { type: 'string' },
              studentName: { type: 'string' },
              studentImageUrl: { type: 'string', nullable: true },
              classAttendance: {
                nullable: true,
                type: 'object',
                properties: {
                  statusCode: { type: 'number' },
                  status: { type: 'string' },
                  date: { type: 'string' },
                  time: { type: 'string' },
                  timestamp: { type: 'string' },
                  remarks: { type: 'string', nullable: true },
                },
              },
              subjectAttendance: {
                nullable: true,
                type: 'object',
                properties: {
                  statusCode: { type: 'number' },
                  status: { type: 'string' },
                  date: { type: 'string' },
                  time: { type: 'string' },
                  timestamp: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async getSubjectStudentsWithClassStatus(
    @Param('instituteId') instituteId: string,
    @Param('classId') classId: string,
    @Param('subjectId') subjectId: string,
    @Query() query: GetSubjectStudentsClassAttendanceQueryDto,
    @Req() _req: Request,
  ) {
    try {
      return await this.attendanceService.getSubjectStudentsWithClassAttendance(
        instituteId,
        classId,
        subjectId,
        query.date,
      );
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        { success: false, message: error.message || 'Failed to retrieve subject student class attendance status' },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('institute/:instituteId/class/:classId/subject/:subjectId/bulk-mark-from-class')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: true,
    attendanceMarker: true,
  })
  @ApiOperation({
    summary: 'Bulk-mark subject attendance derived from class-level attendance',
    description:
      'Automatically marks subject-level attendance for all enrolled students based on '
      + 'their class attendance status. Students present at class level '
      + '(status ≠ absent) are marked PRESENT in the subject; students with no class '
      + 'attendance are marked ABSENT. Students who already have subject attendance are '
      + 'skipped (idempotent). Control both actions with markPresentFromClass and '
      + 'markAbsentForUnmarked flags (both default to true).',
  })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiParam({ name: 'classId', description: 'Class ID' })
  @ApiParam({ name: 'subjectId', description: 'Subject ID' })
  @ApiResponse({
    status: 201,
    description: 'Subject attendance bulk-marked successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        date: { type: 'string' },
        summary: {
          type: 'object',
          properties: {
            total: { type: 'number' },
            markedPresent: { type: 'number' },
            markedAbsent: { type: 'number' },
            skipped: { type: 'number' },
            failed: { type: 'number' },
          },
        },
        results: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              studentId: { type: 'string' },
              studentName: { type: 'string' },
              action: { type: 'string', enum: ['marked_present', 'marked_absent', 'skipped_already_marked', 'skipped_no_action'] },
              subjectStatus: { type: 'string', nullable: true },
              success: { type: 'boolean' },
              error: { type: 'string' },
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async bulkMarkSubjectFromClassAttendance(
    @Param('instituteId') instituteId: string,
    @Param('classId') classId: string,
    @Param('subjectId') subjectId: string,
    @Body() dto: BulkMarkSubjectFromClassDto,
    @Req() request: Request & { user: any },
  ) {
    try {
      const markedBy = request.user?.s || request.user?.subject || request.user?.sub || request.user?.id;
      return await this.attendanceService.bulkMarkSubjectAttendanceFromClassAttendance(
        instituteId,
        classId,
        subjectId,
        dto,
        markedBy,
      );
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        { success: false, message: error.message || 'Failed to bulk-mark subject attendance' },
        error.message?.includes('not found') ? HttpStatus.NOT_FOUND : HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('institute/:instituteId/class/:classId/subject/:subjectId')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: true,
    attendanceMarker: true,
    student: { allowSelfOnly: true }, // Students can access when filtering by their own studentId
    parent: { requireStudent: true } // Parents can access when filtering by their child's studentId
  })
  @ApiOperation({ 
    summary: 'Get all attendance records for a specific subject',
    description: 'Retrieve all attendance records for a specific subject within a class and institute. Date range limit: 5 days for all students, 30 days when filtering by specific studentId. Accessible by SUPERADMIN, Institute Admin, Teacher, Attendance Marker, Students (own data), or Parents (children data). Supports filtering by status and studentId.'
  })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiParam({ name: 'classId', description: 'Class ID' })
  @ApiParam({ name: 'subjectId', description: 'Subject ID to filter attendance records' })
  @ApiResponse({ 
    status: 200, 
    description: 'Subject attendance records retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        subjectInfo: {
          type: 'object',
          properties: {
            instituteId: { type: 'string' },
            instituteName: { type: 'string' },
            classId: { type: 'string' },
            className: { type: 'string' },
            subjectId: { type: 'string' },
            subjectName: { type: 'string' }
          }
        },
        pagination: {
          type: 'object',
          properties: {
            currentPage: { type: 'number' },
            totalPages: { type: 'number' },
            totalRecords: { type: 'number' },
            recordsPerPage: { type: 'number' },
            hasNextPage: { type: 'boolean' },
            hasPrevPage: { type: 'boolean' }
          }
        },
        dateRange: {
          type: 'object',
          properties: {
            startDate: { type: 'string' },
            endDate: { type: 'string' },
            totalDays: { type: 'number' }
          }
        },
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              attendanceId: { type: 'string' },
              studentId: { type: 'string' },
              studentName: { type: 'string' },
              markedAt: { type: 'string' },
              status: { type: 'string' },
              markingMethod: { type: 'string' },
              markedBy: { type: 'string' }
            }
          }
        },
        summary: {
          type: 'object',
          properties: {
            totalPresent: { type: 'number' },
            totalAbsent: { type: 'number' },
            totalLate: { type: 'number' },
            totalLeft: { type: 'number' },
            totalLeftEarly: { type: 'number' },
            totalLeftLately: { type: 'number' },
            uniqueStudents: { type: 'number' }
          }
        }
      }
    }
  })
  async getSubjectAttendance(
    @Param('instituteId') instituteId: string,
    @Param('classId') classId: string,
    @Param('subjectId') subjectId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 50,
    @Query('status') status?: string,
    @Query('studentId') studentId?: string
  ) {
    try {
      // Validate required parameters
      if (!startDate || !endDate) {
        throw new HttpException(
          {
            success: false,
            message: 'startDate and endDate are required parameters',
          },
          HttpStatus.BAD_REQUEST
        );
      }

      // Validate date range: 31 days max
      const start = new Date(startDate);
      const end = new Date(endDate);
      const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      
      const maxDays = 31;
      if (daysDiff > maxDays) {
        throw new HttpException(
          {
            success: false,
            message: 'Date range cannot exceed 31 days for subject-wide queries.',
          },
          HttpStatus.BAD_REQUEST
        );
      }

      const result = await this.attendanceService.getSubjectAttendance({
        instituteId,
        classId,
        subjectId,
        startDate,
        endDate,
        page,
        limit,
        status,
        studentId
      });
      
      return result;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to retrieve subject attendance records',
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  CLASS-SCOPED STUDENT ATTENDANCE
  // ═══════════════════════════════════════════════════════════════════

  @Get('institute/:instituteId/class/:classId/student/:studentId')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: true,
    attendanceMarker: true,
    student: { allowSelfOnly: true },
    parent: { requireStudent: true }
  })
  @ApiOperation({
    summary: 'Get student attendance for a specific class',
    description: 'Retrieve attendance records for a student filtered by class. Supports date range and pagination.',
  })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiParam({ name: 'classId', description: 'Class ID' })
  @ApiParam({ name: 'studentId', description: 'Student user ID' })
  @ApiResponse({ status: 200, description: 'Class-scoped student attendance retrieved successfully' })
  async getClassStudentAttendance(
    @Param('instituteId') instituteId: string,
    @Param('classId') classId: string,
    @Param('studentId') studentId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 50,
    @Query('status') status?: string
  ) {
    try {
      if (!startDate || !endDate) {
        throw new HttpException(
          { success: false, message: 'startDate and endDate are required parameters' },
          HttpStatus.BAD_REQUEST
        );
      }

      const start = new Date(startDate);
      const end = new Date(endDate);
      const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      if (daysDiff > 365) {
        throw new HttpException(
          { success: false, message: 'Date range cannot exceed 365 days' },
          HttpStatus.BAD_REQUEST
        );
      }

      const result = await this.attendanceService.getClassAttendance({
        instituteId,
        classId,
        startDate,
        endDate,
        page,
        limit,
        status,
        studentId
      });

      return result;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        { success: false, message: error.message || 'Failed to retrieve class student attendance' },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  SUBJECT-SCOPED STUDENT ATTENDANCE
  // ═══════════════════════════════════════════════════════════════════

  @Get('institute/:instituteId/class/:classId/subject/:subjectId/student/:studentId')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: true,
    attendanceMarker: true,
    student: { allowSelfOnly: true },
    parent: { requireStudent: true }
  })
  @ApiOperation({
    summary: 'Get student attendance for a specific subject',
    description: 'Retrieve attendance records for a student filtered by class and subject. Supports date range and pagination.',
  })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiParam({ name: 'classId', description: 'Class ID' })
  @ApiParam({ name: 'subjectId', description: 'Subject ID' })
  @ApiParam({ name: 'studentId', description: 'Student user ID' })
  @ApiResponse({ status: 200, description: 'Subject-scoped student attendance retrieved successfully' })
  async getSubjectStudentAttendance(
    @Param('instituteId') instituteId: string,
    @Param('classId') classId: string,
    @Param('subjectId') subjectId: string,
    @Param('studentId') studentId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 50,
    @Query('status') status?: string
  ) {
    try {
      if (!startDate || !endDate) {
        throw new HttpException(
          { success: false, message: 'startDate and endDate are required parameters' },
          HttpStatus.BAD_REQUEST
        );
      }

      const start = new Date(startDate);
      const end = new Date(endDate);
      const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      if (daysDiff > 365) {
        throw new HttpException(
          { success: false, message: 'Date range cannot exceed 365 days' },
          HttpStatus.BAD_REQUEST
        );
      }

      const result = await this.attendanceService.getSubjectAttendance({
        instituteId,
        classId,
        subjectId,
        startDate,
        endDate,
        page,
        limit,
        status,
        studentId
      });

      return result;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        { success: false, message: error.message || 'Failed to retrieve subject student attendance' },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  CLASS-SCOPED CARD USER LOOKUP
  // ═══════════════════════════════════════════════════════════════════

  @Get('institute/:instituteId/class/:classId/card-user')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: true,
    attendanceMarker: true
  })
  @ApiOperation({
    summary: 'Get institute user by card ID (class context)',
    description: 'Fetch institute user details by instituteCardId with class context. Returns the same data as the institute-level card-user lookup.',
  })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiParam({ name: 'classId', description: 'Class ID (context)' })
  @ApiResponse({ status: 200, description: 'Institute user retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Institute user not found' })
  async getClassCardUser(
    @Param('instituteId') instituteId: string,
    @Param('classId') classId: string,
    @Query('instituteCardId') instituteCardId: string
  ): Promise<any> {
    try {
      if (!instituteCardId) {
        throw new HttpException(
          { success: false, message: 'instituteCardId query parameter is required' },
          HttpStatus.BAD_REQUEST
        );
      }
      const user = await this.attendanceService.getInstituteUserByCardId({ instituteCardId, instituteId });
      return {
        success: true,
        message: 'Institute user retrieved successfully',
        classId,
        data: user
      };
    } catch (error) {
      throw new HttpException(
        { success: false, message: error.message || 'Failed to retrieve institute user' },
        error.message?.includes('not found') ? HttpStatus.NOT_FOUND : HttpStatus.BAD_REQUEST
      );
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  SUBJECT-SCOPED CARD USER LOOKUP
  // ═══════════════════════════════════════════════════════════════════

  @Get('institute/:instituteId/class/:classId/subject/:subjectId/card-user')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: true,
    attendanceMarker: true
  })
  @ApiOperation({
    summary: 'Get institute user by card ID (subject context)',
    description: 'Fetch institute user details by instituteCardId with class and subject context.',
  })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiParam({ name: 'classId', description: 'Class ID (context)' })
  @ApiParam({ name: 'subjectId', description: 'Subject ID (context)' })
  @ApiResponse({ status: 200, description: 'Institute user retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Institute user not found' })
  async getSubjectCardUser(
    @Param('instituteId') instituteId: string,
    @Param('classId') classId: string,
    @Param('subjectId') subjectId: string,
    @Query('instituteCardId') instituteCardId: string
  ): Promise<any> {
    try {
      if (!instituteCardId) {
        throw new HttpException(
          { success: false, message: 'instituteCardId query parameter is required' },
          HttpStatus.BAD_REQUEST
        );
      }
      const user = await this.attendanceService.getInstituteUserByCardId({ instituteCardId, instituteId });
      return {
        success: true,
        message: 'Institute user retrieved successfully',
        classId,
        subjectId,
        data: user
      };
    } catch (error) {
      throw new HttpException(
        { success: false, message: error.message || 'Failed to retrieve institute user' },
        error.message?.includes('not found') ? HttpStatus.NOT_FOUND : HttpStatus.BAD_REQUEST
      );
    }
  }

  @Get('institute-card-user')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: true,
    attendanceMarker: true
  })
  @ApiOperation({ 
    summary: 'Get institute user by card ID',
    description: 'Fetch institute user details by instituteCardId. Returns user name, image URL (institute verified or global), and verification status. Accessible by SUPERADMIN, Institute Admin, Teacher, or Attendance Marker.'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Institute user retrieved successfully',
    type: InstituteCardUserResponseDto
  })
  @ApiResponse({ status: 400, description: 'Bad request - missing parameters' })
  @ApiResponse({ status: 401, description: 'Unauthorized - invalid JWT token' })
  @ApiResponse({ status: 403, description: 'Forbidden - insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Institute user not found' })
  async getInstituteUserByCardId(
    @Query() dto: GetInstituteUserByCardDto
  ): Promise<{ success: boolean; message: string; data: InstituteCardUserResponseDto }> {
    try {
      const user = await this.attendanceService.getInstituteUserByCardId(dto);
      return {
        success: true,
        message: 'Institute user retrieved successfully',
        data: user
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to retrieve institute user',
        },
        error.message?.includes('not found') ? HttpStatus.NOT_FOUND : HttpStatus.BAD_REQUEST
      );
    }
  }

  @Post('mark-by-institute-card')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: true,
    attendanceMarker: true
  })
  @ApiOperation({ 
    summary: 'Mark attendance by institute card ID',
    description: `Mark attendance using institute card ID. 
    
**Features:**
- Looks up user via institute_user table by instituteCardId
- Gets user name from users table JOIN (secure - from DB, not input)
- Applies smart image URL logic:
  * If imageVerificationStatus is VERIFIED → uses instituteUserImageUrl
  * Otherwise → uses global user.imageUrl fallback
- Marks attendance with same notifications as main attendance
- Returns detailed response with image verification info

**Access:** SUPERADMIN, Institute Admin, Teacher, or Attendance Marker`
  })
  @ApiResponse({ 
    status: 201, 
    description: 'Attendance marked successfully using institute card',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'Attendance marked successfully using institute card' },
        data: {
          type: 'object',
          properties: {
            studentId: { type: 'string', example: '123' },
            studentName: { type: 'string', example: 'John Doe' },
            instituteCardId: { type: 'string', example: 'CARD001' },
            userIdByInstitute: { type: 'string', example: 'STU2024001' },
            imageUrl: { type: 'string', example: 'https://storage.googleapis.com/image.jpg' },
            isInstituteImage: { type: 'boolean', example: true },
            imageVerificationStatus: { type: 'string', example: 'VERIFIED' },
            status: { type: 'string', example: 'PRESENT' },
            markedAt: { type: 'string', example: '2025-10-19T10:30:00.000Z' },
            location: { type: 'string', example: 'Suraksha Learning Academy - Grade 10A - Mathematics' }
          }
        }
      }
    }
  })
  @ApiResponse({ status: 400, description: 'Bad request - validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized - invalid JWT token' })
  @ApiResponse({ status: 403, description: 'Forbidden - insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Institute user not found with card ID' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async markAttendanceByInstituteCard(
    @Body() attendanceData: MarkAttendanceByInstituteCardDto,
    @Req() request: Request & { user: any }
  ): Promise<any> {
    try {
      const user = request.user;
      // Support JWT v2 format (s) and legacy formats (subject, sub, id)
      const markedByUser = user.s || user.subject || user.sub || user.id;

      const result = await this.attendanceService.markAttendanceByInstituteCard(
        attendanceData, 
        markedByUser
      );
      
      return result;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to mark attendance by institute card',
        },
        error.message?.includes('not found') ? HttpStatus.NOT_FOUND : HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // MY ATTENDANCE HISTORY — returns the calling user's own attendance, enriched
  // ─────────────────────────────────────────────────────────────────────────────

  @Get('my-history')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Get my attendance history (self-service)',
    description: `Returns the calling user's own attendance records from DynamoDB across 
all institutes they belong to. If user is a parent and \`child=true\` is passed, also includes 
all children's attendance records. Each record is enriched with live institute name, 
logo URL, and class name from the database. Supports date range filtering, 
pagination, status filter, and optional single-institute filter.\n\n
**Default date range**: last 30 days.\n
**Auth**: JWT only — no additional role required.\n
**Parent with children**: Pass \`child=true\` to include all children's attendance in one request.`,
  })
  @ApiResponse({ status: 200, description: 'Attendance history', type: MyAttendanceResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getMyAttendance(
    @Query() query: MyAttendanceQueryDto,
    @Req() req: any
  ): Promise<MyAttendanceResponseDto> {
    try {
      // Extract user ID from JWT (support both JWT v2 short form and legacy)
      const userId = req.user?.s || req.user?.subject || req.user?.sub || req.user?.id;
      if (!userId) {
        throw new HttpException({ success: false, message: 'User ID not found in token' }, HttpStatus.UNAUTHORIZED);
      }
      // Extract children IDs from JWT if present (for parent accounts)
      const childrenIds = req.user?.c || [];
      return await this.attendanceService.getMyAttendance(String(userId), query, childrenIds);
    } catch (error) {
      throw error;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Attendance Detail — opened from notification deep-link
  // ─────────────────────────────────────────────────────────────────────────

  // ═══════════════════════════════════════════════════════════════════════
  // SCOPE-EXPLICIT MARK ENDPOINTS
  // URL path params enforce the scope; they always override body values.
  //
  //  INSTITUTE level  → eventId auto-linked to default REGULAR_CLASS event
  //  CLASS level      → eventId is always null  (class belongs to institute)
  //  SUBJECT level    → eventId is always null  (subject belongs to class)
  //
  // Provided in three marking modes for each scope:
  //   /mark                  plain MarkAttendanceDto
  //   /mark-bulk             BulkAttendanceDto
  //   /mark-by-card          MarkAttendanceByCardDto (QR / NFC global card)
  //   /mark-bulk-by-card     BulkCardAttendanceDto
  //   /mark-by-institute-card MarkAttendanceByInstituteCardDto
  // ═══════════════════════════════════════════════════════════════════════

  private _markedBy(req: any): string {
    return req.user?.s || req.user?.subject || req.user?.sub || req.user?.id;
  }
  private _err(e: any, msg?: string): never {
    if (e instanceof HttpException) throw e;
    throw new HttpException({ success: false, message: e?.message || msg || 'Internal error' },
      e?.message?.includes('not found') ? HttpStatus.NOT_FOUND : HttpStatus.INTERNAL_SERVER_ERROR);
  }

  // ── INSTITUTE LEVEL ────────────────────────────────────────────────────

  @Post('institute/:instituteId/mark')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true, teacher: true, attendanceMarker: true })
  @ApiOperation({ summary: '[Institute] Mark single attendance', description: 'Single attendance at institute scope (no class / subject). eventId auto-linked to default REGULAR_CLASS event. `instituteId` from URL overrides body.' })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  async markInstituteAttendance(@Param('instituteId') instituteId: string, @Body() body: MarkAttendanceDto, @Req() req: any): Promise<any> {
    body.instituteId = instituteId; body.classId = undefined; body.subjectId = undefined;
    try { return await this.attendanceService.markAttendance(body, this._markedBy(req)); }
    catch (e) { this._err(e); }
  }

  @Post('institute/:instituteId/mark-bulk')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true, teacher: true, attendanceMarker: true })
  @ApiOperation({ summary: '[Institute] Mark bulk attendance', description: 'Bulk attendance at institute scope. eventId auto-linked to default REGULAR_CLASS event.' })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  async markInstituteAttendanceBulk(@Param('instituteId') instituteId: string, @Body() body: BulkAttendanceDto, @Req() req: any): Promise<any> {
    body.instituteId = instituteId; body.classId = undefined; body.subjectId = undefined;
    const max = parseInt(process.env.MAX_BULK_ATTENDANCE_SIZE || '100');
    if (body.students.length > max) throw new HttpException({ success: false, message: `Max bulk size is ${max}` }, HttpStatus.BAD_REQUEST);
    try { return await this.attendanceService.markBulkAttendance(body, this._markedBy(req)); }
    catch (e) { this._err(e); }
  }

  @Post('institute/:instituteId/mark-by-card')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true, teacher: true, attendanceMarker: true })
  @ApiOperation({ summary: '[Institute] Mark attendance by card', description: 'Card single attendance at institute scope.' })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  async markInstituteByCard(@Param('instituteId') instituteId: string, @Body() body: MarkAttendanceByCardDto, @Req() req: any): Promise<any> {
    body.instituteId = instituteId; body.classId = undefined; body.subjectId = undefined;
    try { return await this.attendanceService.markAttendanceByCard(body, this._markedBy(req)); }
    catch (e) { this._err(e); }
  }

  @Post('institute/:instituteId/mark-bulk-by-card')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true, teacher: true, attendanceMarker: true })
  @ApiOperation({ summary: '[Institute] Mark bulk attendance by card', description: 'Card bulk attendance at institute scope.' })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  async markInstituteByCardBulk(@Param('instituteId') instituteId: string, @Body() body: BulkCardAttendanceDto, @Req() req: any): Promise<any> {
    body.instituteId = instituteId; body.classId = undefined; body.subjectId = undefined;
    try { return await this.attendanceService.markBulkAttendanceByCard(body, this._markedBy(req)); }
    catch (e) { this._err(e); }
  }

  @Post('institute/:instituteId/mark-by-institute-card')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true, teacher: true, attendanceMarker: true })
  @ApiOperation({ summary: '[Institute] Mark attendance by institute card', description: 'Institute-card attendance at institute scope.' })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  async markInstituteByInstituteCard(@Param('instituteId') instituteId: string, @Body() body: MarkAttendanceByInstituteCardDto, @Req() req: any): Promise<any> {
    body.instituteId = instituteId; body.classId = undefined; body.subjectId = undefined;
    try { return await this.attendanceService.markAttendanceByInstituteCard(body, this._markedBy(req)); }
    catch (e) { this._err(e); }
  }

  // ── CLASS LEVEL ────────────────────────────────────────────────────────

  @Post('institute/:instituteId/class/:classId/mark')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true, teacher: true, attendanceMarker: true })
  @ApiOperation({ summary: '[Class] Mark single attendance', description: 'Single attendance locked to a class. eventId is always null — events are institute-level, not class-level.' })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiParam({ name: 'classId', description: 'Class ID' })
  async markClassAttendance(@Param('instituteId') instituteId: string, @Param('classId') classId: string, @Body() body: MarkAttendanceDto, @Req() req: any): Promise<any> {
    body.instituteId = instituteId; body.classId = classId; body.subjectId = undefined; delete (body as any).eventId;
    try { return await this.attendanceService.markAttendance(body, this._markedBy(req)); }
    catch (e) { this._err(e); }
  }

  @Post('institute/:instituteId/class/:classId/mark-bulk')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true, teacher: true, attendanceMarker: true })
  @ApiOperation({ summary: '[Class] Mark bulk attendance', description: 'Bulk attendance locked to a class. eventId is always null.' })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiParam({ name: 'classId', description: 'Class ID' })
  async markClassAttendanceBulk(@Param('instituteId') instituteId: string, @Param('classId') classId: string, @Body() body: BulkAttendanceDto, @Req() req: any): Promise<any> {
    body.instituteId = instituteId; body.classId = classId; body.subjectId = undefined; delete (body as any).eventId;
    const max = parseInt(process.env.MAX_BULK_ATTENDANCE_SIZE || '100');
    if (body.students.length > max) throw new HttpException({ success: false, message: `Max bulk size is ${max}` }, HttpStatus.BAD_REQUEST);
    try { return await this.attendanceService.markBulkAttendance(body, this._markedBy(req)); }
    catch (e) { this._err(e); }
  }

  @Post('institute/:instituteId/class/:classId/mark-by-card')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true, teacher: true, attendanceMarker: true })
  @ApiOperation({ summary: '[Class] Mark attendance by card', description: 'Card single attendance locked to a class. eventId is always null.' })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiParam({ name: 'classId', description: 'Class ID' })
  async markClassByCard(@Param('instituteId') instituteId: string, @Param('classId') classId: string, @Body() body: MarkAttendanceByCardDto, @Req() req: any): Promise<any> {
    body.instituteId = instituteId; body.classId = classId; body.subjectId = undefined;
    try { return await this.attendanceService.markAttendanceByCard(body, this._markedBy(req)); }
    catch (e) { this._err(e); }
  }

  @Post('institute/:instituteId/class/:classId/mark-bulk-by-card')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true, teacher: true, attendanceMarker: true })
  @ApiOperation({ summary: '[Class] Mark bulk attendance by card', description: 'Card bulk attendance locked to a class. eventId is always null.' })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiParam({ name: 'classId', description: 'Class ID' })
  async markClassByCardBulk(@Param('instituteId') instituteId: string, @Param('classId') classId: string, @Body() body: BulkCardAttendanceDto, @Req() req: any): Promise<any> {
    body.instituteId = instituteId; body.classId = classId; body.subjectId = undefined;
    try { return await this.attendanceService.markBulkAttendanceByCard(body, this._markedBy(req)); }
    catch (e) { this._err(e); }
  }

  @Post('institute/:instituteId/class/:classId/mark-by-institute-card')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true, teacher: true, attendanceMarker: true })
  @ApiOperation({ summary: '[Class] Mark attendance by institute card', description: 'Institute-card attendance locked to a class. eventId is always null.' })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiParam({ name: 'classId', description: 'Class ID' })
  async markClassByInstituteCard(@Param('instituteId') instituteId: string, @Param('classId') classId: string, @Body() body: MarkAttendanceByInstituteCardDto, @Req() req: any): Promise<any> {
    body.instituteId = instituteId; body.classId = classId; body.subjectId = undefined;
    try { return await this.attendanceService.markAttendanceByInstituteCard(body, this._markedBy(req)); }
    catch (e) { this._err(e); }
  }

  // ── SUBJECT LEVEL ──────────────────────────────────────────────────────

  @Post('institute/:instituteId/class/:classId/subject/:subjectId/mark')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true, teacher: true, attendanceMarker: true })
  @ApiOperation({ summary: '[Subject] Mark single attendance', description: 'Single attendance locked to a class + subject. eventId is always null — events are institute-level, not subject-level.' })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiParam({ name: 'classId', description: 'Class ID' })
  @ApiParam({ name: 'subjectId', description: 'Subject ID' })
  async markSubjectAttendance(@Param('instituteId') instituteId: string, @Param('classId') classId: string, @Param('subjectId') subjectId: string, @Body() body: MarkAttendanceDto, @Req() req: any): Promise<any> {
    body.instituteId = instituteId; body.classId = classId; body.subjectId = subjectId; delete (body as any).eventId;
    try { return await this.attendanceService.markAttendance(body, this._markedBy(req)); }
    catch (e) { this._err(e); }
  }

  @Post('institute/:instituteId/class/:classId/subject/:subjectId/mark-bulk')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true, teacher: true, attendanceMarker: true })
  @ApiOperation({ summary: '[Subject] Mark bulk attendance', description: 'Bulk attendance locked to a class + subject. eventId is always null.' })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiParam({ name: 'classId', description: 'Class ID' })
  @ApiParam({ name: 'subjectId', description: 'Subject ID' })
  async markSubjectAttendanceBulk(@Param('instituteId') instituteId: string, @Param('classId') classId: string, @Param('subjectId') subjectId: string, @Body() body: BulkAttendanceDto, @Req() req: any): Promise<any> {
    body.instituteId = instituteId; body.classId = classId; body.subjectId = subjectId; delete (body as any).eventId;
    const max = parseInt(process.env.MAX_BULK_ATTENDANCE_SIZE || '100');
    if (body.students.length > max) throw new HttpException({ success: false, message: `Max bulk size is ${max}` }, HttpStatus.BAD_REQUEST);
    try { return await this.attendanceService.markBulkAttendance(body, this._markedBy(req)); }
    catch (e) { this._err(e); }
  }

  @Post('institute/:instituteId/class/:classId/subject/:subjectId/mark-by-card')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true, teacher: true, attendanceMarker: true })
  @ApiOperation({ summary: '[Subject] Mark attendance by card', description: 'Card single attendance locked to class + subject. eventId is always null.' })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiParam({ name: 'classId', description: 'Class ID' })
  @ApiParam({ name: 'subjectId', description: 'Subject ID' })
  async markSubjectByCard(@Param('instituteId') instituteId: string, @Param('classId') classId: string, @Param('subjectId') subjectId: string, @Body() body: MarkAttendanceByCardDto, @Req() req: any): Promise<any> {
    body.instituteId = instituteId; body.classId = classId; body.subjectId = subjectId;
    try { return await this.attendanceService.markAttendanceByCard(body, this._markedBy(req)); }
    catch (e) { this._err(e); }
  }

  @Post('institute/:instituteId/class/:classId/subject/:subjectId/mark-bulk-by-card')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true, teacher: true, attendanceMarker: true })
  @ApiOperation({ summary: '[Subject] Mark bulk attendance by card', description: 'Card bulk attendance locked to class + subject. eventId is always null.' })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiParam({ name: 'classId', description: 'Class ID' })
  @ApiParam({ name: 'subjectId', description: 'Subject ID' })
  async markSubjectByCardBulk(@Param('instituteId') instituteId: string, @Param('classId') classId: string, @Param('subjectId') subjectId: string, @Body() body: BulkCardAttendanceDto, @Req() req: any): Promise<any> {
    body.instituteId = instituteId; body.classId = classId; body.subjectId = subjectId;
    try { return await this.attendanceService.markBulkAttendanceByCard(body, this._markedBy(req)); }
    catch (e) { this._err(e); }
  }

  @Post('institute/:instituteId/class/:classId/subject/:subjectId/mark-by-institute-card')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true, teacher: true, attendanceMarker: true })
  @ApiOperation({ summary: '[Subject] Mark attendance by institute card', description: 'Institute-card attendance locked to class + subject. eventId is always null.' })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiParam({ name: 'classId', description: 'Class ID' })
  @ApiParam({ name: 'subjectId', description: 'Subject ID' })
  async markSubjectByInstituteCard(@Param('instituteId') instituteId: string, @Param('classId') classId: string, @Param('subjectId') subjectId: string, @Body() body: MarkAttendanceByInstituteCardDto, @Req() req: any): Promise<any> {
    body.instituteId = instituteId; body.classId = classId; body.subjectId = subjectId;
    try { return await this.attendanceService.markAttendanceByInstituteCard(body, this._markedBy(req)); }
    catch (e) { this._err(e); }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MONTHLY ATTENDANCE COUNT ENDPOINTS
  // ─────────────────────────────────────────────────────────────────────────

  @Get('institute/:instituteId/monthly-count')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: true,
    attendanceMarker: true,
  })
  @ApiOperation({
    summary: 'Get institute monthly attendance count',
    description: 'Returns aggregated attendance counts (present, absent, late, left, leftEarly, leftLate) for an entire institute for a given month.',
  })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiResponse({ status: 200, description: 'Monthly attendance counts retrieved' })
  async getInstituteMonthlyCount(
    @Param('instituteId') instituteId: string,
    @Query('year') year: string,
    @Query('month') month: string,
  ): Promise<any> {
    const y = parseInt(year, 10);
    const m = parseInt(month, 10);
    if (!y || !m || m < 1 || m > 12) {
      throw new HttpException(
        { success: false, message: 'Valid year and month (1-12) query parameters are required' },
        HttpStatus.BAD_REQUEST,
      );
    }
    try {
      return await this.attendanceService.getInstituteMonthlyCount(instituteId, y, m);
    } catch (e) { this._err(e, 'Failed to get institute monthly attendance count'); }
  }

  @Get('institute/:instituteId/class/:classId/monthly-count')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: true,
    attendanceMarker: true,
  })
  @ApiOperation({
    summary: 'Get class monthly attendance count',
    description: 'Returns aggregated attendance counts (present, absent, late, left, leftEarly, leftLate) for a specific class within an institute for a given month.',
  })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiParam({ name: 'classId', description: 'Class ID' })
  @ApiResponse({ status: 200, description: 'Monthly class attendance counts retrieved' })
  async getClassMonthlyCount(
    @Param('instituteId') instituteId: string,
    @Param('classId') classId: string,
    @Query('year') year: string,
    @Query('month') month: string,
  ): Promise<any> {
    const y = parseInt(year, 10);
    const m = parseInt(month, 10);
    if (!y || !m || m < 1 || m > 12) {
      throw new HttpException(
        { success: false, message: 'Valid year and month (1-12) query parameters are required' },
        HttpStatus.BAD_REQUEST,
      );
    }
    try {
      return await this.attendanceService.getClassMonthlyCount(instituteId, classId, y, m);
    } catch (e) { this._err(e, 'Failed to get class monthly attendance count'); }
  }

  @Get('institute/:instituteId/class/:classId/subject/:subjectId/monthly-count')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: true,
    attendanceMarker: true,
  })
  @ApiOperation({
    summary: 'Get subject monthly attendance count',
    description: 'Returns aggregated attendance counts (present, absent, late, left, leftEarly, leftLate) for a specific class+subject within an institute for a given month.',
  })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiParam({ name: 'classId', description: 'Class ID' })
  @ApiParam({ name: 'subjectId', description: 'Subject ID' })
  @ApiResponse({ status: 200, description: 'Monthly subject attendance counts retrieved' })
  async getSubjectMonthlyCount(
    @Param('instituteId') instituteId: string,
    @Param('classId') classId: string,
    @Param('subjectId') subjectId: string,
    @Query('year') year: string,
    @Query('month') month: string,
  ): Promise<any> {
    const y = parseInt(year, 10);
    const m = parseInt(month, 10);
    if (!y || !m || m < 1 || m > 12) {
      throw new HttpException(
        { success: false, message: 'Valid year and month (1-12) query parameters are required' },
        HttpStatus.BAD_REQUEST,
      );
    }
    try {
      return await this.attendanceService.getSubjectMonthlyCount(instituteId, classId, subjectId, y, m);
    } catch (e) { this._err(e, 'Failed to get subject monthly attendance count'); }
  }

  @Get('institute/:instituteId/daily-count')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: true,
    attendanceMarker: true,
  })
  @ApiOperation({
    summary: 'Get institute daily attendance count for a month',
    description: 'Returns day-by-day attendance counts (present, absent, late, left, leftEarly, leftLate) for an entire institute for a given month.',
  })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiResponse({ status: 200, description: 'Daily attendance counts retrieved' })
  async getInstituteDailyCount(
    @Param('instituteId') instituteId: string,
    @Query('year') year: string,
    @Query('month') month: string,
  ): Promise<any> {
    const y = parseInt(year, 10);
    const m = parseInt(month, 10);
    if (!y || !m || m < 1 || m > 12) {
      throw new HttpException(
        { success: false, message: 'Valid year and month (1-12) query parameters are required' },
        HttpStatus.BAD_REQUEST,
      );
    }
    try {
      return await this.attendanceService.getInstituteDailyCount(instituteId, y, m);
    } catch (e) { this._err(e, 'Failed to get institute daily attendance count'); }
  }

  @Get('institute/:instituteId/class/:classId/daily-count')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: true,
    attendanceMarker: true,
  })
  @ApiOperation({
    summary: 'Get class daily attendance count for a month',
    description: 'Returns day-by-day attendance counts (present, absent, late, left, leftEarly, leftLate) for a specific class within an institute for a given month.',
  })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiParam({ name: 'classId', description: 'Class ID' })
  @ApiResponse({ status: 200, description: 'Daily class attendance counts retrieved' })
  async getClassDailyCount(
    @Param('instituteId') instituteId: string,
    @Param('classId') classId: string,
    @Query('year') year: string,
    @Query('month') month: string,
  ): Promise<any> {
    const y = parseInt(year, 10);
    const m = parseInt(month, 10);
    if (!y || !m || m < 1 || m > 12) {
      throw new HttpException(
        { success: false, message: 'Valid year and month (1-12) query parameters are required' },
        HttpStatus.BAD_REQUEST,
      );
    }
    try {
      return await this.attendanceService.getClassDailyCount(instituteId, classId, y, m);
    } catch (e) { this._err(e, 'Failed to get class daily attendance count'); }
  }

  @Get('institute/:instituteId/class/:classId/subject/:subjectId/daily-count')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: true,
    attendanceMarker: true,
  })
  @ApiOperation({
    summary: 'Get subject daily attendance count for a month',
    description: 'Returns day-by-day attendance counts (present, absent, late, left, leftEarly, leftLate) for a specific class+subject within an institute for a given month.',
  })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiParam({ name: 'classId', description: 'Class ID' })
  @ApiParam({ name: 'subjectId', description: 'Subject ID' })
  @ApiResponse({ status: 200, description: 'Daily subject attendance counts retrieved' })
  async getSubjectDailyCount(
    @Param('instituteId') instituteId: string,
    @Param('classId') classId: string,
    @Param('subjectId') subjectId: string,
    @Query('year') year: string,
    @Query('month') month: string,
  ): Promise<any> {
    const y = parseInt(year, 10);
    const m = parseInt(month, 10);
    if (!y || !m || m < 1 || m > 12) {
      throw new HttpException(
        { success: false, message: 'Valid year and month (1-12) query parameters are required' },
        HttpStatus.BAD_REQUEST,
      );
    }
    try {
      return await this.attendanceService.getSubjectDailyCount(instituteId, classId, subjectId, y, m);
    } catch (e) { this._err(e, 'Failed to get subject daily attendance count'); }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Attendance Detail View — opened from notification deep-link
  // ─────────────────────────────────────────────────────────────────────────

  @Get('view')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Get attendance record detail by ID',
    description: `View detailed information about a single attendance event.
The \`id\` is the encoded attendance record key delivered via push notification deep-links:
  - Web: \`https://lms.suraksha.lk/attendance/view?id=<id>\`
  - Mobile: \`suraksha://attendance/view?id=<id>\`

Returns DynamoDB fields (date, status, location, timestamps) plus the student's profile image.
**Auth**: JWT required.`,
  })
  @ApiResponse({
    status: 200,
    description: 'Attendance record detail',
    schema: {
      example: {
        id: 'SXsxMjN…base64…',
        studentId: '456',
        studentName: 'K.A. Perera',
        studentImageUrl: 'https://storage.googleapis.com/…',
        instituteId: '123',
        instituteName: 'Suraksha Academy',
        classId: '789',
        className: 'Grade 10 - A',
        subjectId: null,
        subjectName: null,
        date: '2025-01-15',
        status: 1,
        timestamp: 1705329600000,
        location: 'Suraksha Academy, Grade 10 - A',
        markingMethod: 'QR_CODE',
        userType: 'STUDENT',
        calendarDayId: '101',
        eventId: '202',
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Attendance record not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getAttendanceView(
    @Query('id') id: string,
  ): Promise<any> {
    if (!id) {
      throw new HttpException(
        { success: false, message: 'Query parameter "id" is required' },
        HttpStatus.BAD_REQUEST,
      );
    }
    const detail = await this.attendanceService.getAttendanceDetail(id);
    if (!detail) {
      throw new HttpException(
        { success: false, message: 'Attendance record not found' },
        HttpStatus.NOT_FOUND,
      );
    }
    return detail;
  }

  // ═══════════════════════════════════════════════════════════════════
  //  AGGREGATE PROFILE-PAGE ENDPOINTS (single-call page loaders)
  // ═══════════════════════════════════════════════════════════════════

  @Get('institute/:instituteId/student/:studentId/class-profile')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: true,
    attendanceMarker: true,
  })
  @ApiOperation({
    summary: 'Get all data needed for the student class-level profile page (single request)',
    description: 'Returns student details, class info, attendance records+sessions, class payments, enrolled subjects, and lecture list in one call.',
  })
  async getStudentClassProfilePage(
    @Param('instituteId') instituteId: string,
    @Param('studentId') studentId: string,
    @Query('classId') classId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit') limit?: string,
  ) {
    if (!classId) {
      throw new HttpException({ success: false, message: 'classId query parameter is required' }, HttpStatus.BAD_REQUEST);
    }
    const now = new Date();
    const defaultEnd = now.toISOString().split('T')[0];
    const defaultStart = new Date(now.setFullYear(now.getFullYear() - 1)).toISOString().split('T')[0];
    try {
      return await this.attendanceService.getStudentClassProfile({
        instituteId,
        classId,
        studentId,
        startDate: startDate || defaultStart,
        endDate: endDate || defaultEnd,
        limit: Math.min(parseInt(limit || '100', 10), 500),
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException({ success: false, message: error.message || 'Failed to load class profile' }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // BATCH CLASS REPORT DATA  –  POST so student list can be in body
  // Access: InstituteAdmin → any class; Teacher → only their assigned class.
  // Body: { studentIds, classId, attendanceStart/End, paymentsStart/End,
  //         liveStart/End, recordingStart/End, withActivities?, attendanceLimit? }
  // ─────────────────────────────────────────────────────────────────────────
  @Post('institute/:instituteId/class-report')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: true,
  })
  @ApiOperation({ summary: 'Batch class-level report data for one or more students with per-section date ranges' })
  async getClassReportData(
    @Param('instituteId') instituteId: string,
    @Body() body: {
      classId: string;
      studentIds: string[];
      attendanceStart?: string;
      attendanceEnd?: string;
      paymentsStart?: string;
      paymentsEnd?: string;
      liveStart?: string;
      liveEnd?: string;
      recordingStart?: string;
      recordingEnd?: string;
      withActivities?: boolean;
      attendanceLimit?: number;
    },
  ) {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const threeMonthsAgo = new Date(now.setMonth(now.getMonth() - 3)).toISOString().split('T')[0];
    const twelveMonthsAgo = new Date(new Date().setFullYear(new Date().getFullYear() - 1)).toISOString().split('T')[0];

    if (!body?.classId) {
      throw new HttpException({ success: false, message: 'classId is required in body' }, HttpStatus.BAD_REQUEST);
    }
    if (!Array.isArray(body.studentIds) || !body.studentIds.length) {
      throw new HttpException({ success: false, message: 'studentIds array is required and must not be empty' }, HttpStatus.BAD_REQUEST);
    }
    if (body.studentIds.length > 100) {
      throw new HttpException({ success: false, message: 'Maximum 100 students per request' }, HttpStatus.BAD_REQUEST);
    }

    try {
      return await this.attendanceService.getStudentClassReportData({
        instituteId,
        classId: body.classId,
        studentIds: body.studentIds,
        attendanceStart: body.attendanceStart || threeMonthsAgo,
        attendanceEnd: body.attendanceEnd || today,
        paymentsStart: body.paymentsStart || twelveMonthsAgo,
        paymentsEnd: body.paymentsEnd || today,
        liveStart: body.liveStart || threeMonthsAgo,
        liveEnd: body.liveEnd || today,
        recordingStart: body.recordingStart || threeMonthsAgo,
        recordingEnd: body.recordingEnd || today,
        withActivities: body.withActivities ?? false,
        attendanceLimit: Math.min(body.attendanceLimit ?? 500, 2000),
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException({ success: false, message: error.message || 'Failed to generate report data' }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('institute/:instituteId/student/:studentId/institute-profile')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: true,
    attendanceMarker: true,
  })
  @ApiOperation({
    summary: 'Get all data needed for the student institute-level profile page (single request)',
    description: 'Returns student details, institute attendance, institute payments, and enrolled classes in one call.',
  })
  async getStudentInstituteProfilePage(
    @Param('instituteId') instituteId: string,
    @Param('studentId') studentId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit') limit?: string,
  ) {
    const now = new Date();
    const defaultEnd = now.toISOString().split('T')[0];
    const defaultStart = new Date(now.setFullYear(now.getFullYear() - 1)).toISOString().split('T')[0];
    try {
      return await this.attendanceService.getStudentInstituteProfile({
        instituteId,
        studentId,
        startDate: startDate || defaultStart,
        endDate: endDate || defaultEnd,
        limit: Math.min(parseInt(limit || '100', 10), 500),
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException({ success: false, message: error.message || 'Failed to load institute profile' }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

}
