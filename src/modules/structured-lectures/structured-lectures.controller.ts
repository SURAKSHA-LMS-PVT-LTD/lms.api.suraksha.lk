import { Controller, Get, Post, Put, Delete, Body, Param, Query, HttpException, HttpStatus, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery, ApiBody } from '@nestjs/swagger';
import { StructuredLecturesService } from './structured-lectures.service';
import { CreateLectureDto, UpdateLectureDto, LectureResponseDto, GetLecturesBySubjectResponseDto, LectureQueryDto, LectureListResponseDto } from './dto/lecture.dto';
import { UserType } from '../user/enums/user-type.enum';
import { CloudStorageService } from '../../common/services/cloud-storage.service';
import { JwtRequest } from '../../common/interfaces/jwt-request.interface';

// ⚠️ MULTER REMOVED: All file uploads now use signed URL client-side direct upload
// See: /signed-urls/lecture endpoint for new upload flow
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { FlexibleAccessGuard } from '../../auth/guards/flexible-access.guard';
import { RequireAnyOfRoles } from '../../auth/decorators/flexible-access.decorator';

@ApiTags('Structured Lectures')
@Controller('api/structured-lectures')
export class StructuredLecturesController {
  constructor(
    private readonly lecturesService: StructuredLecturesService,
    private readonly cloudStorageService: CloudStorageService
  ) {}

  // ─── Cover image signed URL endpoints ───────────────────────────────────────

