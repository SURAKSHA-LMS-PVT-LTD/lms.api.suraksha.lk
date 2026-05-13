import { ParseBigIntPipe } from '../../../../common/pipes/parse-bigint.pipe';
import { Controller, Post, BadRequestException, Param, UseGuards, Request, HttpStatus, HttpCode, Body, UseFilters, Get, Patch, Query, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBearerAuth, ApiConsumes, ApiQuery, ApiBody } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../../auth/guards/jwt-auth.guard';
import { FlexibleAccessGuard } from '../../../../auth/guards/flexible-access.guard';
import { RequireAnyOfRoles } from '../../../../auth/decorators/flexible-access.decorator';
import { UserType } from '../../../user/enums/user-type.enum';
import { FileUploadExceptionFilter } from '../../../../common/filters/file-upload-exception.filter';
import { InstituteClassSubjectHomeworksSubmissionsService } from '../institute_class_subject_homeworks_submissions.service';
import { QueryInstituteClassSubjectHomeworksSubmissionDto } from '../dto/query-institute_class_subject_homeworks_submission.dto';
import { UpdateInstituteClassSubjectHomeworksSubmissionDto } from '../dto/update-institute_class_subject_homeworks_submission.dto';
import { CloudStorageService } from '../../../../common/services/cloud-storage.service';
import { JwtRequest, JwtPayload } from '@common/interfaces/jwt-request.interface';
import { SubmitHomeworkDto, UploadCorrectionFileDto } from '../dto/submit-homework.dto';

