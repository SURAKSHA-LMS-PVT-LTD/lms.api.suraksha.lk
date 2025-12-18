import { Controller, Post, Get, Query, Param, Body, HttpException, HttpStatus, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { AttendanceService } from './attendance.service';
import { MarkAttendanceDto, BulkAttendanceDto, AttendanceResponseDto, GetStudentAttendanceDto, GetStudentAttendanceQueryDto, StudentAttendanceResponseDto } from './dto/attendance.dto';
import { MarkAttendanceByCardDto, GetAttendanceByCardDto, BulkCardAttendanceDto } from './dto/card-attendance.dto';
import { MarkAttendanceByInstituteCardDto, GetInstituteUserByCardDto, InstituteCardUserResponseDto } from './dto/institute-card-attendance.dto';
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
    @Query() queryDto: GetStudentAttendanceQueryDto
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

      const result = await this.attendanceService.getStudentAttendance(fullQueryDto);
      
      if (result.data.length === 0 && fullQueryDto.page === 1) {
        throw new HttpException(
          {
            success: false,
            message: 'No attendance records found for the specified criteria',
          },
          HttpStatus.NOT_FOUND
        );
      }

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
      
      if (result.data.length === 0 && (fullQueryDto.page || 1) === 1) {
        throw new HttpException(
          {
            success: false,
            message: 'No attendance records found for the specified card ID and criteria',
          },
          HttpStatus.NOT_FOUND
        );
      }

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

      // Validate date range: 30 days max when filtering by studentId, 5 days otherwise
      const start = new Date(startDate);
      const end = new Date(endDate);
      const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      
      const maxDays = studentId ? 30 : 5;
      if (daysDiff > maxDays) {
        throw new HttpException(
          {
            success: false,
            message: studentId 
              ? 'Date range cannot exceed 30 days when filtering by studentId'
              : 'Date range cannot exceed 5 days for institute-wide queries. Add studentId parameter to query up to 30 days.',
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

      // Validate date range: 30 days max when filtering by studentId, 5 days otherwise
      const start = new Date(startDate);
      const end = new Date(endDate);
      const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      
      const maxDays = studentId ? 30 : 5;
      if (daysDiff > maxDays) {
        throw new HttpException(
          {
            success: false,
            message: studentId 
              ? 'Date range cannot exceed 30 days when filtering by studentId'
              : 'Date range cannot exceed 5 days for class-wide queries. Add studentId parameter to query up to 30 days.',
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

      // Validate date range: 30 days max when filtering by studentId, 5 days otherwise
      const start = new Date(startDate);
      const end = new Date(endDate);
      const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      
      const maxDays = studentId ? 30 : 5;
      if (daysDiff > maxDays) {
        throw new HttpException(
          {
            success: false,
            message: studentId 
              ? 'Date range cannot exceed 30 days when filtering by studentId'
              : 'Date range cannot exceed 5 days for subject-wide queries. Add studentId parameter to query up to 30 days.',
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
}




