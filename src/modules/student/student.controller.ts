import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';
import { ImageUrlDto } from '../../common/dto/common-body.dto';
import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseInterceptors, ClassSerializerInterceptor, HttpCode, HttpStatus, UseGuards, BadRequestException, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBody, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { FlexibleAccessGuard } from '../../auth/guards/flexible-access.guard';
import { RequireAnyOfRoles } from '../../auth/decorators/flexible-access.decorator';
import { StudentsService } from './student.service';
import { CloudStorageService } from '../../common/services/cloud-storage.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { QueryStudentDto } from './dto/query-student.dto';
import { StudentResponseDto } from './dto/student-response.dto';
import { PaginatedStudentResponseDto } from './dto/paginated-student-response.dto';
import { AssignParentDto, RemoveParentDto } from './dto/assign-parent.dto';
import { SimpleSuccessResponseDto } from './dto/simple-success-response.dto';
import { UserType } from '../user/enums/user-type.enum';

@ApiTags('students')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('students')
@UseInterceptors(ClassSerializerInterceptor)
export class StudentsController {
  constructor(private readonly studentsService: StudentsService,
    private readonly cloudStorageService: CloudStorageService
  ) {}

  // ❌ REMOVED: POST /students - Use POST /user/comprehensive with userType: USER or USER_WITHOUT_PARENT instead
  // Comprehensive user creation handles student creation with all related tables (users, students, parents)

  @Get()
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ 
    global: [UserType.SUPERADMIN], 
    instituteAdmin: true,
    teacher: true
  })
  @ApiOperation({ summary: 'Get all students with filtering and pagination' })
  @ApiResponse({ status: 200, description: 'Students retrieved successfully', type: PaginatedStudentResponseDto })
  async findAll(@Query() query: QueryStudentDto): Promise<PaginatedStudentResponseDto> {
    return await this.studentsService.findAll(query);
  }

  @Get('stats')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ 
    global: [UserType.SUPERADMIN], 
    instituteAdmin: true
  })
  @ApiOperation({ summary: 'Get student statistics' })
  @ApiResponse({ status: 200, description: 'Student statistics retrieved successfully' })
  async getStats() {
    return await this.studentsService.getStudentStats();
  }

  // Removed grade and class endpoint since these are now in institute_students table

  @Get(':userId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ 
    student: true,
    parent: { requireStudent: true },
    teacher: true,
    instituteAdmin: true
  })
  @ApiOperation({ summary: 'Get student by user ID with all relations' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'Student retrieved successfully', type: StudentResponseDto })
  @ApiResponse({ status: 404, description: 'Student not found' })
  async findOne(@Param('userId', ParseBigIntPipe) userId: string, @Request() req: any): Promise<StudentResponseDto> {
    return await this.studentsService.findOne(userId, req.user);
  }

  @Patch(':userId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ 
    global: [UserType.SUPERADMIN], 
    instituteAdmin: true 
  })
  @ApiOperation({ summary: 'Update student information' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'Student updated successfully', type: StudentResponseDto })
  @ApiResponse({ status: 404, description: 'Student not found' })
  async update(
    @Param('userId', ParseBigIntPipe) userId: string,
    @Body() updateStudentDto: UpdateStudentDto): Promise<StudentResponseDto> {
    return await this.studentsService.update(userId, updateStudentDto);
  }

  @Delete(':userId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ 
    global: [UserType.SUPERADMIN]
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Permanently delete student and associated user' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiResponse({ status: 204, description: 'Student deleted successfully' })
  @ApiResponse({ status: 404, description: 'Student not found' })
  async remove(@Param('userId', ParseBigIntPipe) userId: string): Promise<void> {
    await this.studentsService.remove(userId);
  }

  @Patch(':userId/deactivate')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ 
    global: [UserType.SUPERADMIN], 
    instituteAdmin: true 
  })
  @ApiOperation({ summary: 'Soft delete student (deactivate)' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'Student deactivated successfully', type: StudentResponseDto })
  @ApiResponse({ status: 404, description: 'Student not found' })
  async softDelete(@Param('userId', ParseBigIntPipe) userId: string): Promise<StudentResponseDto> {
    return await this.studentsService.softDelete(userId);
  }

  @Patch(':studentId/assign-parent')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ 
    global: [UserType.SUPERADMIN], 
    instituteAdmin: true 
  })
  @ApiOperation({ summary: 'Assign a parent to a student' })
  @ApiParam({ name: 'studentId', description: 'Student User ID' })
  @ApiBody({ type: AssignParentDto })
  @ApiResponse({ status: 200, description: 'Parent assigned successfully', type: SimpleSuccessResponseDto })
  @ApiResponse({ status: 404, description: 'Student or Parent not found' })
  @ApiResponse({ status: 400, description: 'Invalid parent type' })
  async assignParent(
    @Param('studentId', ParseBigIntPipe) studentId: string,
    @Body() assignParentDto: AssignParentDto
  ): Promise<{ success: boolean; message: string; timestamp: Date }> {
    return await this.studentsService.assignParentToStudent(
      studentId, 
      assignParentDto.parentType, 
      assignParentDto.parentUserId
    );
  }

  @Patch(':studentId/remove-parent')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ 
    global: [UserType.SUPERADMIN], 
    instituteAdmin: true 
  })
  @ApiOperation({ summary: 'Remove a parent from a student' })
  @ApiParam({ name: 'studentId', description: 'Student User ID' })
  @ApiBody({ type: RemoveParentDto })
  @ApiResponse({ status: 200, description: 'Parent removed successfully', type: SimpleSuccessResponseDto })
  @ApiResponse({ status: 404, description: 'Student not found' })
  @ApiResponse({ status: 400, description: 'Invalid parent type' })
  async removeParent(
    @Param('studentId', ParseBigIntPipe) studentId: string,
    @Body() removeParentDto: RemoveParentDto
  ): Promise<{ success: boolean; message: string; timestamp: Date }> {
    return await this.studentsService.removeParentFromStudent(
      studentId, 
      removeParentDto.parentType
    );
  }

  @Patch(':userId/upload-image')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ 
    global: [UserType.SUPERADMIN], 
    instituteAdmin: true 
  })
  @ApiConsumes('application/json')
  @ApiOperation({ summary: 'Update student profile image URL' })
  @ApiParam({ name: 'userId', description: 'Student User ID' })
  @ApiBody({
    description: 'Student image URL from signed URL upload',
    schema: {
      type: 'object',
      properties: {
        imageUrl: {
          type: 'string',
          format: 'uri',
          description: 'Image URL from /upload/verify-and-publish endpoint'
        }
      },
      required: ['imageUrl']
    }
  })
  @ApiResponse({ status: 200, description: 'Image URL updated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid imageUrl' })
  @ApiResponse({ status: 404, description: 'Student not found' })
  async uploadImage(
    @Param('userId', ParseBigIntPipe) userId: string,
    @Body() body: ImageUrlDto
  ): Promise<{ success: boolean; message: string; imageUrl: string }> {
    if (!body.imageUrl) {
      throw new BadRequestException('imageUrl is required');
    }

    return await this.studentsService.updateStudentImage(userId, body.imageUrl);
  }
}