@ApiTags('Institute Class Subject Homework Submissions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@UseFilters(FileUploadExceptionFilter)
@Controller('institute-class-subject-homework-submissions')
export class HomeworkSubmissionController {
  constructor(
    private readonly homeworkSubmissionsService: InstituteClassSubjectHomeworksSubmissionsService,
    private readonly cloudStorageService: CloudStorageService
  ) {}

  @Post(':homeworkId/submit')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    student: {}
  })
  @ApiOperation({ 
    summary: 'Submit homework file', 
    description: 'Upload PDF using /upload/generate-signed-url first, then submit the fileUrl. Only students can submit homework.' 
  })
  @ApiConsumes('application/json')
  @ApiBody({
    description: 'Homework submission with file URL',
    schema: {
      type: 'object',
      properties: {
        fileUrl: {
          type: 'string',
          description: 'PDF file URL from /upload/verify-and-publish',
          example: 'https://storage.googleapis.com/suraksha-lms/homework-files/submission.pdf'
        }
      },
      required: ['fileUrl']
    }
  })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Homework submitted successfully',
    schema: {
      example: {
        success: true,
        message: 'Homework submitted successfully',
        data: {
          submissionId: '123',
          publicUrl: 'https://storage.googleapis.com/suraksha-lms/homework-files/submission.pdf',
          submittedAt: '2024-01-15T10:30:00Z'
        }
      }
    }
  })
  @ApiResponse({ 
    status: HttpStatus.BAD_REQUEST, 
    description: 'Invalid file URL or submission not allowed' 
  })
  @ApiResponse({ 
    status: HttpStatus.NOT_FOUND, 
    description: 'Homework not found' 
  })
  @ApiParam({ name: 'homeworkId', description: 'Homework ID' })
  @HttpCode(HttpStatus.OK)
  async submitHomework(
    @Param('homeworkId', ParseBigIntPipe) homeworkId: string,
    @Body() body: SubmitHomeworkDto,
    @Request() req: JwtRequest
  ) {
    try {

      const user = req.user;
      // JWT v2: user.s is the userId
      const studentId = user.s;
      
      // Check if homework exists and submission is allowed
      const homework = await this.homeworkSubmissionsService.getHomeworkDetails(homeworkId);
      if (!homework) {
        throw new BadRequestException('Homework not found');
      }

      // Validate student enrollment in the homework's class
      const hasEnrollment = this.validateStudentEnrollment(
        user,
        homework.instituteId,
        homework.classId,
        homework.subjectId
      );

      if (!hasEnrollment) {
        throw new ForbiddenException('Access denied: You are not enrolled in this homework assignment');
      }

      // Check if submission is within allowed time period
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      
      if (homework.startDate) {
        const startDay = new Date(homework.startDate.getFullYear(), homework.startDate.getMonth(), homework.startDate.getDate());
        if (today < startDay) {
          throw new BadRequestException('Submission period has not started yet');
        }
      }

      if (homework.endDate) {
        const endDay = new Date(homework.endDate.getFullYear(), homework.endDate.getMonth(), homework.endDate.getDate());
        endDay.setHours(23, 59, 59, 999);
        if (now > endDay) {
          throw new BadRequestException('Submission period has ended');
        }
      }

      // Create or update submission record with verified fileUrl
      const submission = await this.homeworkSubmissionsService.createOrUpdateSubmission({
        homeworkId,
        studentId,
        fileUrl: body.fileUrl,
        submissionDate: new Date(),
        isActive: true
      });

      // ✅ OOP: Use CloudStorageService to convert relative path to full URL
      const publicUrl = this.cloudStorageService.getFullUrl(body.fileUrl);

      return {
        success: true,
        message: 'Homework submitted successfully',
        data: {
          submissionId: submission.id,
          publicUrl: publicUrl,
          submittedAt: submission.submissionDate
        }
      };
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof ForbiddenException) {
        throw error;
      }
      throw new BadRequestException('Failed to submit homework');
    }
  }

  @Get('institute/:instituteId/class/:classId/subject/:subjectId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: { requireSubject: true }
  })
  @ApiOperation({ 
    summary: 'Get homework submissions for specific institute, class, and subject', 
    description: 'Retrieve all homework submissions for a specific institute, class, and subject combination. Supports pagination and filtering. Teachers can only access submissions for subjects they teach.' 
  })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiParam({ name: 'classId', description: 'Class ID' })
  @ApiParam({ name: 'subjectId', description: 'Subject ID' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page (default: 10)' })
  @ApiQuery({ name: 'homeworkId', required: false, description: 'Filter by specific homework ID' })
  @ApiQuery({ name: 'studentId', required: false, description: 'Filter by specific student ID' })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Homework submissions retrieved successfully',
    schema: {
      example: {
        data: [
          {
            id: "123",
            homeworkId: "456",
            studentId: "789",
            submissionDate: "2024-01-15T10:30:00Z",
            fileUrl: "https://storage.googleapis.com/laas-file-storage/homework-submissions/submission.pdf",
            teacherCorrectionFileUrl: null,
            remarks: null,
            isActive: true,
            createdAt: "2024-01-15T10:30:00Z",
            updatedAt: "2024-01-15T10:30:00Z"
          }
        ],
        meta: {
          total: 1,
          page: 1,
          limit: 10,
          totalPages: 1
        }
      }
    }
  })
  @ApiResponse({ 
    status: HttpStatus.FORBIDDEN, 
    description: 'Access denied - insufficient permissions' 
  })
  async getSubmissionsForSubject(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Param('classId', ParseBigIntPipe) classId: string,
    @Param('subjectId', ParseBigIntPipe) subjectId: string,
    @Query() queryDto: QueryInstituteClassSubjectHomeworksSubmissionDto,
    @Request() req: JwtRequest
  ) {
    const user = req.user;
    
    // Access control will be handled by decorators

    return await this.homeworkSubmissionsService.getSubmissionsBySubject(
      instituteId, 
      classId, 
      subjectId, 
      queryDto
    );
  }

  @Patch(':submissionId/review')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: { requireSubject: true }
  })
  @ApiOperation({ 
    summary: 'Teacher review and mark homework submission', 
    description: 'Teachers can add remarks, upload correction files, and mark homework submissions. Can request resubmission if needed.' 
  })
  @ApiParam({ name: 'submissionId', description: 'Homework submission ID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        remarks: { type: 'string', description: 'Teacher remarks on the submission' },
        requestResubmission: { type: 'boolean', description: 'Whether to request resubmission from student' },
        grade: { type: 'string', description: 'Grade assigned to the submission' }
      }
    }
  })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Homework submission reviewed successfully',
    schema: {
      example: {
        success: true,
        message: 'Homework submission reviewed successfully',
        data: {
          submissionId: "123",
          remarks: "Good work, but please improve the conclusion section",
          requestResubmission: false,
          reviewDate: "2024-01-15T14:30:00Z"
        }
      }
    }
  })
  @ApiResponse({ 
    status: HttpStatus.FORBIDDEN, 
    description: 'Access denied - insufficient permissions' 
  })
  async reviewSubmission(
    @Param('submissionId', ParseBigIntPipe) submissionId: string,
    @Body() reviewData: { remarks?: string; requestResubmission?: boolean; grade?: string },
    @Request() req: JwtRequest
  ) {
    const teacherId = req.user.s;
    const user = req.user;

    // Get submission details to validate access
    const submission = await this.homeworkSubmissionsService.getSubmissionWithHomework(submissionId);
    
    // Access control will be handled by decorators

    return await this.homeworkSubmissionsService.reviewSubmission(submissionId, {
      ...reviewData,
      reviewerId: teacherId,
      reviewDate: new Date()
    });
  }

  @Post(':submissionId/correction-file')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: { requireSubject: true }
  })
  @ApiOperation({ 
    summary: 'Upload teacher correction file for homework submission', 
    description: 'Upload PDF using /upload/generate-signed-url first, then submit the correctionFileUrl.' 
  })
  @ApiConsumes('application/json')
  @ApiParam({ name: 'submissionId', description: 'Homework submission ID' })
  @ApiBody({
    description: 'Correction file URL',
    schema: {
      type: 'object',
      properties: {
        correctionFileUrl: {
          type: 'string',
          description: 'PDF file URL from /upload/verify-and-publish',
          example: 'https://storage.googleapis.com/suraksha-lms/teacher-corrections/correction.pdf'
        }
      },
      required: ['correctionFileUrl']
    }
  })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Correction file uploaded successfully',
    schema: {
      example: {
        success: true,
        message: 'Correction file uploaded successfully',
        data: {
          submissionId: "123",
          correctionFileUrl: "https://storage.googleapis.com/suraksha-lms/teacher-corrections/correction.pdf",
          uploadDate: "2024-01-15T14:30:00Z"
        }
      }
    }
  })
  @ApiResponse({ 
    status: HttpStatus.BAD_REQUEST, 
    description: 'Invalid file URL or submission not found' 
  })
  async uploadCorrectionFile(
    @Param('submissionId', ParseBigIntPipe) submissionId: string,
    @Body() body: UploadCorrectionFileDto,
    @Request() req: JwtRequest
  ) {

    const user = req.user;

    // Get submission details
    const submission = await this.homeworkSubmissionsService.getSubmissionWithHomework(submissionId);

    try {
      // Update submission with correction file URL
      const updatedSubmission = await this.homeworkSubmissionsService.update(submissionId, {
        teacherCorrectionFileUrl: body.correctionFileUrl
      });

      // ✅ OOP: Use CloudStorageService to convert relative path to full URL
      const publicCorrectionUrl = this.cloudStorageService.getFullUrl(body.correctionFileUrl);

      return {
        success: true,
        message: 'Correction file uploaded successfully',
        data: {
          submissionId: updatedSubmission.id,
          correctionFileUrl: publicCorrectionUrl,
          uploadDate: new Date()
        }
      };
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof ForbiddenException) {
        throw error;
      }
      throw new BadRequestException('Failed to upload correction file');
    }
  }

  @Post(':submissionId/correction-file-drive')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: { requireSubject: true }
  })
  @ApiOperation({ 
    summary: 'Upload teacher correction file from Google Drive', 
    description: 'Teachers can attach a correction file directly from their Google Drive. The file must be accessible with the provided access token. Use /user-drive-access/token to get an access token if using stored OAuth credentials.' 
  })
  @ApiConsumes('application/json')
  @ApiParam({ name: 'submissionId', description: 'Homework submission ID' })
  @ApiBody({
    description: 'Google Drive file details for correction',
    schema: {
      type: 'object',
      properties: {
        driveFileId: {
          type: 'string',
          description: 'Google Drive file ID',
          example: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms'
        },
        accessToken: {
          type: 'string',
          description: 'Google OAuth2 access token for Drive API. Get from /user-drive-access/token or Google Sign-In',
          example: 'ya29.a0AfH6SM...'
        },
        fileName: {
          type: 'string',
          description: 'Optional custom file name (auto-detected from Drive if omitted)',
          example: 'Correction_Essay_JohnDoe.pdf'
        },
        mimeType: {
          type: 'string',
          description: 'Optional MIME type (auto-detected from Drive if omitted)',
          example: 'application/pdf'
        },
        remarks: {
          type: 'string',
          description: 'Optional teacher remarks/feedback',
          example: 'Good work overall. Please review the highlighted corrections.'
        }
      },
      required: ['driveFileId', 'accessToken']
    }
  })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Correction file from Google Drive attached successfully',
    schema: {
      example: {
        success: true,
        message: 'Correction file from Google Drive attached successfully',
        data: {
          submissionId: "123",
          correctionType: "GOOGLE_DRIVE",
          correctionDriveFileId: "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms",
          correctionDriveFileName: "Correction_Essay.pdf",
          correctionDriveMimeType: "application/pdf",
          correctionDriveViewUrl: "https://drive.google.com/file/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms/view",
          uploadDate: "2024-01-15T14:30:00Z"
        }
      }
    }
  })
  @ApiResponse({ 
    status: HttpStatus.BAD_REQUEST, 
    description: 'Invalid Drive file or access token' 
  })
  @HttpCode(HttpStatus.OK)
  async uploadCorrectionFileFromDrive(
    @Param('submissionId', ParseBigIntPipe) submissionId: string,
    @Body() body: { 
      driveFileId: string; 
      accessToken: string; 
      fileName?: string; 
      mimeType?: string;
      remarks?: string;
    },
    @Request() req: JwtRequest
  ) {
    if (!body.driveFileId) {
      throw new BadRequestException('driveFileId is required');
    }
    if (!body.accessToken) {
      throw new BadRequestException('accessToken is required');
    }

    const teacherId = req.user.s;

    try {
      const result = await this.homeworkSubmissionsService.submitCorrectionViaGoogleDrive(
        submissionId,
        teacherId,
        body.driveFileId,
        body.accessToken,
        body.remarks,
        body.fileName,
        body.mimeType
      );

      return {
        success: true,
        message: 'Correction file from Google Drive attached successfully',
        data: {
          submissionId: result.id,
          correctionType: 'GOOGLE_DRIVE',
          correctionDriveFileId: body.driveFileId,
          correctionDriveFileName: result.correctionDriveFileName || body.fileName,
          correctionDriveMimeType: result.correctionDriveMimeType || body.mimeType,
          correctionDriveViewUrl: `https://drive.google.com/file/d/${body.driveFileId}/view`,
          uploadDate: new Date()
        }
      };
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof ForbiddenException) {
        throw error;
      }
      throw new BadRequestException('Failed to attach correction file from Google Drive');
    }
  }

  @Get(':submissionId/details')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    anyInstituteRole: true
  })
  @ApiOperation({ 
    summary: 'Get detailed homework submission information', 
    description: 'Retrieve detailed information about a specific homework submission including student details, homework details, and review status.' 
  })
  @ApiParam({ name: 'submissionId', description: 'Homework submission ID' })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Submission details retrieved successfully',
    schema: {
      example: {
        id: "123",
        homeworkId: "456",
        studentId: "789",
        submissionDate: "2024-01-15T10:30:00Z",
        fileUrl: "https://storage.googleapis.com/laas-file-storage/homework-submissions/submission.pdf",
        teacherCorrectionFileUrl: "https://storage.googleapis.com/laas-file-storage/teacher-corrections/teacher_correction.pdf",
        remarks: "Good work, but please improve the conclusion section",
        isActive: true,
        homework: {
          id: "456",
          title: "Essay Assignment",
          description: "Write an essay about climate change",
          instituteId: "1",
          classId: "2",
          subjectId: "3"
        },
        student: {
          id: "789",
          firstName: "John",
          lastName: "Doe",
          email: "john.doe@example.com"
        }
      }
    }
  })
  async getSubmissionDetails(
    @Param('submissionId', ParseBigIntPipe) submissionId: string,
    @Request() req: JwtRequest
  ) {
    const user = req.user;
    const submission = await this.homeworkSubmissionsService.findOneWithDetails(submissionId);
    
    // Access control will be handled by decorators

    return submission;
  }

  @Get(':homeworkId/my-submissions')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    student: {}
  })
  @ApiOperation({ 
    summary: 'Get current user\'s homework submissions for specific homework', 
    description: 'Students can retrieve their own homework submissions for a specific homework assignment.' 
  })
  @ApiParam({ name: 'homeworkId', description: 'Homework ID' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page (default: 10)' })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'User submissions retrieved successfully',
    schema: {
      example: {
        data: [
          {
            id: "123",
            homeworkId: "456",
            studentId: "789",
            submissionDate: "2024-01-15T10:30:00Z",
            fileUrl: "https://storage.googleapis.com/laas-file-storage/homework-submissions/submission.pdf",
            teacherCorrectionFileUrl: null,
            remarks: null,
            isActive: true
          }
        ],
        meta: {
          total: 1,
          page: 1,
          limit: 10,
          totalPages: 1
        }
      }
    }
  })
  async getMySubmissions(
    @Param('homeworkId', ParseBigIntPipe) homeworkId: string,
    @Query() queryDto: QueryInstituteClassSubjectHomeworksSubmissionDto,
    @Request() req: JwtRequest
  ) {
    const user = req.user;
    
    // Extract user ID from JWT v2 (compact format)
    const userId = user.s;
    
    // Students can only see their own submissions for the specific homework
    queryDto.studentId = userId;
    queryDto.homeworkId = homeworkId;
    
    return await this.homeworkSubmissionsService.findAll(queryDto);
  }

  @Get('student/:studentId/submissions')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: { requireSubject: true }
  })
  @ApiOperation({ 
    summary: 'Get specific student\'s homework submissions', 
    description: 'Teachers and admins can get submissions based on their access rights.' 
  })
  @ApiParam({ name: 'studentId', description: 'Student ID' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page (default: 10)' })
  @ApiQuery({ name: 'homeworkId', required: false, description: 'Filter by specific homework ID' })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Student submissions retrieved successfully',
    schema: {
      example: {
        data: [
          {
            id: "123",
            homeworkId: "456",
            studentId: "789",
            submissionDate: "2024-01-15T10:30:00Z",
            fileUrl: "https://storage.googleapis.com/laas-file-storage/homework-submissions/submission.pdf",
            teacherCorrectionFileUrl: "https://storage.googleapis.com/laas-file-storage/teacher-corrections/teacher_correction.pdf",
            remarks: "Good work, but needs improvement in conclusion",
            isActive: true
          }
        ],
        meta: {
          total: 1,
          page: 1,
          limit: 10,
          totalPages: 1
        }
      }
    }
  })
  async getStudentSubmissions(
    @Param('studentId', ParseBigIntPipe) studentId: string,
    @Query() queryDto: QueryInstituteClassSubjectHomeworksSubmissionDto,
    @Request() req: JwtRequest
  ) {
    const user = req.user;
    
    // Access control will be handled by decorators
    queryDto.studentId = studentId;
    
    return await this.homeworkSubmissionsService.findAll(queryDto);
  }

  /**
   * Validate if a student is enrolled in a specific institute/class/subject
   * Checks the JWT token's institute access array for enrollment
   * 
   * ✅ FIXED: Proper type coercion for classId comparison
   * ✅ FIXED: Normalized string comparison to handle type mismatches
   */
  private validateStudentEnrollment(
    user: JwtPayload,
    instituteId: string,
    classId: string,
    subjectId: string
  ): boolean {
    /**
     * SIMPLIFIED VALIDATION LOGIC:
     * 1. Get homework's classId
     * 2. Check if that classId exists in user's JWT token
     * 3. No role check needed (guard already handles it)
     * 4. No subject check needed (homework belongs to class)
     */
    
    // Get institute access array from JWT
    // JWT v2 structure: user.i = [{i: instituteId, r: role, c: [[classId, subjectBitmask]]}]
    const instituteAccess = Array.isArray(user.i) ? user.i : [];
    
    if (instituteAccess.length === 0) {
      return false;
    }
    
    // ✅ Normalize IDs to strings for consistent comparison
    const normalizedInstituteId = String(instituteId);
    const normalizedClassId = String(classId);
    
    
    // Find institute entries that match the target institute
    const instituteEntries = instituteAccess.filter(
      (entry) => String(entry.i) === normalizedInstituteId
    );
    
    if (instituteEntries.length === 0) {
      return false;
    }


    // Check if user has access to the homework's class (regardless of role)
    for (const entry of instituteEntries) {
      if (!entry.c || !Array.isArray(entry.c)) {
        continue;
      }


      // entry.c is an array of [classId, subjectBitmask] pairs
      for (const [cId] of entry.c) {
        const normalizedCId = String(cId);
        
        
        if (normalizedCId === normalizedClassId) {
          return true;
        }
      }
    }

    return false;
  }
}

