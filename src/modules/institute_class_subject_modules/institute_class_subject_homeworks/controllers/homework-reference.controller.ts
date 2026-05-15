import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpStatus,
  HttpCode,
  UseGuards,
  Request,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBody,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { ParseIdPipe } from '../../../../common/pipes/parse-id.pipe';
import { JwtAuthGuard } from '../../../../auth/guards/jwt-auth.guard';
import { FlexibleAccessGuard } from '../../../../auth/guards/flexible-access.guard';
import { RequireAnyOfRoles } from '../../../../auth/decorators/flexible-access.decorator';
import { UserType } from '../../../user/enums/user-type.enum';

import { HomeworkReferenceService } from '../services/homework-reference.service';
import {
  CreateHomeworkReferenceDto,
  CreateHomeworkReferenceGoogleDriveDto,
  CreateHomeworkReferenceLinkDto,
  GenerateReferenceUploadUrlDto,
  ConfirmReferenceUploadDto,
} from '../dto/create-homework-reference.dto';
import { UpdateHomeworkReferenceDto, ReorderReferencesDto } from '../dto/update-homework-reference.dto';
import { QueryHomeworkReferenceDto } from '../dto/query-homework-reference.dto';
import {
  HomeworkReferenceResponseDto,
  PaginatedHomeworkReferenceResponseDto,
  GenerateUploadUrlResponseDto,
  HomeworkReferenceSummaryDto,
} from '../dto/homework-reference-response.dto';

/**
 * 📚 Homework Reference Materials Controller
 * 
 * Comprehensive API for managing homework reference materials:
 * - Videos, Images, PDFs, Documents, Links, Audio files
 * - Three upload methods: S3, Google Drive, Manual Links
 * - Full CRUD operations with soft delete support
 * - Role-based access control (Teachers and Institute Admins)
 * 
 * UPLOAD WORKFLOW (S3):
 * 1. POST /upload/generate-url - Get signed upload URL
 * 2. Upload file directly to S3 using signed URL
 * 3. POST /upload/confirm - Confirm upload and create reference
 * 
 * GOOGLE DRIVE WORKFLOW:
 * 1. Frontend initiates OAuth flow via /auth/google
 * 2. Get access token after user authorizes
 * 3. POST /google-drive - Create reference with Drive file
 * 
 * MANUAL LINK WORKFLOW:
 * 1. POST /link - Create reference with external URL
 */
@ApiTags('Homework References')
@Controller('homework-references')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@UsePipes(new ValidationPipe({ transform: true }))
export class HomeworkReferenceController {
  constructor(private readonly referenceService: HomeworkReferenceService) {}

  // ========== CREATE OPERATIONS ==========

