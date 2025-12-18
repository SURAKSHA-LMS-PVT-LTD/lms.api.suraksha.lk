import { Controller, Post, Get, Body, Param, Query, Req, ValidationPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { BookhireAttendanceService } from '../services/bookhire-attendance.service';
import { 
  MarkBookhireAttendanceDto, 
  BulkMarkAttendanceDto,
  BookhireAttendanceQueryDto,
  StudentAttendanceQueryDto,
  BookhireAttendanceListResponseDto,
  StudentAttendanceListResponseDto,
  AttendanceSummaryResponseDto,
  MarkAttendanceResponseDto,
  BulkMarkAttendanceResponseDto
} from '../dto/bookhire-attendance.dto';
import { BookhireOwnerJwtGuard } from '../guards/bookhire-owner-jwt.guard';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { FlexibleAccessGuard } from '../../../auth/guards/flexible-access.guard';
import { RequireAnyOfRoles } from '../../../auth/decorators/flexible-access.decorator';
import { UserType } from '../../../modules/user/enums/user-type.enum';

@Controller('api/bookhire-attendance')
@ApiTags('Bookhire Attendance')
export class BookhireAttendanceController {
  constructor(
    private readonly bookhireAttendanceService: BookhireAttendanceService
  ) {}

  /**
   * 🚗 MARK SINGLE ATTENDANCE - Bookhire Owner
   */
  @Post('mark')
  @UseGuards(BookhireOwnerJwtGuard)
  @ApiOperation({ summary: 'Mark attendance for a single student by Student ID' })
  @ApiBearerAuth('bookhire-owner-jwt')
  @ApiResponse({ status: 201, description: 'Attendance marked successfully', type: MarkAttendanceResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid bookhire owner token' })
  @ApiResponse({ status: 404, description: 'Bookhire or student not found' })
  async markAttendance(
    @Body(ValidationPipe) markAttendanceDto: MarkBookhireAttendanceDto,
    @Req() req: any
  ): Promise<{ success: boolean; message: string; data: any }> {
    // Validate that studentId is provided for this endpoint
    if (!markAttendanceDto.studentId) {
      throw new Error('Student ID is required for this endpoint. Use /mark-by-rfid for RFID-based attendance');
    }

    const result = await this.bookhireAttendanceService.markAttendance(
      markAttendanceDto, 
      req.user.ownerId
    );
    return {
      success: true,
      message: 'Attendance marked successfully',
      data: result
    };
  }

  /**
   * 📇 MARK ATTENDANCE BY RFID CARD - Bookhire Owner
   */
  @Post('mark-by-rfid')
  @UseGuards(BookhireOwnerJwtGuard)
  @ApiOperation({ summary: 'Mark attendance using RFID card scan' })
  @ApiBearerAuth('bookhire-owner-jwt')
  @ApiResponse({ status: 201, description: 'Attendance marked successfully via RFID', type: MarkAttendanceResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid bookhire owner token' })
  @ApiResponse({ status: 404, description: 'Student not found with this RFID card' })
  async markAttendanceByRfid(
    @Body(ValidationPipe) markAttendanceDto: MarkBookhireAttendanceDto,
    @Req() req: any
  ): Promise<{ success: boolean; message: string; data: any }> {
    // Validate that rfidCardId is provided
    if (!markAttendanceDto.rfidCardId) {
      throw new Error('RFID card ID is required for RFID-based attendance');
    }

    const result = await this.bookhireAttendanceService.markAttendanceByRfid(
      markAttendanceDto, 
      req.user.ownerId
    );
    return {
      success: true,
      message: 'Attendance marked successfully via RFID',
      data: result
    };
  }

  /**
   * 📊 MARK BULK ATTENDANCE - Bookhire Owner
   */
  @Post('mark-bulk')
  @UseGuards(BookhireOwnerJwtGuard)
  @ApiOperation({ summary: 'Mark attendance for multiple students in bulk' })
  @ApiBearerAuth('bookhire-owner-jwt')
  @ApiResponse({ status: 201, description: 'Bulk attendance marked successfully', type: BulkMarkAttendanceResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid bookhire owner token' })
  @ApiResponse({ status: 404, description: 'Bookhire not found' })
  async markBulkAttendance(
    @Body(ValidationPipe) bulkMarkAttendanceDto: BulkMarkAttendanceDto,
    @Req() req: any
  ): Promise<{ success: boolean; message: string; data: any }> {
    const result = await this.bookhireAttendanceService.markBulkAttendance(
      bulkMarkAttendanceDto,
      req.user.ownerId
    );
    return {
      success: true,
      message: 'Bulk attendance marked successfully',
      data: result
    };
  }

  /**
   * 📋 GET BOOKHIRE ATTENDANCE - Bookhire Owner
   */
  @Get('bookhire/:bookhireId')
  @UseGuards(BookhireOwnerJwtGuard)
  @ApiOperation({ summary: 'Get attendance records for a specific bookhire' })
  @ApiBearerAuth('bookhire-owner-jwt')
  @ApiParam({ name: 'bookhireId', description: 'Bookhire ID' })
  @ApiQuery({ name: 'startDate', required: false, description: 'Start date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'endDate', required: false, description: 'End date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'studentId', required: false, description: 'Filter by student ID' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number', type: Number })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page', type: Number })
  @ApiResponse({ status: 200, description: 'Bookhire attendance retrieved successfully', type: BookhireAttendanceListResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid bookhire owner token' })
  @ApiResponse({ status: 404, description: 'Bookhire not found or access denied' })
  async getBookhireAttendance(
    @Param('bookhireId') bookhireId: number,
    @Req() req: any,
    @Query() queryDto: BookhireAttendanceQueryDto
  ): Promise<{ success: boolean; message: string; data: any }> {
    const result = await this.bookhireAttendanceService.getBookhireAttendance({
      bookhireId: +bookhireId,
      ownerId: req.user.ownerId,
      startDate: queryDto.startDate,
      endDate: queryDto.endDate,
      studentId: queryDto.studentId,
      page: queryDto.page || 1,
      limit: queryDto.limit || 50
    });
    return {
      success: true,
      message: 'Bookhire attendance retrieved successfully',
      data: result
    };
  }

  /**
   * 👨‍🎓 GET STUDENT ATTENDANCE - Students & Parents
   */
  @Get('student/:studentId')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    student: true,
    parent: true
  })
  @ApiOperation({ summary: 'Get attendance records for a specific student' })
  @ApiBearerAuth('jwt')
  @ApiParam({ name: 'studentId', description: 'Student ID' })
  @ApiQuery({ name: 'startDate', required: false, description: 'Start date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'endDate', required: false, description: 'End date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'bookhireId', required: false, description: 'Filter by bookhire ID' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number', type: Number })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page', type: Number })
  @ApiResponse({ status: 200, description: 'Student attendance retrieved successfully', type: StudentAttendanceListResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Access denied' })
  async getStudentAttendance(
    @Param('studentId') studentId: string,
    @Req() req: any,
    @Query() queryDto: StudentAttendanceQueryDto
  ): Promise<{ success: boolean; message: string; data: any }> {
    const result = await this.bookhireAttendanceService.getStudentAttendance({
      studentId,
      startDate: queryDto.startDate,
      endDate: queryDto.endDate,
      bookhireId: queryDto.bookhireId,
      page: queryDto.page || 1,
      limit: queryDto.limit || 50
    });

    return {
      success: true,
      message: 'Student attendance retrieved successfully',
      data: result
    };
  }

  /**
   * 📈 GET ATTENDANCE SUMMARY - Multiple Roles
   */
  @Get('summary')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: true
  })
  @ApiOperation({ summary: 'Get attendance summary with statistics' })
  @ApiBearerAuth('jwt')
  @ApiQuery({ name: 'bookhireId', required: false, description: 'Filter by bookhire ID' })
  @ApiQuery({ name: 'studentId', required: false, description: 'Filter by student ID' })
  @ApiQuery({ name: 'startDate', required: true, description: 'Start date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'endDate', required: true, description: 'End date (YYYY-MM-DD)' })
  @ApiResponse({ status: 200, description: 'Attendance summary retrieved successfully', type: AttendanceSummaryResponseDto })
  @ApiResponse({ status: 400, description: 'Bad Request - Start date and end date are required' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Access denied' })
  async getAttendanceSummary(
    @Req() req: any,
    @Query('bookhireId') bookhireId?: number,
    @Query('studentId') studentId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string
  ): Promise<{ success: boolean; message: string; data: any }> {
    if (!startDate || !endDate) {
      throw new Error('Start date and end date are required for attendance summary');
    }

    const result = await this.bookhireAttendanceService.getAttendanceSummary({
      bookhireId: bookhireId ? +bookhireId : undefined,
      studentId,
      startDate,
      endDate
    });

    return {
      success: true,
      message: 'Attendance summary retrieved successfully',
      data: result
    };
  }

  /**
   * 🔍 GET MY BOOKHIRES ATTENDANCE - Bookhire Owner Dashboard
   */
  @Get('my-bookhires')
  @UseGuards(BookhireOwnerJwtGuard)
  @ApiOperation({ summary: 'Get attendance for all bookhires owned by the owner' })
  @ApiBearerAuth('bookhire-owner-jwt')
  @ApiQuery({ name: 'startDate', required: false, description: 'Start date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'endDate', required: false, description: 'End date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'studentId', required: false, description: 'Filter by student ID' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number', type: Number })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page', type: Number })
  @ApiResponse({ status: 200, description: 'Owner bookhires attendance retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid bookhire owner token' })
  async getMyBookhiresAttendance(
    @Req() req: any,
    @Query() queryDto: BookhireAttendanceQueryDto
  ): Promise<{ success: boolean; message: string; data: any }> {
    // This would need a method to get all bookhires for an owner
    // For now, it returns a message to implement this later
    const result = {
      ownerId: req.user.ownerId,
      filters: {
        startDate: queryDto.startDate,
        endDate: queryDto.endDate,
        studentId: queryDto.studentId,
        page: queryDto.page || 1,
        limit: queryDto.limit || 50
      }
    };

    return {
      success: true,
      message: 'Get all bookhires attendance for owner - To be implemented',
      data: result
    };
  }
}