  @Post('upload/cover-image/signed-url')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: true
  })
  @ApiOperation({ summary: 'Get a presigned URL to upload a lecture cover image directly to storage' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['fileName', 'contentType'],
      properties: {
        fileName: { type: 'string', example: 'cover.jpg' },
        contentType: { type: 'string', example: 'image/jpeg' },
      }
    }
  })
  async getLectureCoverSignedUrl(
    @Body('fileName') fileName: string,
    @Body('contentType') contentType: string,
  ) {
    try {
      if (!fileName || !contentType) {
        throw new HttpException({ success: false, message: 'fileName and contentType are required' }, HttpStatus.BAD_REQUEST);
      }
      const result = await this.cloudStorageService.generateSignedUploadUrl(
        'lecture-covers',
        fileName,
        contentType,
        600, // 10 min
        10 * 1024 * 1024 // 10 MB
      );
      return { success: true, ...result };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException({ success: false, message: error.message || 'Failed to generate signed URL' }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('upload/cover-image/verify')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: true
  })
  @ApiOperation({ summary: 'Verify and publish an uploaded lecture cover image, returns the public URL' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['relativePath'],
      properties: { relativePath: { type: 'string', example: 'lecture-covers/cover-uuid.jpg' } }
    }
  })
  async verifyLectureCoverUpload(@Body('relativePath') relativePath: string) {
    try {
      if (!relativePath) {
        throw new HttpException({ success: false, message: 'relativePath is required' }, HttpStatus.BAD_REQUEST);
      }
      // Security: only allow lecture-covers folder
      if (!relativePath.startsWith('lecture-covers/')) {
        throw new HttpException({ success: false, message: 'Invalid path' }, HttpStatus.BAD_REQUEST);
      }
      const publicUrl = await this.cloudStorageService.verifyAndMakePublic(relativePath);
      return { success: true, publicUrl };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException({ success: false, message: error.message || 'Failed to verify upload' }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // ─── Document upload endpoints (institute-owned cloud storage) ───────────────
  // Files go to S3/GCS, NOT to a personal Google Drive.
  // This ensures documents persist when a teacher is removed from the institute.

  @Post('upload/document/signed-url')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: true
  })
  @ApiOperation({
    summary: 'Get a presigned URL to upload a lecture document directly to institute-owned cloud storage',
    description: `
      Generates a signed upload URL for a lecture document.
      Files are stored in institute-owned cloud storage (S3/GCS), NOT in a personal Google Drive.
      
      **Why this matters:** Documents stored in a teacher's personal Google Drive disappear
      when that teacher is removed from the institute. Cloud storage persists independently.
      
      Upload flow:
      1. Call this endpoint → receive uploadUrl + relativePath
      2. PUT the file to uploadUrl with Content-Type header
      3. Call POST /upload/document/verify with relativePath → receive permanent publicUrl
      4. Save publicUrl in documentUrls when creating/updating the lecture
    `
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['fileName', 'contentType', 'fileSize'],
      properties: {
        fileName: { type: 'string', example: 'chapter-3-notes.pdf' },
        contentType: { type: 'string', example: 'application/pdf' },
        fileSize: { type: 'number', description: 'File size in bytes', example: 2097152 },
      }
    }
  })
  async getLectureDocumentSignedUrl(
    @Body('fileName') fileName: string,
    @Body('contentType') contentType: string,
    @Body('fileSize') fileSize: number,
  ) {
    try {
      if (!fileName || !contentType || fileSize === undefined || fileSize === null) {
        throw new HttpException(
          { success: false, message: 'fileName, contentType, and fileSize are required' },
          HttpStatus.BAD_REQUEST
        );
      }
      const fileSizeNum = Number(fileSize);
      if (isNaN(fileSizeNum) || fileSizeNum <= 0) {
        throw new HttpException(
          { success: false, message: 'fileSize must be a positive number' },
          HttpStatus.BAD_REQUEST
        );
      }

      // Max 50 MB for lecture documents
      const MAX_DOCUMENT_SIZE = 50 * 1024 * 1024;
      if (fileSizeNum > MAX_DOCUMENT_SIZE) {
        throw new HttpException(
          { success: false, message: 'Document exceeds maximum allowed size of 50 MB' },
          HttpStatus.BAD_REQUEST
        );
      }

      const result = await this.cloudStorageService.generateSignedUploadUrl(
        'structured-lecture-documents',
        fileName,
        contentType,
        600, // 10 min expiry
        MAX_DOCUMENT_SIZE
      );

      const publicUrl = this.cloudStorageService.getFullUrl(result.relativePath);

      return {
        success: true,
        message: 'Signed URL generated (10 min expiry). Upload file then call /upload/document/verify.',
        uploadUrl: result.uploadUrl,
        publicUrl,
        relativePath: result.relativePath,
        expiresAt: result.expiresAt,
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        { success: false, message: error.message || 'Failed to generate signed URL' },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Post('upload/document/verify')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: true
  })
  @ApiOperation({ summary: 'Verify and publish an uploaded lecture document, returns the permanent public URL' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['relativePath'],
      properties: { relativePath: { type: 'string', example: 'structured-lecture-documents/doc-uuid.pdf' } }
    }
  })
  async verifyLectureDocumentUpload(@Body('relativePath') relativePath: string) {
    try {
      if (!relativePath) {
        throw new HttpException({ success: false, message: 'relativePath is required' }, HttpStatus.BAD_REQUEST);
      }
      // Security: only allow structured-lecture-documents folder
      if (!relativePath.startsWith('structured-lecture-documents/')) {
        throw new HttpException({ success: false, message: 'Invalid path: must be under structured-lecture-documents/' }, HttpStatus.BAD_REQUEST);
      }
      const publicUrl = await this.cloudStorageService.verifyAndMakePublic(relativePath);
      return { success: true, publicUrl };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        { success: false, message: error.message || 'Failed to verify document upload' },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  // ─── CRUD endpoints ──────────────────────────────────────────────────────────

  @Post()
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: true
  })
  @ApiOperation({ 
    summary: 'Create a new lecture',
    description: 'Create a new lecture with coverImageUrl and documentUrls as strings. Upload files using /signed-urls/lecture first. Accessible by SUPERADMIN, Institute Admin, or Teacher.'
  })
  @ApiBody({
    description: 'Lecture data with URL strings (use /signed-urls/lecture for file uploads)',
    schema: {
      type: 'object',
      properties: {
        subjectId: { type: 'string', description: 'Subject ID' },
        grade: { type: 'number', description: 'Grade level (1-13)' },
        lessonNumber: { type: 'number', description: 'Lesson number within the subject' },
        lectureNumber: { type: 'number', description: 'Lecture number within the lesson' },
        title: { type: 'string', description: 'Lecture title' },
        description: { type: 'string', description: 'Lecture description' },
        lectureVideoUrl: { type: 'string', description: 'Video URL' },
        documentUrls: { type: 'array', items: { type: 'string' }, description: 'Document URLs from /signed-urls/lecture' },
        provider: { type: 'string', description: 'Content provider' },
        isActive: { type: 'boolean', description: 'Active status', default: true },
        coverImageUrl: { type: 'string', description: 'Cover image URL from /signed-urls/lecture' }
      },
      required: ['subjectId', 'grade', 'lessonNumber', 'lectureNumber', 'title']
    }
  })
  @ApiResponse({ 
    status: 201, 
    description: 'Lecture created successfully',
    type: LectureResponseDto 
  })
  @ApiResponse({ status: 400, description: 'Bad request - validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized - invalid JWT token' })
  @ApiResponse({ status: 403, description: 'Forbidden - insufficient permissions' })
  @ApiResponse({ status: 409, description: 'Conflict - lecture already exists' })
  async createLecture(
    @Body() createLectureDto: CreateLectureDto,
    @Req() request: JwtRequest
  ): Promise<{ success: boolean; message: string; data: LectureResponseDto }> {
    try {
      const userId = request.user.s;
      
      // All URLs now come as strings from client-side signed URL uploads
      // No file processing on backend
      const result = await this.lecturesService.createLectureAsDto(createLectureDto, userId);
      
      return {
        success: true,
        message: 'Structured lecture created successfully',
        data: result
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to create lecture',
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get()
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: true
  })
  @ApiOperation({ 
    summary: 'Get all lectures with pagination and filtering',
    description: 'Retrieve all lectures with pagination, search, and active status filtering. Accessible by SUPERADMIN, Institute Admin, or Teacher.'
  })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page (default: 50)' })
  @ApiQuery({ name: 'grade', required: false, description: 'Filter by grade level (1-13)' })
  @ApiQuery({ name: 'isActive', required: false, description: 'Filter by active status' })
  @ApiQuery({ name: 'search', required: false, description: 'Search in title, description, or provider' })
  @ApiResponse({ 
    status: 200, 
    description: 'Lectures retrieved successfully',
    type: LectureListResponseDto
  })
  async getAllLectures(@Query() queryDto: LectureQueryDto): Promise<LectureListResponseDto> {
    try {
      return await this.lecturesService.getAllLecturesAsDto(queryDto);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to retrieve lectures',
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get('institute/:instituteId/subject/:subjectId')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: true,
    student: true,
    parent: true
  })
  @ApiOperation({ 
    summary: 'Get lectures by institute ID and subject ID',
    description: 'Retrieve all structured lectures for a subject within an institute. All classes in the institute studying this subject see the same lectures. Accessible by all authenticated roles.'
  })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiParam({ name: 'subjectId', description: 'Subject ID to filter lectures' })
  @ApiQuery({ name: 'grade', required: false, description: 'Optional grade level filter (1-13)' })
  @ApiQuery({ name: 'isActive', required: false, description: 'Filter by active status (default: true for non-admin users)' })
  @ApiResponse({ 
    status: 200, 
    description: 'Lectures retrieved successfully',
    type: LectureListResponseDto
  })
  async getLecturesByInstituteAndSubject(
    @Param('instituteId') instituteId: string,
    @Param('subjectId') subjectId: string,
    @Req() request: JwtRequest,
    @Query('grade') grade?: number,
    @Query('isActive') isActive?: boolean
  ): Promise<LectureListResponseDto> {
    try {
      // For non-admin users, default to showing only active lectures
      let activeFilter = isActive;
      if (request.user.u !== 0 && activeFilter === undefined) {
        activeFilter = true;
      }

      return await this.lecturesService.getLecturesByInstituteAndSubjectAsDto(instituteId, subjectId, grade, activeFilter);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to retrieve lectures for institute and subject',
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get('subject/:subjectId/grade/:grade')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: true,
    student: true,
    parent: true
  })
  @ApiOperation({ 
    summary: 'Get lectures by subject ID and grade (grouped by lessons)',
    description: 'Retrieve all lectures for a specific subject and grade, grouped by lesson number and sorted by lecture number. Accessible by SUPERADMIN, Institute Admin, Teacher, or Student.'
  })
  @ApiParam({ name: 'subjectId', description: 'Subject ID to filter lectures' })
  @ApiParam({ name: 'grade', description: 'Grade level (1-13)' })
  @ApiQuery({ name: 'isActive', required: false, description: 'Filter by active status (default: true for non-admin users)' })
  @ApiResponse({ 
    status: 200, 
    description: 'Lectures retrieved successfully',
    type: GetLecturesBySubjectResponseDto 
  })
  @ApiResponse({ status: 404, description: 'No lectures found for the subject and grade' })
  async getLecturesBySubjectAndGrade(
    @Param('subjectId') subjectId: string,
    @Param('grade') grade: number,
    @Req() request: JwtRequest,
    @Query('isActive') isActive?: boolean,
    @Query('instituteId') instituteId?: string
  ) {
    try {
      // Validate grade range
      if (grade < 1 || grade > 13) {
        throw new HttpException(
          {
            success: false,
            message: 'Grade must be between 1 and 13',
          },
          HttpStatus.BAD_REQUEST
        );
      }
      
      // For non-admin users, default to showing only active lectures
      let activeFilter = isActive;
      if (request.user.u !== 0 && activeFilter === undefined) {
        activeFilter = true;
      }

      return await this.lecturesService.getLecturesBySubjectAndGrade(subjectId, grade, activeFilter, instituteId);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to retrieve lectures for subject and grade',
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get('subject/:subjectId')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: true,
    student: true,
    parent: true
  })
  @ApiOperation({
    summary: 'Get lectures by subject ID with grade as query param',
    description: 'Retrieve all lectures for a specific subject and grade. Grade is passed as a query parameter. Accessible by SUPERADMIN, Institute Admin, Teacher, or Student.'
  })
  @ApiParam({ name: 'subjectId', description: 'Subject ID to filter lectures' })
  @ApiQuery({ name: 'grade', required: false, description: 'Grade level (1-13)' })
  @ApiQuery({ name: 'isActive', required: false, description: 'Filter by active status (default: true for non-admin users)' })
  @ApiResponse({ status: 200, description: 'Lectures retrieved successfully', type: GetLecturesBySubjectResponseDto })
  @ApiResponse({ status: 404, description: 'No lectures found for the subject and grade' })
  async getLecturesBySubjectQuery(
    @Param('subjectId') subjectId: string,
    @Req() request: JwtRequest,
    @Query('grade') grade?: number,
    @Query('isActive') isActive?: boolean,
    @Query('instituteId') instituteId?: string
  ) {
    try {
      if (grade !== undefined && (grade < 1 || grade > 13)) {
        throw new HttpException(
          { success: false, message: 'Grade must be between 1 and 13' },
          HttpStatus.BAD_REQUEST
        );
      }

      let activeFilter = isActive;
      if (request.user.u !== 0 && activeFilter === undefined) {
        activeFilter = true;
      }

      return await this.lecturesService.getLecturesBySubjectAndGrade(subjectId, grade, activeFilter, instituteId);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        { success: false, message: error.message || 'Failed to retrieve lectures for subject' },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get('statistics/:subjectId')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: true
  })
  @ApiOperation({ 
    summary: 'Get lecture statistics for a subject',
    description: 'Get detailed statistics about lectures for a specific subject. Optionally filter by grade. Accessible by SUPERADMIN, Institute Admin, or Teacher.'
  })
  @ApiParam({ name: 'subjectId', description: 'Subject ID to get statistics for' })
  @ApiQuery({ name: 'grade', required: false, description: 'Grade level to filter statistics (1-13)' })
  @ApiResponse({ 
    status: 200, 
    description: 'Statistics retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        subjectId: { type: 'string' },
        grade: { type: 'string', description: 'Grade level or "all"' },
        totalLectures: { type: 'number' },
        activeLectures: { type: 'number' },
        inactiveLectures: { type: 'number' },
        totalLessons: { type: 'number' },
        totalGrades: { type: 'number' },
        totalDocuments: { type: 'number' },
        lecturesWithLinks: { type: 'number' }
      }
    }
  })
  async getLectureStatistics(
    @Param('subjectId') subjectId: string,
    @Query('grade') grade?: number
  ) {
    try {
      if (grade !== undefined && (grade < 1 || grade > 13)) {
        throw new HttpException(
          {
            success: false,
            message: 'Grade must be between 1 and 13',
          },
          HttpStatus.BAD_REQUEST
        );
      }
      
      return await this.lecturesService.getLectureStatistics(subjectId, grade);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to retrieve lecture statistics',
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: true,
    student: true,
    parent: true
  })
  @ApiOperation({ 
    summary: 'Get a single lecture by ID',
    description: 'Retrieve a specific lecture by its ID. Accessible by all authenticated users.'
  })
  @ApiParam({ name: 'id', description: 'Lecture ID' })
  @ApiResponse({ 
    status: 200, 
    description: 'Lecture retrieved successfully',
    type: LectureResponseDto 
  })
  @ApiResponse({ status: 404, description: 'Lecture not found' })
  async getLectureById(@Param('id') id: string): Promise<LectureResponseDto> {
    try {
      const result = await this.lecturesService.getLectureByIdAsDto(id);
      if (!result) {
        throw new HttpException(
          {
            success: false,
            message: 'Lecture not found',
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
          message: error.message || 'Failed to retrieve lecture',
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: true
  })
  @ApiOperation({ 
    summary: 'Update a lecture',
    description: 'Update an existing lecture with coverImageUrl and documentUrls as strings. Upload files using /signed-urls/lecture first. Accessible by SUPERADMIN, Institute Admin, or Teacher.'
  })
  @ApiParam({ name: 'id', description: 'Lecture ID to update' })
  @ApiBody({
    description: 'Updated lecture data with URL strings (use /signed-urls/lecture for file uploads)',
    schema: {
      type: 'object',
      properties: {
        subjectId: { type: 'string', description: 'Subject ID' },
        grade: { type: 'number', description: 'Grade level (1-13)' },
        lessonNumber: { type: 'number', description: 'Lesson number within the subject' },
        lectureNumber: { type: 'number', description: 'Lecture number within the lesson' },
        title: { type: 'string', description: 'Lecture title' },
        description: { type: 'string', description: 'Lecture description' },
        lectureVideoUrl: { type: 'string', description: 'Video URL' },
        documentUrls: { type: 'array', items: { type: 'string' }, description: 'Document URLs from /signed-urls/lecture' },
        provider: { type: 'string', description: 'Content provider' },
        isActive: { type: 'boolean', description: 'Active status' },
        coverImageUrl: { type: 'string', description: 'Cover image URL from /signed-urls/lecture' }
      }
    }
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Lecture updated successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'Lecture updated successfully' },
        data: { $ref: '#/components/schemas/LectureResponseDto' }
      }
    }
  })
  @ApiResponse({ status: 400, description: 'Bad request - validation error' })
  @ApiResponse({ status: 404, description: 'Lecture not found' })
  @ApiResponse({ status: 409, description: 'Conflict - another lecture exists with same lesson and lecture number' })
  async updateLecture(
    @Param('id') id: string,
    @Body() updateLectureDto: UpdateLectureDto,
    @Req() request: JwtRequest
  ): Promise<{ success: boolean; message: string; data: LectureResponseDto }> {
    try {
      const userId = request.user.s;
      
      // All URLs now come as strings from client-side signed URL uploads
      // No file processing on backend
      const result = await this.lecturesService.updateLectureAsDto(id, updateLectureDto, userId);
      
      return {
        success: true,
        message: 'Lecture updated successfully',
        data: result
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to update lecture',
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: true
  })
  @ApiOperation({ 
    summary: 'Delete a lecture (soft delete)',
    description: 'Soft delete a lecture by setting isActive to false. Accessible by SUPERADMIN, Institute Admin, or Teacher.'
  })
  @ApiParam({ name: 'id', description: 'Lecture ID to delete' })
  @ApiResponse({ 
    status: 200, 
    description: 'Lecture deleted successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' }
      }
    }
  })
  @ApiResponse({ status: 404, description: 'Lecture not found' })
  async deleteLecture(
    @Param('id') id: string,
    @Req() request: JwtRequest
  ) {
    try {
      const userId = request.user.s;
      return await this.lecturesService.deleteLecture(id, userId);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to delete lecture',
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Delete(':id/permanent')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN]
  })
  @ApiOperation({ 
    summary: 'Permanently delete a lecture',
    description: 'Permanently delete a lecture from the database. Only accessible by SUPERADMIN. Use with caution!'
  })
  @ApiParam({ name: 'id', description: 'Lecture ID to permanently delete' })
  @ApiResponse({ 
    status: 200, 
    description: 'Lecture permanently deleted successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' }
      }
    }
  })
  @ApiResponse({ status: 404, description: 'Lecture not found' })
  async permanentlyDeleteLecture(@Param('id') id: string) {
    try {
      return await this.lecturesService.permanentlyDeleteLecture(id);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to permanently delete lecture',
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}

