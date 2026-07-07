import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Request,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { OrganizationService } from './organization.service';
import { 
  CreateOrganizationDto, 
  AssignInstituteDto,
  OrgVerifyUserDto,
  AssignUserRoleDto,
  ChangeUserRoleDto,
  RemoveUserDto,
  TransferPresidencyDto,
  OrganizationAssignUserToInstituteDto,
  BulkAssignUsersToInstituteDto
} from './dto/organization.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';
import {
  JwtAuthGuard,
  FlexibleAccessGuard,
  RequireAnyOfRoles,
  UserType
} from '../../auth/guards';
import { CloudStorageService } from '../../common/services/cloud-storage.service';

@ApiTags('Organizations')
@Controller('organizations')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class OrganizationController {
  constructor(
    private readonly organizationService: OrganizationService,
    private readonly cloudStorageService: CloudStorageService,
  ) {}

  @Post()
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({ 
    summary: 'Create a new organization (SUPERADMIN or Institute Admin)',
    description: 'Creates a new organization. Institute Admins must provide instituteId. Provide imageUrl from /upload/verify-and-publish endpoint.'
  })
  @ApiConsumes('application/json')
  @ApiResponse({ status: 201, description: 'Organization created successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 403, description: 'Forbidden - SUPERADMIN or Institute Admin required' })
  async createOrganization(
    @Body() createDto: CreateOrganizationDto,
    @Request() req,
  ) {
    // Create organization with imageUrl already in DTO (from signed URL upload)
    const organization = await this.organizationService.createOrganization(createDto, req.user);
    return organization;
  }

  @Get()
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN, UserType.ORGANIZATION_MANAGER] })
  @ApiOperation({ summary: 'Get all organizations with pagination (System Admin)' })
  @ApiResponse({ status: 200, description: 'List of organizations with pagination metadata' })
  async getOrganizations(
    @Query() pagination: PaginationDto,
    @Request() req,
    @Query('instituteId') queryInstituteId?: string
  ) {
    // JWT v2: Extract userId properly
    const userId = req.user.s;
    
    // Institute ID is optional for this endpoint (can list all orgs)
    const instituteId = queryInstituteId;

    return this.organizationService.getOrganizations(
      userId,
      pagination,
      req.user
    );
  }

  @Put(':id/upload-image')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
  @ApiOperation({
    summary: 'Upload/update organization image (SUPERADMIN only)',
    description: 'Updates organization image. Provide imageUrl from /upload/verify-and-publish.'
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        imageUrl: { type: 'string', description: 'Image URL from /upload/verify-and-publish' },
      },
      required: ['imageUrl'],
    },
  })
  @ApiResponse({ status: 200, description: 'Organization image updated successfully' })
  @ApiResponse({ status: 400, description: 'Bad request - imageUrl required' })
  @ApiResponse({ status: 404, description: 'Organization not found' })
  async uploadOrganizationImage(
    @Param('id') organizationId: string,
    @Body('imageUrl') imageUrl: string,
    @Request() req,
  ) {
    if (!imageUrl) {
      throw new BadRequestException('Image URL is required');
    }
    
    return this.organizationService.updateOrganizationImage(organizationId, imageUrl, req.user);
  }  @Get('institute/:instituteId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({ summary: 'Get organizations by institute ID (Institute Admin OR System Admin)' })
  @ApiResponse({ status: 200, description: 'List of organizations for the specified institute' })
  async getOrganizationsByInstitute(
    @Param('instituteId') instituteId: string,
    @Query() pagination: PaginationDto,
    @Request() req,
  ) {
    const userId = req.user.s;  // JWT v2: Extract user ID
    
    return this.organizationService.getOrganizationsByInstitute(
      instituteId,
      userId,
      pagination
    );
  }
  
  @Get('institute/:instituteId/student/:studentId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({ summary: "Get organizations a student is enrolled in within an institute (Institute Admin or System Admin)" })
  @ApiResponse({ status: 200, description: 'List of organizations the student is enrolled in for the institute' })
  async getStudentOrganizationsByInstitute(
    @Param('instituteId') instituteId: string,
    @Param('studentId') studentId: string,
    @Request() req,
  ) {
    const requestingUserId = req.user.s;

    return this.organizationService.getStudentOrganizations(instituteId, studentId, requestingUserId);
  }

  @Get('institute/:instituteId/members')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({ 
    summary: "Get all organization members in an institute (Institute Admin or System Admin)",
    description: "Returns all organization members for organizations in the institute. Optional studentId query param to filter by specific student."
  })
  @ApiResponse({ status: 200, description: 'List of organization members with their organization details' })
  async getInstituteOrganizationMembers(
    @Param('instituteId') instituteId: string,
    @Query('studentId') studentId: string,
    @Query() pagination: PaginationDto,
    @Request() req,
  ) {
    const requestingUserId = req.user.s;

    return this.organizationService.getInstituteOrganizationMembers(
      instituteId, 
      studentId, 
      pagination,
      requestingUserId
    );
  }

  @Get('institute/:instituteId/organization/:organizationId/students')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({ 
    summary: "Get all organization members with their roles (Institute Admin or Super Admin only)",
    description: "Returns all members enrolled in the specified organization including presidents, moderators, and members. Shows both their institute user type (STUDENT, TEACHER, etc.) and organization role (PRESIDENT, MODERATOR, MEMBER). Validates that the organization belongs to the institute. Only returns ACTIVE users."
  })
  @ApiResponse({ status: 200, description: 'Paginated list of organization members with their details and roles' })
  @ApiResponse({ status: 404, description: 'Institute or organization not found' })
  async getOrganizationStudentsByInstitute(
    @Param('instituteId') instituteId: string,
    @Param('organizationId') organizationId: string,
    @Query() pagination: PaginationDto,
    @Request() req,
  ) {
    const requestingUserId = req.user.s;

    return this.organizationService.getOrganizationStudentsByInstitute(
      instituteId,
      organizationId,
      pagination,
      requestingUserId
    );
  }

  @Post(':id/assign-institute')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
  @ApiOperation({ summary: 'Assign organization to institute (SUPERADMIN only)' })
  @ApiResponse({ status: 200, description: 'Organization assigned to institute successfully' })
  async assignToInstitute(
    @Param('id') organizationId: string,
    @Body() assignDto: AssignInstituteDto,
    @Request() req,
  ) {
    const userId = req.user.s;  // JWT v2: Extract user ID
    
    return this.organizationService.assignToInstitute(organizationId, assignDto, userId);
  }

  @Delete(':id/remove-institute')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
  @ApiOperation({ summary: 'Remove organization from institute (SUPERADMIN only)' })
  @ApiResponse({ status: 200, description: 'Organization removed from institute successfully' })
  async removeFromInstitute(
    @Param('id') organizationId: string,
    @Request() req,
  ) {
    const userId = req.user.s;  // JWT v2: Extract user ID
    
    return this.organizationService.removeFromInstitute(organizationId, userId);
  }

  @Delete(':id')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN, UserType.ORGANIZATION_MANAGER],
    anyInstituteRole: true
  })
  @ApiOperation({ summary: 'Delete organization (SUPERADMIN/ORG_MANAGER or PRESIDENT)' })
  @ApiResponse({ status: 200, description: 'Organization deleted successfully' })
  async deleteOrganization(
    @Param('id') organizationId: string,
    @Request() req,
  ) {
    return this.organizationService.deleteOrganization(organizationId, req.user);
  }

  @Get('available-institutes')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN, UserType.ORGANIZATION_MANAGER] })
  @ApiOperation({ summary: 'Get available institutes for assignment (Global access only)' })
  @ApiResponse({ status: 200, description: 'List of available institutes' })
  async getAvailableInstitutes(
    @Query() pagination: PaginationDto,
  ) {
    return this.organizationService.getAvailableInstitutes(pagination);
  }

  @Get(':id/enrollment-key')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({ 
    summary: '🔑 Get organization enrollment key (SUPERADMIN or Institute Admin)',
    description: `Returns the enrollment key for the organization. 
    
    **Access Control:**
    - SUPERADMIN: Can view any organization's enrollment key
    - Institute Admin: Can view enrollment keys for organizations in their institute
    
    **Response:**
    - organizationId: Organization ID
    - organizationName: Organization name
    - isPublic: Whether organization is public (no key needed)
    - enrollmentKey: The enrollment key (null if public or not set)`
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Enrollment key retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        organizationId: { type: 'string', example: '123' },
        organizationName: { type: 'string', example: 'Environmental Club' },
        isPublic: { type: 'boolean', example: false },
        enrollmentKey: { type: 'string', nullable: true, example: 'SECRET123' }
      }
    }
  })
  @ApiResponse({ status: 403, description: 'Forbidden - SUPERADMIN or Institute Admin required' })
  @ApiResponse({ status: 404, description: 'Organization not found' })
  async getOrganizationEnrollmentKey(
    @Param('id') organizationId: string,
    @Request() req,
  ) {
    const userId = req.user.s;  // JWT v2: Extract user ID
    
    return this.organizationService.getOrganizationEnrollmentKey(
      organizationId,
      userId,
      req.user
    );
  }

  @Get(':id/members')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN, UserType.ORGANIZATION_MANAGER],
    instituteAdmin: true
  })
  @ApiOperation({ summary: 'Get verified organization members (SUPERADMIN, ORG_MANAGER, or Institute Admin)' })
  @ApiResponse({ status: 200, description: 'List of verified members' })
  async getOrganizationMembers(
    @Param('id') organizationId: string,
    @Query() pagination: PaginationDto,
    @Request() req,
  ) {
    const userId = req.user.s;  // JWT v2: Extract user ID
    
    return this.organizationService.getOrganizationMembers(organizationId, pagination, userId);
  }

  @Get(':id/unverified-members')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN, UserType.ORGANIZATION_MANAGER],
    instituteAdmin: true
  })
  @ApiOperation({ summary: 'Get unverified organization members (SUPERADMIN, ORG_MANAGER, or Institute Admin)' })
  @ApiResponse({ status: 200, description: 'List of unverified members' })
  async getUnverifiedMembers(
    @Param('id') organizationId: string,
    @Query() pagination: PaginationDto,
    @Request() req,
  ) {
    const userId = req.user.s;  // JWT v2: Extract user ID
    
    return this.organizationService.getUnverifiedMembers(organizationId, pagination, userId);
  }

  @Put(':id/verify')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN, UserType.ORGANIZATION_MANAGER],
    instituteAdmin: true
  })
  @ApiOperation({ summary: 'Verify or reject organization member (SUPERADMIN, ORG_MANAGER, or Institute Admin)' })
  @ApiResponse({ status: 200, description: 'Member verification status updated successfully' })
  async verifyUser(
    @Param('id') organizationId: string,
    @Body() verifyDto: OrgVerifyUserDto,
    @Request() req,
  ) {
    const userId = req.user.s;

    return this.organizationService.verifyUser(organizationId, verifyDto, userId);
  }

  @Post(':id/assign-role')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN, UserType.ORGANIZATION_MANAGER],
    instituteAdmin: true
  })
  @ApiOperation({ summary: 'Assign role to user in organization (SUPERADMIN, ORG_MANAGER, or Institute Admin)' })
  @ApiResponse({ status: 200, description: 'Role assigned successfully' })
  async assignUserRole(
    @Param('id') organizationId: string,
    @Body() assignDto: AssignUserRoleDto,
    @Request() req,
  ) {
    const userId = req.user.s;  // JWT v2: Extract user ID
    
    return this.organizationService.assignUserRole(organizationId, assignDto, userId);
  }

  @Post('add-institute-user/:organizationId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN, UserType.ORGANIZATION_MANAGER],
    instituteAdmin: true
  })
  @ApiOperation({ 
    summary: 'Add institute user to organization (Institute Admin)',
    description: 'Allows Institute Admins to add users from their institute to an organization with auto-verification'
  })
  @ApiResponse({ status: 201, description: 'User added to organization successfully' })
  @ApiResponse({ status: 400, description: 'User already a member or invalid data' })
  @ApiResponse({ status: 404, description: 'Organization or user not found' })
  async addInstituteUserToOrganization(
    @Param('organizationId') organizationId: string,
    @Body() body: { userId: string; role?: string },
    @Request() req,
  ) {
    const requestingUserId = req.user.s;  // JWT v2: Extract user ID
    
    return this.organizationService.addInstituteUserToOrganization(
      organizationId,
      body.userId,
      requestingUserId,
      body.role || 'MEMBER'
    );
  }

  @Put(':id/change-role')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN, UserType.ORGANIZATION_MANAGER],
    instituteAdmin: true
  })
  @ApiOperation({ summary: 'Change user role in organization (SUPERADMIN, ORG_MANAGER, or Institute Admin)' })
  @ApiResponse({ status: 200, description: 'Role changed successfully' })
  async changeUserRole(
    @Param('id') organizationId: string,
    @Body() changeDto: ChangeUserRoleDto,
    @Request() req,
  ) {
    const userId = req.user.s;  // JWT v2: Extract user ID
    
    return this.organizationService.changeUserRole(organizationId, changeDto, userId);
  }

  @Delete(':id/remove-user')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN, UserType.ORGANIZATION_MANAGER],
    instituteAdmin: true
  })
  @ApiOperation({ summary: 'Remove user from organization (SUPERADMIN, ORG_MANAGER, or Institute Admin)' })
  @ApiResponse({ status: 200, description: 'User removed successfully' })
  async removeUser(
    @Param('id') organizationId: string,
    @Body() removeDto: RemoveUserDto,
    @Request() req,
  ) {
    const userId = req.user.s;  // JWT v2: Extract user ID
    
    return this.organizationService.removeUserFromOrganization(organizationId, removeDto, userId);
  }

  @Delete(':id/leave')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ anyInstituteRole: true })
  @ApiOperation({ summary: 'Leave organization as current user' })
  @ApiResponse({ status: 200, description: 'Left organization successfully' })
  async leaveOrganization(
    @Param('id') organizationId: string,
    @Request() req,
  ) {
    const userId = req.user.s;
    return this.organizationService.leaveOrganization(organizationId, userId);
  }

  @Post(':id/transfer-presidency')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN, UserType.ORGANIZATION_MANAGER],
    instituteAdmin: true
  })
  @ApiOperation({ summary: 'Transfer presidency to another user (SUPERADMIN, ORG_MANAGER, or Institute Admin)' })
  @ApiResponse({ status: 200, description: 'Presidency transferred successfully' })
  async transferPresidency(
    @Param('id') organizationId: string,
    @Body() transferDto: TransferPresidencyDto,
    @Request() req,
  ) {
    const userId = req.user.s;  // JWT v2: Extract user ID
    
    return this.organizationService.transferPresidency(organizationId, transferDto.newPresidentUserId, userId);
  }

  @Post(':id/assign-user-to-institute')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN, UserType.ORGANIZATION_MANAGER],
    instituteAdmin: true
  })
  @ApiOperation({ 
    summary: 'Assign organization member to institute (Organization Admin)',
    description: 'Allows organization admins to assign verified members to institutes. Admin assignment = auto-verified.'
  })
  @ApiResponse({ status: 200, description: 'User assigned to institute successfully' })
  @ApiResponse({ status: 400, description: 'User not a member of organization or already assigned' })
  @ApiResponse({ status: 404, description: 'Organization, user, or institute not found' })
  async assignUserToInstitute(
    @Param('id') organizationId: string,
    @Body() assignDto: OrganizationAssignUserToInstituteDto,
    @Request() req,
  ) {
    const userId = req.user.s;  // JWT v2: Extract user ID
    
    return this.organizationService.assignUserToInstitute(organizationId, assignDto, userId);
  }

  @Post(':id/bulk-assign-to-institute')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN, UserType.ORGANIZATION_MANAGER],
    instituteAdmin: true
  })
  @ApiOperation({ 
    summary: 'Bulk assign organization members to institute (Organization Admin)',
    description: 'Assign multiple verified organization members to an institute at once. Returns detailed results for each user.'
  })
  @ApiResponse({ status: 200, description: 'Bulk assignment completed with detailed results' })
  @ApiResponse({ status: 400, description: 'Invalid request or institute inactive' })
  @ApiResponse({ status: 404, description: 'Organization or institute not found' })
  async bulkAssignUsersToInstitute(
    @Param('id') organizationId: string,
    @Body() bulkAssignDto: BulkAssignUsersToInstituteDto,
    @Request() req,
  ) {
    const userId = req.user.s;  // JWT v2: Extract user ID
    
    return this.organizationService.bulkAssignUsersToInstitute(organizationId, bulkAssignDto, userId);
  }

  @Get(':id/eligible-members/:instituteId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN, UserType.ORGANIZATION_MANAGER],
    instituteAdmin: true
  })
  @ApiOperation({ 
    summary: 'Get organization members eligible for institute assignment',
    description: 'Returns verified organization members who are NOT yet assigned to the specified institute'
  })
  @ApiResponse({ status: 200, description: 'List of eligible members' })
  async getEligibleMembersForInstitute(
    @Param('id') organizationId: string,
    @Param('instituteId') instituteId: string,
    @Query() pagination: PaginationDto,
  ) {
    return this.organizationService.getEligibleMembersForInstitute(organizationId, instituteId, pagination);
  }
}

