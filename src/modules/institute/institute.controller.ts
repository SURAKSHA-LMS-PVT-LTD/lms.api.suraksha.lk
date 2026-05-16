import { ParseIdPipe } from '../../common/pipes/parse-id.pipe';
import { NoDataMasking } from '../../common/decorators/no-data-masking.decorator';
import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseInterceptors, ClassSerializerInterceptor, HttpStatus, ParseIntPipe, UseGuards, Put, Request, BadRequestException, ForbiddenException, Inject } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBearerAuth,
  ApiConsumes
} from '@nestjs/swagger';
import {
  JwtAuthGuard,
  FlexibleAccessGuard,
  RequireAnyOfRoles,
  UserType
} from '../../auth/guards';
import { DataSource } from 'typeorm';
import { InstitutesService } from './institute.service';
import { InstitueClassService } from '../institute_mudules/institue_class/institue_class.service';
import { CloudStorageService } from '../../common/services/cloud-storage.service';
import { JwtRequest } from '@common/interfaces/jwt-request.interface';
import {
  CreateInstituteDto,
  UpdateInstituteDto,
  InstituteResponseDto,
  InstituteQueryDto,
  PaginatedInstituteResponseDto
} from './dto/index.dto';
import { UpdateInstituteSettingsDto } from './dto/update-institute-settings.dto';
import { InstituteSettingsResponseDto, InstituteReportBrandingResponseDto, InstituteProfileResponseDto, InstitutePrintSettingsResponseDto, AddGalleryImageDto } from './dto/institute-settings.dto';
import { UpdateUserExtraDataSchemaDto } from './dto/update-user-extra-data-schema.dto';

