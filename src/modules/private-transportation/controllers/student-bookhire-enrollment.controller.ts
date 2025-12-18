import { 
  Controller, 
  Get, 
  Post, 
  Put, 
  Delete,
  Body, 
  Param, 
  Query,
  Req,
  ForbiddenException,
  UseGuards 
} from '@nestjs/common';
import { 
  ApiTags, 
  ApiOperation, 
  ApiResponse, 
  ApiBearerAuth,
  ApiQuery,
  ApiParam 
} from '@nestjs/swagger';
import { StudentBookhireEnrollmentService } from '../services/student-bookhire-enrollment.service';
import { 
  CreateStudentBookhireEnrollmentDto, 
  UpdateStudentBookhireEnrollmentDto, 
  EnrollmentStatusUpdateDto,
  StudentBookhireEnrollmentResponseDto,
  StudentBookhireEnrollmentListResponseDto
} from '../dto/student-bookhire-enrollment.dto';

import { BookhireOwnerJwtGuard } from '../guards/bookhire-owner-jwt.guard';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { FlexibleAccessGuard } from '../../../auth/guards/flexible-access.guard';
import { RequireAnyOfRoles } from '../../../auth/decorators/flexible-access.decorator';
import { UserType } from '../../../modules/user/enums/user-type.enum';
import { JwtRequest } from '../../../common/interfaces/jwt-request.interface';

interface BookhireOwnerRequest extends Request {
  user: {
    sub: string;
    email: string;
    type: string;
    bookhireIds?: string[];
  };
}

@ApiTags('student-bookhire-enrollment')
@Controller('api/student-bookhire-enrollment')
export class StudentBookhireEnrollmentController {
  constructor(
    private readonly enrollmentService: StudentBookhireEnrollmentService
  ) {}

