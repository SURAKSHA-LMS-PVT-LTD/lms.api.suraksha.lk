import {
  Controller, Get, Post, Patch, Delete,
  Param, Query, Body, Request,
  UseGuards, ParseIntPipe, DefaultValuePipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { FlexibleAccessGuard } from '../../auth/guards/flexible-access.guard';
import { RequireAnyOfRoles } from '../../auth/decorators/flexible-access.decorator';
import { UserType } from '../user/enums/user-type.enum';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';
import { UserTypesService } from './services/user-types.service';
import { FeaturePermissionsService } from './services/feature-permissions.service';
import { RbacContextService } from './services/rbac-context.service';
import {
  CreateUserTypeDto,
  UpdateUserTypeDto,
  BulkUpdatePermissionsDto,
  UserTypeResponseDto,
  FeaturePermissionDto,
  MyRbacContextDto,
  UserTypeMembersResponseDto,
} from './dto/rbac.dto';

@ApiTags('RBAC')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class RbacController {
  constructor(
    private readonly userTypesService: UserTypesService,
    private readonly permissionsService: FeaturePermissionsService,
    private readonly contextService: RbacContextService,
  ) {}

  // ── My Context ─────────────────────────────────────────────────────────────

  @Get('institutes/:instituteId/my-context')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ anyInstituteRole: true })
  @ApiOperation({ summary: 'Get RBAC context (user type + permission matrix) for calling user' })
  @ApiResponse({ status: 200, type: MyRbacContextDto })
  async getMyContext(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Request() req: any,
  ): Promise<MyRbacContextDto> {
    const userId = req.user?.userId ?? req.user?.sub ?? req.user?.id;
    const legacyType = req.user?.instituteUserType ?? req.user?.iuType;
    return this.contextService.getMyContext(instituteId, String(userId), legacyType);
  }

  // ── User Types CRUD ────────────────────────────────────────────────────────

  @Get('institutes/:instituteId/user-types')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ anyInstituteRole: true })
  @ApiOperation({ summary: 'List all user types for an institute' })
  @ApiResponse({ status: 200, type: [UserTypeResponseDto] })
  async listUserTypes(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
  ): Promise<UserTypeResponseDto[]> {
    return this.userTypesService.list(instituteId);
  }

  // Also expose at /user-types/institute/:id — matches existing frontend API path
  @Get('user-types/institute/:instituteId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ anyInstituteRole: true })
  @ApiOperation({ summary: 'List user types (alternate path for frontend compatibility)' })
  async listUserTypesAlt(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
  ): Promise<UserTypeResponseDto[]> {
    return this.userTypesService.list(instituteId);
  }

  // Frontend userTypesApi.create calls POST /user-types/institute/:id
  @Post('user-types/institute/:instituteId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({ summary: 'Create a custom user type (alternate path)' })
  @ApiResponse({ status: 201, type: UserTypeResponseDto })
  async createUserTypeAlt(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Body() dto: CreateUserTypeDto,
  ): Promise<UserTypeResponseDto> {
    return this.userTypesService.create(instituteId, dto);
  }

  @Get('user-types/:id')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ anyInstituteRole: true })
  @ApiOperation({ summary: 'Get single user type by ID' })
  @ApiResponse({ status: 200, type: UserTypeResponseDto })
  async getUserType(
    @Param('id', ParseBigIntPipe) id: string,
    @Request() req: any,
  ): Promise<UserTypeResponseDto> {
    // We don't have instituteId in this route — derive from the entity itself
    // service will validate ownership
    const instituteId = req.user?.currentInstituteId ?? req.user?.instituteId ?? '0';
    return this.userTypesService.getById(instituteId, id);
  }

  @Post('institutes/:instituteId/user-types')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({ summary: 'Create a custom user type' })
  @ApiResponse({ status: 201, type: UserTypeResponseDto })
  async createUserType(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Body() dto: CreateUserTypeDto,
  ): Promise<UserTypeResponseDto> {
    return this.userTypesService.create(instituteId, dto);
  }

  @Patch('institutes/:instituteId/user-types/:typeId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({ summary: 'Update a user type' })
  @ApiResponse({ status: 200, type: UserTypeResponseDto })
  async updateUserType(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Param('typeId', ParseBigIntPipe) typeId: string,
    @Body() dto: UpdateUserTypeDto,
  ): Promise<UserTypeResponseDto> {
    return this.userTypesService.update(instituteId, typeId, dto);
  }

  // Also support /user-types/:id PATCH (frontend uses this path)
  @Patch('user-types/:id')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({ summary: 'Update user type (alternate path)' })
  async updateUserTypeAlt(
    @Param('id', ParseBigIntPipe) id: string,
    @Body() dto: UpdateUserTypeDto,
    @Request() req: any,
  ): Promise<UserTypeResponseDto> {
    const instituteId = req.user?.currentInstituteId ?? req.user?.instituteId ?? '0';
    return this.userTypesService.update(instituteId, id, dto);
  }

  @Delete('institutes/:instituteId/user-types/:typeId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({ summary: 'Delete (soft) a custom user type' })
  async removeUserType(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Param('typeId', ParseBigIntPipe) typeId: string,
  ): Promise<{ success: boolean }> {
    await this.userTypesService.remove(instituteId, typeId);
    return { success: true };
  }

  // Also /user-types/:id DELETE
  @Delete('user-types/:id')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({ summary: 'Delete user type (alternate path)' })
  async removeUserTypeAlt(
    @Param('id', ParseBigIntPipe) id: string,
    @Request() req: any,
  ): Promise<{ success: boolean }> {
    const instituteId = req.user?.currentInstituteId ?? req.user?.instituteId ?? '0';
    await this.userTypesService.remove(instituteId, id);
    return { success: true };
  }

  // ── Permissions ────────────────────────────────────────────────────────────

  @Get('institutes/:instituteId/user-types/:typeId/permissions')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({ summary: 'Get permission matrix for a user type' })
  @ApiResponse({ status: 200, type: [FeaturePermissionDto] })
  async getPermissions(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Param('typeId', ParseBigIntPipe) typeId: string,
  ): Promise<FeaturePermissionDto[]> {
    return this.permissionsService.listForUserType(instituteId, typeId);
  }

  @Patch('institutes/:instituteId/user-types/:typeId/permissions')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({ summary: 'Bulk-update the permission matrix for a user type' })
  async updatePermissions(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Param('typeId', ParseBigIntPipe) typeId: string,
    @Body() dto: BulkUpdatePermissionsDto,
  ): Promise<{ success: boolean }> {
    await this.permissionsService.bulkUpdate(instituteId, typeId, dto);
    return { success: true };
  }

  // ── Members ────────────────────────────────────────────────────────────────

  @Get('institutes/:instituteId/user-types/:typeId/members')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({ summary: 'List members of a user type' })
  @ApiResponse({ status: 200, type: UserTypeMembersResponseDto })
  async getMembers(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Param('typeId', ParseBigIntPipe) typeId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('search') search?: string,
  ): Promise<UserTypeMembersResponseDto> {
    return this.contextService.getUserTypeMembers(instituteId, typeId, {
      page,
      limit: Math.min(limit, 50),
      search,
    });
  }
}