@ApiTags('Institutes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('institutes')
@UseInterceptors(ClassSerializerInterceptor)
export class InstitutesController {
  constructor(
    private readonly institutesService: InstitutesService,
    private readonly institueClassService: InstitueClassService,
    private readonly dataSource: DataSource,
    private readonly cloudStorageService: CloudStorageService,
  ) {}

  @Post()
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
  @ApiOperation({ 
    summary: 'Create a new institute with image URLs (SUPERADMIN only)',
    description: 'Creates a new educational institute. Provide logoUrl, loadingGifUrl, imageUrl, imageUrls in the request body (from /upload/verify-and-publish).'
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Institute created successfully',
    type: InstituteResponseDto
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid input data'
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Institute with code or email already exists'
  })
  async create(
    @Body() createInstituteDto: CreateInstituteDto
  ): Promise<InstituteResponseDto> {
    // Check if institute with code/email exists
    await this.institutesService.checkConflicts(createInstituteDto);

    // Create institute with URL fields from DTO (logoUrl, loadingGifUrl, imageUrl, imageUrls)
    const result = await this.institutesService.create(
      createInstituteDto,
      createInstituteDto.imageUrl || null,
      createInstituteDto.imageUrls || null,
      createInstituteDto.logoUrl || null,
      createInstituteDto.loadingGifUrl || null
    );

    return new InstituteResponseDto(result);
  }

  @Get()
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
  @ApiOperation({
    summary: 'Get all institutes with pagination and filtering (SUPERADMIN only)',
    description: 'Retrieves a paginated list of institutes with optional filtering. Only accessible by SUPERADMIN.'
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Institutes retrieved successfully',
    type: PaginatedInstituteResponseDto
  })
  async findAll(@Query() query: InstituteQueryDto): Promise<PaginatedInstituteResponseDto> {
    return this.institutesService.findAll(query);
  }

  @Get(':id')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
  @ApiOperation({
    summary: 'Get institute by ID (SUPERADMIN only)',
    description: 'Retrieves a specific institute by its ID. Only accessible by SUPERADMIN.'
  })
  @ApiParam({
    name: 'id',
    description: 'Institute ID',
    example: '1'
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Institute found',
    type: InstituteResponseDto
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Institute not found'
  })
  async findOne(@Param('id', ParseIdPipe) id: string): Promise<InstituteResponseDto> {
    const institute = await this.institutesService.findOne(id);
    return new InstituteResponseDto(institute);
  }

  @Get('code/:code')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
  @ApiOperation({
    summary: 'Get institute by code (SUPERADMIN only)',
    description: 'Retrieves a specific institute by its unique code. Only accessible by SUPERADMIN.'
  })
  @ApiParam({
    name: 'code',
    description: 'Institute code',
    example: 'CIS001'
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Institute found',
    type: InstituteResponseDto
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Institute not found'
  })
  async findByCode(@Param('code') code: string): Promise<InstituteResponseDto> {
    const institute = await this.institutesService.findByCode(code);
    return new InstituteResponseDto(institute);
  }

  @Patch(':id')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({
    summary: 'Update institute with image URLs (Institute Admin or SUPERADMIN)',
    description: 'Updates institute. Provide logoUrl, loadingGifUrl, imageUrl, imageUrls in request body (from /upload/verify-and-publish).'
  })
  @ApiParam({
    name: 'id',
    description: 'Institute ID',
    example: '1'
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Institute updated successfully',
    type: InstituteResponseDto
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Institute not found'
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid input data'
  })
  async update(
    @Param('id', ParseIdPipe) id: string,
    @Body() updateInstituteDto: UpdateInstituteDto
  ): Promise<InstituteResponseDto> {
    // Update institute with URL fields from DTO (logoUrl, loadingGifUrl, imageUrl, imageUrls)
    const institute = await this.institutesService.update(
      id,
      updateInstituteDto,
      updateInstituteDto.imageUrl || null,
      updateInstituteDto.imageUrls || null,
      updateInstituteDto.logoUrl || null,
      updateInstituteDto.loadingGifUrl || null
    );
    return new InstituteResponseDto(institute);
  }

  @Delete(':id')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
  @ApiOperation({
    summary: 'Soft delete institute (SUPERADMIN only)',
    description: 'Soft deletes an institute (sets isActive to false). Only SUPERADMIN can delete institutes.'
  })
  @ApiParam({
    name: 'id',
    description: 'Institute ID',
    example: '1'
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Institute deleted successfully'
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Institute not found'
  })
  async remove(@Param('id', ParseIdPipe) id: string): Promise<{ message: string }> {
    await this.institutesService.remove(id);
    return { message: 'Institute deleted successfully' };
  }

  @Patch(':id/activate')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({
    summary: 'Activate institute (Institute Admin or SUPERADMIN)',
    description: 'Activates a previously deactivated institute. Requires institute admin access.'
  })
  @ApiParam({
    name: 'id',
    description: 'Institute ID',
    example: '1'
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Institute activated successfully',
    type: InstituteResponseDto
  })
  async activate(@Param('id', ParseIdPipe) id: string): Promise<InstituteResponseDto> {
    const institute = await this.institutesService.activate(id);
    return new InstituteResponseDto(institute);
  }

  @Patch(':id/deactivate')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({
    summary: 'Deactivate institute (Institute Admin or SUPERADMIN)',
    description: 'Deactivates an institute without deleting it. Requires institute admin access.'
  })
  @ApiParam({
    name: 'id',
    description: 'Institute ID',
    example: '1'
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Institute deactivated successfully',
    type: InstituteResponseDto
  })
  async deactivate(@Param('id', ParseIdPipe) id: string): Promise<InstituteResponseDto> {
    const institute = await this.institutesService.deactivate(id);
    return new InstituteResponseDto(institute);
  }

  @Get(':instituteId/classes')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true, teacher: true, student: { allowSelfOnly: true } })
  @ApiOperation({
    summary: 'Get all classes for an institute',
    description: 'Returns all classes belonging to the specified institute. Accessible by SUPERADMIN, Institute Admin, Teacher, or Student.'
  })
  @ApiParam({ name: 'instituteId', description: 'Institute ID', type: 'string' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Classes retrieved successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Institute not found',
  })
  async getInstituteClasses(
    @Param('instituteId', ParseIdPipe) instituteId: string,
  ) {
    return this.institueClassService.findByInstitute(instituteId);
  }

  @Put(':instituteId/classes/:classId/teacher/:teacherId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({ 
    summary: 'Assign teacher as main class teacher (Institute Admin or SUPERADMIN)',
    description: 'Assigns a teacher as the main class teacher. Only institute admins and system admins can perform this action.'
  })
  @ApiParam({ name: 'instituteId', description: 'Institute ID', type: 'string' })
  @ApiParam({ name: 'classId', description: 'Class ID', type: 'string' })
  @ApiParam({ name: 'teacherId', description: 'Teacher User ID', type: 'string' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Teacher successfully assigned as main class teacher',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'Teacher successfully assigned to class' },
        data: {
          type: 'object',
          properties: {
            classId: { type: 'string', example: '1' },
            className: { type: 'string', example: 'Grade 10 Science' },
            classCode: { type: 'string', example: 'G10SCI' },
            classTeacherId: { type: 'string', example: '123' },
            instituteId: { type: 'string', example: '1' },
            updatedAt: { type: 'string', format: 'date-time' }
          }
        }
      }
    }
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid request parameters or teacher not found'
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Access denied - only institute admins and system admins allowed'
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Class not found or teacher not found in institute'
  })
  async assignTeacherToClass(
    @Param('instituteId', ParseIdPipe) instituteId: string,
    @Param('classId', ParseIdPipe) classId: string,
    @Param('teacherId', ParseIdPipe) teacherId: string,
    @Request() req: JwtRequest
  ) {
    try {
      // Extract user information from JWT
      const currentUserId = req.user?.s;
      const adminInstituteIds = req.user?.i /* TODO: check institute admin role bitmask */ || [];

      if (!currentUserId) {
        throw new BadRequestException('Invalid authentication token');
      }

      // Access control will be handled by decorators

      // Validate input parameters
      if (!instituteId || isNaN(Number(instituteId))) {
        throw new BadRequestException('Invalid institute ID format');
      }

      if (!classId || isNaN(Number(classId))) {
        throw new BadRequestException('Invalid class ID format');
      }

      if (!teacherId || isNaN(Number(teacherId))) {
        throw new BadRequestException('Invalid teacher ID format');
      }

      // Verify that the class exists and belongs to the institute
      const classEntity = await this.institueClassService.findOne(classId);
      if (!classEntity) {
        throw new BadRequestException('Class not found');
      }

      if (classEntity.instituteId !== instituteId) {
        throw new BadRequestException('Class does not belong to the specified institute');
      }

      // Store previous teacher ID for cache refresh
      const previousTeacherId = classEntity.classTeacherId;

      // ✅ SECURITY FIX: Use TypeORM QueryBuilder instead of raw SQL (was vulnerable)
      const teacherResult = await this.dataSource
        .createQueryBuilder()
        .select([
          'u.id as id',
          'u.email as email',
          'u.firstName as firstName', 
          'u.lastName as lastName',
          'u.userType as userType',
          'u.isActive as isActive'
        ])
        .from('users', 'u')
        .innerJoin('institute_users', 'iu', 'u.id = iu.user_id')
        .where('u.id = :teacherId', { teacherId })
        .andWhere("u.userType = 'TEACHER'")
        .andWhere('u.isActive = true')
        .andWhere('iu.institute_id = :instituteId', { instituteId })
        .andWhere('iu.is_active = true')
        .limit(1)
        .getRawMany();
      
      if (teacherResult.length === 0) {
        throw new BadRequestException('Teacher not found or not enrolled in this institute');
      }

      const teacher = teacherResult[0];

      // ✅ SECURITY FIX: Use TypeORM update instead of raw SQL (was vulnerable)
      const updateResult = await this.dataSource
        .createQueryBuilder()
        .update('institute_classes')
        .set({ 
          classTeacherId: teacherId, 
          updatedAt: () => 'CURRENT_TIMESTAMP' 
        })
        .where('id = :classId', { classId })
        .andWhere('institute_id = :instituteId', { instituteId })
        .execute();

      if (updateResult.affected === 0) {
        throw new BadRequestException('Failed to assign teacher to class');
      }

      // Get updated class information
      const updatedClass = await this.institueClassService.findOne(classId);

      return {
        success: true,
        message: 'Teacher successfully assigned to class',
        data: {
          classId: updatedClass.id,
          className: updatedClass.name,
          classCode: updatedClass.code,
          classTeacherId: updatedClass.classTeacherId,
          instituteId: updatedClass.instituteId,
          teacherInfo: {
            id: teacher.id,
            email: teacher.email,
            firstName: teacher.firstName,
            lastName: teacher.lastName
          },
          updatedAt: updatedClass.updatedAt
        }
      };

    } catch (error) {
      if (error instanceof BadRequestException || error instanceof ForbiddenException) {
        throw error;
      }
      
      throw new BadRequestException(`Failed to assign teacher to class: ${error.message}`);
    }
  }

  // ═══════════════════════════════════════════════════
  // Institute Settings (Institute Admin)
  // ═══════════════════════════════════════════════════

  @Get(':id/settings')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({
    summary: 'Get institute settings (Institute Admin)',
    description: `Returns full institute settings for the admin settings page.
    All S3-stored images (logo, loading gif, gallery) are returned as full URLs.
    Includes branding, contact info, social media, vision/mission.`
  })
  @ApiParam({ name: 'id', description: 'Institute ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Institute settings', type: InstituteSettingsResponseDto })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Institute not found' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'No access to this institute' })
  async getSettings(
    @Param('id', ParseIdPipe) id: string,
    @Request() req: JwtRequest
  ): Promise<InstituteSettingsResponseDto> {
    return this.institutesService.getSettings(id, req.user);
  }

  @Get(':id/report-branding')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({
    summary: 'Get institute report branding as base64 data URLs',
    description: 'Returns the report header and footer banners as base64 data URLs so the frontend can embed them in generated PDFs without browser CORS.'
  })
  @ApiParam({ name: 'id', description: 'Institute ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Report branding', type: InstituteReportBrandingResponseDto })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Institute not found' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'No access to this institute' })
  async getReportBranding(
    @Param('id', ParseIdPipe) id: string,
    @Request() req: JwtRequest,
  ): Promise<InstituteReportBrandingResponseDto> {
    return this.institutesService.getReportBranding(id, req.user);
  }

  @Get(':id/print-settings')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true, teacher: true, student: true })
  @ApiOperation({
    summary: 'Get printer settings + header/footer images for receipt printing',
    description: 'Returns the institute printer config (default paper size, language, custom header/footer text) together with the report header and footer banner images as base64 data URLs — all in a single request for use by payment collection pages.',
  })
  @ApiParam({ name: 'id', description: 'Institute ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Print settings', type: InstitutePrintSettingsResponseDto })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Institute not found' })
  async getPrintSettings(
    @Param('id', ParseIdPipe) id: string,
  ): Promise<InstitutePrintSettingsResponseDto> {
    return this.institutesService.getPrintSettings(id);
  }

  @Patch(':id/settings')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({
    summary: 'Update institute settings (Institute Admin)',
    description: `Updates institute settings from the admin settings page.
    **S3 uploads:** Logo, loading GIF, gallery images accept S3 relative paths
    returned by \`/upload/verify-and-publish\`. The response returns full S3 URLs.
    **External links:** websiteUrl, facebookPageUrl, youtubeChannelUrl accept full URLs.
    **Restricted:** code, isDefault, isActive are NOT editable here (SUPERADMIN only).`
  })
  @ApiParam({ name: 'id', description: 'Institute ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Settings updated', type: InstituteSettingsResponseDto })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Institute not found' })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'Email already taken by another institute' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'No access to this institute' })
  async updateSettings(
    @Param('id', ParseIdPipe) id: string,
    @Body() dto: UpdateInstituteSettingsDto,
    @Request() req: JwtRequest
  ): Promise<InstituteSettingsResponseDto> {
    return this.institutesService.updateSettings(id, dto, req.user);
  }

  // ═══════════════════════════════════════════════════
  // Institute Image Management (dedicated endpoints)
  // ═══════════════════════════════════════════════════

  @Delete(':id/logo')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({
    summary: 'Delete institute logo (Institute Admin)',
    description: 'Permanently deletes the logo file from storage and clears the logoUrl field.',
  })
  @ApiParam({ name: 'id', description: 'Institute ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Logo deleted — returns updated settings', type: InstituteSettingsResponseDto })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Institute not found' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'No access to this institute' })
  async deleteLogo(
    @Param('id', ParseIdPipe) id: string,
    @Request() req: JwtRequest
  ): Promise<InstituteSettingsResponseDto> {
    return this.institutesService.deleteLogoImage(id, req.user);
  }

  @Delete(':id/loading-gif')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({
    summary: 'Delete institute loading GIF (Institute Admin)',
    description: 'Permanently deletes the loading GIF file from storage and clears the loadingGifUrl field.',
  })
  @ApiParam({ name: 'id', description: 'Institute ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Loading GIF deleted — returns updated settings', type: InstituteSettingsResponseDto })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Institute not found' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'No access to this institute' })
  async deleteLoadingGif(
    @Param('id', ParseIdPipe) id: string,
    @Request() req: JwtRequest
  ): Promise<InstituteSettingsResponseDto> {
    return this.institutesService.deleteLoadingGif(id, req.user);
  }

  @Delete(':id/cover-image')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({
    summary: 'Delete institute cover/banner image (Institute Admin)',
    description: 'Permanently deletes the cover image from storage and clears the imageUrl field.',
  })
  @ApiParam({ name: 'id', description: 'Institute ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Cover image deleted — returns updated settings', type: InstituteSettingsResponseDto })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Institute not found' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'No access to this institute' })
  async deleteCoverImage(
    @Param('id', ParseIdPipe) id: string,
    @Request() req: JwtRequest
  ): Promise<InstituteSettingsResponseDto> {
    return this.institutesService.deleteCoverImage(id, req.user);
  }

  @Post(':id/gallery')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({
    summary: 'Add image to gallery (Institute Admin)',
    description: `Adds a single image to the gallery array. Maximum 10 images.
    Upload the file via \`/upload/verify-and-publish\` first, then send the returned relative path here.`,
  })
  @ApiParam({ name: 'id', description: 'Institute ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Image added — returns updated settings', type: InstituteSettingsResponseDto })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Gallery full (max 10 images)' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Institute not found' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'No access to this institute' })
  async addGalleryImage(
    @Param('id', ParseIdPipe) id: string,
    @Body() dto: AddGalleryImageDto,
    @Request() req: JwtRequest
  ): Promise<InstituteSettingsResponseDto> {
    return this.institutesService.addGalleryImage(id, dto.relativePath, req.user);
  }

  @Delete(':id/gallery/:imageIndex')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({
    summary: 'Delete gallery image by index (Institute Admin)',
    description: 'Removes a gallery image by its 0-based index and permanently deletes the file from storage.',
  })
  @ApiParam({ name: 'id', description: 'Institute ID' })
  @ApiParam({ name: 'imageIndex', description: 'Zero-based index of the image in the gallery array' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Image deleted — returns updated settings', type: InstituteSettingsResponseDto })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid image index' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Institute not found' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'No access to this institute' })
  async deleteGalleryImage(
    @Param('id', ParseIdPipe) id: string,
    @Param('imageIndex', ParseIntPipe) imageIndex: number,
    @Request() req: JwtRequest
  ): Promise<InstituteSettingsResponseDto> {
    return this.institutesService.deleteGalleryImage(id, imageIndex, req.user);
  }

  // ═══════════════════════════════════════════════════
  // Institute Profile (All institute members — minimal view)
  // ═══════════════════════════════════════════════════

  @Get(':id/profile')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ anyInstituteRole: true })
  @NoDataMasking()
  @ApiOperation({
    summary: 'Get institute profile (all institute members)',
    description: `Returns a lightweight institute profile for teachers, students,
    attendance markers, and parents. Only shows identity info + branding +
    social media links — NOT gallery images, system contacts, or admin data.
    Ideal for a small beautiful card/header view.`
  })
  @ApiParam({ name: 'id', description: 'Institute ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Institute profile', type: InstituteProfileResponseDto })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Institute not found' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'No access to this institute' })
  async getProfile(
    @Param('id', ParseIdPipe) id: string,
    @Request() req: JwtRequest
  ): Promise<InstituteProfileResponseDto> {
    return this.institutesService.getProfile(id, req.user);
  }

  // ═══════════════════════════════════════════════════
  // User Extra Data Schema (Institute Admin)
  // ═══════════════════════════════════════════════════

  @Get(':id/user-extra-data-schema')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true, teacher: true })
  @ApiOperation({
    summary: 'Get custom user column schema (Admin/Teacher)',
    description: 'Returns the array of custom column definitions for institute user extra data. Empty array if not configured.',
  })
  @ApiParam({ name: 'id', description: 'Institute ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Schema array returned' })
  async getUserExtraDataSchema(
    @Param('id', ParseIdPipe) id: string,
    @Request() req: JwtRequest,
  ) {
    return this.institutesService.getUserExtraDataSchema(id, req.user);
  }

  @Patch(':id/user-extra-data-schema')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({
    summary: 'Update custom user column schema (Institute Admin only)',
    description: 'Replaces the institute-wide custom column definitions. Pass empty array to clear.',
  })
  @ApiParam({ name: 'id', description: 'Institute ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Schema updated' })
  async updateUserExtraDataSchema(
    @Param('id', ParseIdPipe) id: string,
    @Body() body: UpdateUserExtraDataSchemaDto,
    @Request() req: JwtRequest,
  ) {
    return this.institutesService.updateUserExtraDataSchema(id, body.schema ?? [], req.user);
  }
}