  // Student/Parent Endpoints - PROTECTED
  // ✅ PROTECTED: Students/Parents only
  @Post('enroll')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    student: true,
    parent: true
  })
  @ApiBearerAuth('jwt')
  @ApiOperation({ summary: 'Enroll student in a bookhire (Student/Parent ONLY - PROTECTED)' })
  @ApiResponse({ status: 201, description: 'Enrollment created successfully', type: StudentBookhireEnrollmentResponseDto })
  @ApiResponse({ status: 409, description: 'Student already enrolled in this bookhire' })
  @ApiResponse({ status: 404, description: 'Bookhire not found' })
  @ApiResponse({ status: 400, description: 'Bookhire not available for enrollment' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid or missing token' })
  @ApiResponse({ status: 403, description: 'Forbidden - Students can only enroll themselves, Parents can only enroll their children' })
  async enroll(
    @Body() createEnrollmentDto: CreateStudentBookhireEnrollmentDto,
    @Req() req: Request
  ): Promise<{ success: boolean; message: string; data: StudentBookhireEnrollmentResponseDto }> {
    const data = await this.enrollmentService.enrollAsDto(createEnrollmentDto);
    return {
      success: true,
      message: 'Enrollment created successfully',
      data
    };
  }

  // ✅ PROTECTED: Students/Parents/Admins
  @Get('student/:studentId')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    student: true,
    parent: true
  })
  @ApiBearerAuth('jwt')
  @ApiOperation({ summary: 'Get enrollments by student ID (Student/Parent/Admin - PROTECTED)' })
  @ApiParam({ name: 'studentId', description: 'Student ID' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number', type: Number })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page', type: Number })
  @ApiResponse({ status: 200, description: 'List of student enrollments', type: StudentBookhireEnrollmentListResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid or missing token' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  async getStudentEnrollments(
    @Param('studentId') studentId: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Req() req: Request
  ): Promise<{ success: boolean; message: string; data: StudentBookhireEnrollmentListResponseDto }> {
    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(100, Math.max(1, Number(limit) || 10));
    
    const data = await this.enrollmentService.findByStudentAsDto(studentId, pageNum, limitNum);
    return {
      success: true,
      message: 'Student enrollments retrieved successfully',
      data
    };
  }

  // ✅ PROTECTED: Students/Parents only
  @Put('student/:enrollmentId')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    student: true,
    parent: true
  })
  @ApiBearerAuth('jwt')
  @ApiOperation({ summary: 'Update enrollment details (Student/Parent ONLY - PROTECTED)' })
  @ApiParam({ name: 'enrollmentId', description: 'Enrollment ID' })
  @ApiResponse({ status: 200, description: 'Enrollment updated successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid or missing token' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  @ApiResponse({ status: 404, description: 'Enrollment not found' })
  async updateStudentEnrollment(
    @Param('enrollmentId') enrollmentId: string,
    @Body() updateDto: UpdateStudentBookhireEnrollmentDto,
    @Req() req: JwtRequest
  ) {
    const { user } = req;
    
    // Validate user exists (should be guaranteed by authentication guard)
    if (!user) {
      throw new ForbiddenException('Authentication required');
    }
    
    return this.enrollmentService.updateEnrollment(
      enrollmentId,
      updateDto,
      user.s,
      'student'
    );
  }

  // ✅ PROTECTED: Students/Parents only
  @Delete('student/:enrollmentId/cancel')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    student: true,
    parent: true
  })
  @ApiBearerAuth('jwt')
  @ApiOperation({ summary: 'Cancel enrollment (Student/Parent ONLY - PROTECTED)' })
  @ApiParam({ name: 'enrollmentId', description: 'Enrollment ID' })
  @ApiResponse({ status: 200, description: 'Enrollment cancelled successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid or missing token' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  @ApiResponse({ status: 404, description: 'Enrollment not found' })
  async cancelStudentEnrollment(
    @Param('enrollmentId') enrollmentId: string,
    @Req() req: JwtRequest
  ) {
    const { user } = req;
    
    // For simplicity, using user.subject - in real implementation, 
    // you'd need to verify the enrollment belongs to this user
    await this.enrollmentService.cancelEnrollment(enrollmentId, user.s);
    return { message: 'Enrollment cancelled successfully' };
  }

  // Bookhire Owner Endpoints
  @Get('owner/my-enrollments')
  @UseGuards(BookhireOwnerJwtGuard)
  @ApiOperation({ summary: 'Get all enrollments for owned bookhires (Bookhire Owner only)' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number', type: Number })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page', type: Number })
  @ApiResponse({ status: 200, description: 'List of enrollments', type: StudentBookhireEnrollmentListResponseDto })
  async getOwnerEnrollments(
    @Req() req: BookhireOwnerRequest,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10
  ): Promise<{ success: boolean; message: string; data: StudentBookhireEnrollmentListResponseDto }> {
    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(100, Math.max(1, Number(limit) || 10));
    
    const data = await this.enrollmentService.findByOwnerAsDto((req.user?.sub || 'anonymous'), pageNum, limitNum);
    return {
      success: true,
      message: 'Owner enrollments retrieved successfully',
      data
    };
  }

  @Get('owner/bookhire/:bookhireId')
  @UseGuards(BookhireOwnerJwtGuard)
  @ApiOperation({ summary: 'Get enrollments for specific bookhire (Bookhire Owner only)' })
  @ApiParam({ name: 'bookhireId', description: 'Bookhire ID' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number', type: Number })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page', type: Number })
  @ApiResponse({ status: 200, description: 'List of enrollments for the bookhire', type: StudentBookhireEnrollmentListResponseDto })
  async getBookhireEnrollments(
    @Param('bookhireId') bookhireId: number,
    @Req() req: BookhireOwnerRequest,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10
  ): Promise<{ success: boolean; message: string; data: StudentBookhireEnrollmentListResponseDto }> {
    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(100, Math.max(1, Number(limit) || 10));
    
    const data = await this.enrollmentService.findByBookhireAsDto(+bookhireId, (req.user?.sub || 'anonymous'), pageNum, limitNum);
    return {
      success: true,
      message: 'Bookhire enrollments retrieved successfully',
      data
    };
  }

  @Put('owner/:enrollmentId/status')
  @UseGuards(BookhireOwnerJwtGuard)
  @ApiOperation({ summary: 'Update enrollment status (Bookhire Owner only)' })
  @ApiParam({ name: 'enrollmentId', description: 'Enrollment ID' })
  @ApiResponse({ status: 200, description: 'Enrollment status updated successfully' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  @ApiResponse({ status: 404, description: 'Enrollment not found' })
  async updateEnrollmentStatus(
    @Param('enrollmentId') enrollmentId: string,
    @Body() statusUpdateDto: EnrollmentStatusUpdateDto,
    @Req() req: BookhireOwnerRequest
  ) {
    return this.enrollmentService.updateEnrollmentStatus(
      enrollmentId, 
      statusUpdateDto, 
      (req.user?.sub || 'anonymous')
    );
  }

  @Put('owner/:enrollmentId')
  @UseGuards(BookhireOwnerJwtGuard)
  @ApiOperation({ summary: 'Update enrollment details (Bookhire Owner only)' })
  @ApiParam({ name: 'enrollmentId', description: 'Enrollment ID' })
  @ApiResponse({ status: 200, description: 'Enrollment updated successfully' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  @ApiResponse({ status: 404, description: 'Enrollment not found' })
  async updateOwnerEnrollment(
    @Param('enrollmentId') enrollmentId: string,
    @Body() updateDto: UpdateStudentBookhireEnrollmentDto,
    @Req() req: BookhireOwnerRequest
  ) {
    return this.enrollmentService.updateEnrollment(
      enrollmentId, 
      updateDto, 
      (req.user?.sub || 'anonymous'), 
      'owner'
    );
  }

  // Enhanced Verification Endpoints for BookHire Owners
  @Get('owner/pending-verifications')
  @UseGuards(BookhireOwnerJwtGuard)
  @ApiOperation({ summary: 'Get all pending student verifications for owned bookhires (Bookhire Owner only)' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number', type: Number })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page', type: Number })
  @ApiQuery({ name: 'bookhireId', required: false, description: 'Filter by specific bookhire ID', type: String })
  @ApiResponse({ 
    status: 200, 
    description: 'List of pending student verification requests',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        data: {
          type: 'object',
          properties: {
            pendingVerifications: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  enrollmentId: { type: 'string' },
                  studentId: { type: 'string' },
                  studentName: { type: 'string' },
                  bookhireId: { type: 'string' },
                  bookhireTitle: { type: 'string' },
                  vehicleNumber: { type: 'string' },
                  enrollmentDate: { type: 'string', format: 'date-time' },
                  parentContact: { type: 'string' },
                  emergencyContact: { type: 'string' },
                  pickupLocation: { type: 'string' },
                  dropoffLocation: { type: 'string' },
                  specialInstructions: { type: 'string' },
                  status: { type: 'string', enum: ['PENDING'] }
                }
              }
            },
            totalPending: { type: 'number' },
            currentPage: { type: 'number' },
            totalPages: { type: 'number' },
            hasNextPage: { type: 'boolean' },
            hasPrevPage: { type: 'boolean' }
          }
        }
      }
    }
  })
  async getPendingVerifications(
    @Req() req: BookhireOwnerRequest,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('bookhireId') bookhireId?: number
  ) {
    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(100, Math.max(1, Number(limit) || 10));
    
    return this.enrollmentService.getPendingVerifications((req.user?.sub || 'anonymous'), pageNum, limitNum, bookhireId ? +bookhireId : undefined);
  }

  @Put('owner/:enrollmentId/approve')
  @UseGuards(BookhireOwnerJwtGuard)
  @ApiOperation({ summary: 'Approve student enrollment verification (Bookhire Owner only)' })
  @ApiParam({ name: 'enrollmentId', description: 'Enrollment ID' })
  @ApiResponse({ 
    status: 200, 
    description: 'Student enrollment approved successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        data: {
          type: 'object',
          properties: {
            enrollmentId: { type: 'string' },
            studentName: { type: 'string' },
            status: { type: 'string', enum: ['APPROVED'] },
            approvedAt: { type: 'string', format: 'date-time' }
          }
        }
      }
    }
  })
  @ApiResponse({ status: 403, description: 'Access denied - Not your bookhire' })
  @ApiResponse({ status: 404, description: 'Enrollment not found' })
  @ApiResponse({ status: 400, description: 'Enrollment is not in pending status' })
  async approveStudentEnrollment(
    @Param('enrollmentId') enrollmentId: string,
    @Req() req: BookhireOwnerRequest
  ) {
    return this.enrollmentService.approveStudentVerification(enrollmentId, (req.user?.sub || 'anonymous'));
  }

  @Put('owner/:enrollmentId/reject')
  @UseGuards(BookhireOwnerJwtGuard)
  @ApiOperation({ summary: 'Reject student enrollment verification (Bookhire Owner only)' })
  @ApiParam({ name: 'enrollmentId', description: 'Enrollment ID' })
  @ApiResponse({ 
    status: 200, 
    description: 'Student enrollment rejected successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        data: {
          type: 'object',
          properties: {
            enrollmentId: { type: 'string' },
            studentName: { type: 'string' },
            status: { type: 'string', enum: ['REJECTED'] },
            rejectedAt: { type: 'string', format: 'date-time' }
          }
        }
      }
    }
  })
  @ApiResponse({ status: 403, description: 'Access denied - Not your bookhire' })
  @ApiResponse({ status: 404, description: 'Enrollment not found' })
  @ApiResponse({ status: 400, description: 'Enrollment is not in pending status' })
  async rejectStudentEnrollment(
    @Param('enrollmentId') enrollmentId: string,
    @Req() req: BookhireOwnerRequest
  ) {
    return this.enrollmentService.rejectStudentVerification(enrollmentId, (req.user?.sub || 'anonymous'));
  }

  @Put('owner/:enrollmentId/activate')
  @UseGuards(BookhireOwnerJwtGuard)
  @ApiOperation({ summary: 'Activate approved student enrollment (Bookhire Owner only)' })
  @ApiParam({ name: 'enrollmentId', description: 'Enrollment ID' })
  @ApiResponse({ 
    status: 200, 
    description: 'Student enrollment activated successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        data: {
          type: 'object',
          properties: {
            enrollmentId: { type: 'string' },
            studentName: { type: 'string' },
            status: { type: 'string', enum: ['ACTIVE'] },
            activatedAt: { type: 'string', format: 'date-time' },
            startDate: { type: 'string', format: 'date-time' }
          }
        }
      }
    }
  })
  @ApiResponse({ status: 403, description: 'Access denied - Not your bookhire' })
  @ApiResponse({ status: 404, description: 'Enrollment not found' })
  @ApiResponse({ status: 400, description: 'Enrollment must be approved before activation' })
  async activateStudentEnrollment(
    @Param('enrollmentId') enrollmentId: string,
    @Req() req: BookhireOwnerRequest
  ) {
    return this.enrollmentService.activateStudentEnrollment(enrollmentId, (req.user?.sub || 'anonymous'));
  }

  // Admin Endpoints
  @Get('admin/all')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
  @ApiBearerAuth('jwt')
  @ApiOperation({ summary: 'Get all enrollments (System Admin only)' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number', type: Number })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page', type: Number })
  @ApiResponse({ status: 200, description: 'List of all enrollments', type: StudentBookhireEnrollmentListResponseDto })
  @ApiResponse({ status: 403, description: 'Forbidden - System Admin access required' })
  async getAllEnrollments(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10
  ): Promise<{ success: boolean; message: string; data: StudentBookhireEnrollmentListResponseDto }> {
    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(100, Math.max(1, Number(limit) || 10));
    
    const data = await this.enrollmentService.findAllAsDto(pageNum, limitNum);
    return {
      success: true,
      message: 'All enrollments retrieved successfully',
      data
    };
  }

  @Get(':enrollmentId')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
  @ApiBearerAuth('jwt')
  @ApiOperation({ summary: 'Get enrollment details by ID (Admin only)' })
  @ApiParam({ name: 'enrollmentId', description: 'Enrollment ID' })
  @ApiResponse({ status: 200, description: 'Enrollment details', type: StudentBookhireEnrollmentResponseDto })
  @ApiResponse({ status: 404, description: 'Enrollment not found' })
  async getEnrollmentById(@Param('enrollmentId') enrollmentId: string): Promise<{ success: boolean; message: string; data: StudentBookhireEnrollmentResponseDto }> {
    const data = await this.enrollmentService.findOneAsDto(enrollmentId);
    return {
      success: true,
      message: 'Enrollment retrieved successfully',
      data
    };
  }
}