  @Post()
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true, teacher: true })
  @ApiOperation({
    summary: 'Create a homework reference (Generic)',
    description: 'Create a reference with pre-uploaded file data. For most cases, use the specific endpoints: /upload/generate-url + /upload/confirm for S3, /google-drive for Drive, or /link for URLs.',
  })
  @ApiResponse({ status: HttpStatus.CREATED, type: HomeworkReferenceResponseDto })
  @ApiBody({ type: CreateHomeworkReferenceDto })
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() createDto: CreateHomeworkReferenceDto,
    @Request() req: any
  ): Promise<HomeworkReferenceResponseDto> {
    return this.referenceService.create(createDto, req.user);
  }

  @Post('upload/generate-url')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true, teacher: true })
  @ApiOperation({
    summary: 'Generate S3 signed upload URL',
    description: `
Step 1 of S3 upload workflow. Returns a signed URL for direct file upload to S3.

**File Size Limits:**
- VIDEO: 500 MB
- IMAGE: 10 MB
- PDF: 50 MB
- DOCUMENT: 50 MB
- AUDIO: 100 MB

**Workflow:**
1. Call this endpoint to get signed URL
2. Upload file directly to S3 using the returned URL
3. Call /upload/confirm with the relativePath to create the reference
    `,
  })
  @ApiResponse({ status: HttpStatus.OK, type: GenerateUploadUrlResponseDto })
  @ApiBody({ type: GenerateReferenceUploadUrlDto })
  @HttpCode(HttpStatus.OK)
  async generateUploadUrl(
    @Body() dto: GenerateReferenceUploadUrlDto,
    @Request() req: any
  ): Promise<GenerateUploadUrlResponseDto> {
    return this.referenceService.generateUploadUrl(dto, req.user);
  }

  @Post('upload/confirm')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true, teacher: true })
  @ApiOperation({
    summary: 'Confirm S3 upload and create reference',
    description: 'Step 3 of S3 upload workflow. Call this after successfully uploading the file to S3.',
  })
  @ApiResponse({ status: HttpStatus.CREATED, type: HomeworkReferenceResponseDto })
  @ApiBody({ type: ConfirmReferenceUploadDto })
  @HttpCode(HttpStatus.CREATED)
  async confirmUpload(
    @Body() dto: ConfirmReferenceUploadDto,
    @Request() req: any
  ): Promise<HomeworkReferenceResponseDto> {
    return this.referenceService.confirmUpload(dto, req.user);
  }

  @Post('google-drive')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true, teacher: true })
  @ApiOperation({
    summary: 'Create reference from Google Drive',
    description: `
Link a file from Google Drive as a homework reference.

**Requirements:**
- User must have completed Google OAuth flow
- Access token must be provided
- File must be accessible by the user

**Workflow:**
1. Frontend initiates Google OAuth via GET /auth/google
2. User authorizes and frontend receives access token
3. Call this endpoint with the Drive file ID and access token
    `,
  })
  @ApiResponse({ status: HttpStatus.CREATED, type: HomeworkReferenceResponseDto })
  @ApiBody({ type: CreateHomeworkReferenceGoogleDriveDto })
  @HttpCode(HttpStatus.CREATED)
  async createFromGoogleDrive(
    @Body() dto: CreateHomeworkReferenceGoogleDriveDto,
    @Request() req: any
  ): Promise<HomeworkReferenceResponseDto> {
    return this.referenceService.createViaGoogleDrive(dto, req.user);
  }

  @Post('link')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true, teacher: true })
  @ApiOperation({
    summary: 'Create reference from external link',
    description: 'Create a reference with a manual URL (YouTube, website, etc.)',
  })
  @ApiResponse({ status: HttpStatus.CREATED, type: HomeworkReferenceResponseDto })
  @ApiBody({ type: CreateHomeworkReferenceLinkDto })
  @HttpCode(HttpStatus.CREATED)
  async createFromLink(
    @Body() dto: CreateHomeworkReferenceLinkDto,
    @Request() req: any
  ): Promise<HomeworkReferenceResponseDto> {
    return this.referenceService.createViaLink(dto, req.user);
  }

  // ========== READ OPERATIONS ==========

  @Get()
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ anyInstituteRole: true })
  @ApiOperation({
    summary: 'Get all references with filtering',
    description: 'Retrieve references with filtering by homework, type, source, and search.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: PaginatedHomeworkReferenceResponseDto })
  @ApiQuery({ name: 'homeworkId', required: false, description: 'Filter by homework ID' })
  @ApiQuery({ name: 'referenceType', required: false, enum: ['VIDEO', 'IMAGE', 'PDF', 'DOCUMENT', 'LINK', 'AUDIO', 'OTHER'] })
  @ApiQuery({ name: 'referenceSource', required: false, enum: ['S3_UPLOAD', 'GOOGLE_DRIVE', 'MANUAL_LINK'] })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  @ApiQuery({ name: 'search', required: false, description: 'Search in title and description' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiQuery({ name: 'sortBy', required: false, enum: ['displayOrder', 'title', 'createdAt', 'referenceType'] })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['ASC', 'DESC'] })
  @HttpCode(HttpStatus.OK)
  async findAll(
    @Query() query: QueryHomeworkReferenceDto,
    @Request() req: any
  ): Promise<PaginatedHomeworkReferenceResponseDto> {
    return this.referenceService.findAll(query, req.user);
  }

  @Get('homework/:homeworkId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ anyInstituteRole: true })
  @ApiOperation({
    summary: 'Get all references for a homework',
    description: 'Retrieve all active references for a specific homework assignment, ordered by displayOrder.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: [HomeworkReferenceResponseDto] })
  @ApiParam({ name: 'homeworkId', description: 'Homework ID' })
  @HttpCode(HttpStatus.OK)
  async findByHomework(
    @Param('homeworkId', ParseIdPipe) homeworkId: string,
    @Request() req: any
  ): Promise<HomeworkReferenceResponseDto[]> {
    return this.referenceService.findByHomeworkId(homeworkId, req.user);
  }

  @Get('homework/:homeworkId/summary')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ anyInstituteRole: true })
  @ApiOperation({
    summary: 'Get reference summary for a homework',
    description: 'Get count of references grouped by type and source.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: HomeworkReferenceSummaryDto })
  @ApiParam({ name: 'homeworkId', description: 'Homework ID' })
  @HttpCode(HttpStatus.OK)
  async getSummary(
    @Param('homeworkId', ParseIdPipe) homeworkId: string
  ): Promise<HomeworkReferenceSummaryDto> {
    return this.referenceService.getSummary(homeworkId);
  }

  @Get(':id')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ anyInstituteRole: true })
  @ApiOperation({
    summary: 'Get a single reference by ID',
    description: 'Retrieve detailed information about a specific reference.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: HomeworkReferenceResponseDto })
  @ApiParam({ name: 'id', description: 'Reference ID' })
  @HttpCode(HttpStatus.OK)
  async findOne(
    @Param('id', ParseIdPipe) id: string
  ): Promise<HomeworkReferenceResponseDto> {
    return this.referenceService.findOne(id);
  }

  // ========== UPDATE OPERATIONS ==========

  @Patch(':id')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true, teacher: true })
  @ApiOperation({
    summary: 'Update a reference',
    description: 'Update reference metadata (title, description, order, etc.). Cannot change source type.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: HomeworkReferenceResponseDto })
  @ApiParam({ name: 'id', description: 'Reference ID' })
  @ApiBody({ type: UpdateHomeworkReferenceDto })
  @HttpCode(HttpStatus.OK)
  async update(
    @Param('id', ParseIdPipe) id: string,
    @Body() updateDto: UpdateHomeworkReferenceDto,
    @Request() req: any
  ): Promise<HomeworkReferenceResponseDto> {
    return this.referenceService.update(id, updateDto, req.user);
  }

  @Patch('homework/:homeworkId/reorder')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true, teacher: true })
  @ApiOperation({
    summary: 'Reorder references for a homework',
    description: 'Update the display order of all references. Pass array of reference IDs in desired order.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: [HomeworkReferenceResponseDto] })
  @ApiParam({ name: 'homeworkId', description: 'Homework ID' })
  @ApiBody({ type: ReorderReferencesDto })
  @HttpCode(HttpStatus.OK)
  async reorder(
    @Param('homeworkId', ParseIdPipe) homeworkId: string,
    @Body() reorderDto: ReorderReferencesDto,
    @Request() req: any
  ): Promise<HomeworkReferenceResponseDto[]> {
    return this.referenceService.reorder(homeworkId, reorderDto, req.user);
  }

  // ========== DELETE OPERATIONS ==========

  @Delete(':id')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true, teacher: true })
  @ApiOperation({
    summary: 'Soft delete a reference',
    description: 'Mark reference as inactive (isActive = false). Can be restored later.',
  })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Reference soft deleted' })
  @ApiParam({ name: 'id', description: 'Reference ID' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async softDelete(
    @Param('id', ParseIdPipe) id: string,
    @Request() req: any
  ): Promise<void> {
    return this.referenceService.softDelete(id, req.user);
  }

  @Delete(':id/permanent')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({
    summary: 'Permanently delete a reference',
    description: 'Permanently delete the reference and associated S3 file. Cannot be undone. Institute Admin only.',
  })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Reference permanently deleted' })
  @ApiParam({ name: 'id', description: 'Reference ID' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async hardDelete(
    @Param('id', ParseIdPipe) id: string,
    @Request() req: any
  ): Promise<void> {
    return this.referenceService.hardDelete(id, req.user);
  }

  @Delete('bulk')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true, teacher: true })
  @ApiOperation({
    summary: 'Bulk soft delete references',
    description: 'Soft delete multiple references at once.',
  })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'References soft deleted' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        ids: { type: 'array', items: { type: 'string' }, example: ['1', '2', '3'] },
      },
    },
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  async bulkDelete(
    @Body('ids') ids: string[],
    @Request() req: any
  ): Promise<void> {
    return this.referenceService.bulkSoftDelete(ids, req.user);
  }

  @Patch(':id/restore')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true, teacher: true })
  @ApiOperation({
    summary: 'Restore a soft-deleted reference',
    description: 'Restore a previously soft-deleted reference (set isActive = true).',
  })
  @ApiResponse({ status: HttpStatus.OK, type: HomeworkReferenceResponseDto })
  @ApiParam({ name: 'id', description: 'Reference ID' })
  @HttpCode(HttpStatus.OK)
  async restore(
    @Param('id', ParseIdPipe) id: string,
    @Request() req: any
  ): Promise<HomeworkReferenceResponseDto> {
    return this.referenceService.restore(id, req.user);
  }
}

