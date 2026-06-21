import {
  Controller, Get, Post, Body, Patch, Param, Delete,
  Query, UseGuards, Request, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { FlexibleAccessGuard } from '../../../auth/guards/flexible-access.guard';
import { RequireAnyOfRoles } from '../../../auth/decorators/flexible-access.decorator';
import { ParseIdPipe } from '../../../common/pipes/parse-id.pipe';
import { UserType } from '../../user/enums/user-type.enum';
import { StudyMaterialsService } from './study_materials.service';
import { CreateStudyMaterialDto } from './dto/create-study-material.dto';
import { UpdateStudyMaterialDto } from './dto/update-study-material.dto';
import { QueryStudyMaterialDto } from './dto/query-study-material.dto';
import { CreateFolderDto, UpdateFolderDto } from './dto/create-folder.dto';

const ADMIN_ROLES = {
  global: [UserType.SUPERADMIN],
  instituteAdmin: true as const,
  teacher: {} as const,
};

@ApiTags('Study Materials')
@Controller('study-materials')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class StudyMaterialsController {
  constructor(private readonly service: StudyMaterialsService) {}

  // ── Folders ───────────────────────────────────────────────────────────────

  @Get('folders')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ anyInstituteRole: true })
  @ApiOperation({ summary: 'List folders for a class' })
  listFolders(@Query('instituteId') instituteId: string, @Query('classId') classId: string) {
    return this.service.listFolders(instituteId, classId);
  }

  @Post('folders')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles(ADMIN_ROLES)
  @ApiOperation({ summary: 'Create a folder' })
  createFolder(@Body() dto: CreateFolderDto, @Request() req: any) {
    return this.service.createFolder(dto, req.user);
  }

  @Patch('folders/:id')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles(ADMIN_ROLES)
  @ApiOperation({ summary: 'Update a folder' })
  updateFolder(
    @Param('id', ParseIdPipe) id: string,
    @Body() dto: UpdateFolderDto,
    @Request() req: any,
  ) {
    return this.service.updateFolder(id, dto, req.user);
  }

  @Delete('folders/:id')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles(ADMIN_ROLES)
  @ApiOperation({ summary: 'Delete a folder (materials moved to root)' })
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteFolder(@Param('id', ParseIdPipe) id: string, @Request() req: any) {
    return this.service.deleteFolder(id, req.user);
  }

  // ── Materials ─────────────────────────────────────────────────────────────

  @Post()
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles(ADMIN_ROLES)
  @ApiOperation({ summary: 'Create a study material' })
  create(@Body() dto: CreateStudyMaterialDto, @Request() req: any) {
    return this.service.create(dto, req.user);
  }

  @Get()
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ anyInstituteRole: true })
  @ApiOperation({ summary: 'List study materials with filters' })
  findAll(@Query() query: QueryStudyMaterialDto, @Request() req: any) {
    const u = req.user;
    const role = u?.role || u?.userType || '';
    const isAdminOrTeacher = ['Teacher', 'InstituteAdmin', 'SuperAdmin', 'SUPERADMIN'].includes(role);
    const userId = u?.s || u?.id || u?.userId;
    return this.service.findAll(query, isAdminOrTeacher, userId);
  }

  @Get(':id')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ anyInstituteRole: true })
  findOne(@Param('id', ParseIdPipe) id: string) {
    return this.service.findOne(id);
  }

  @Get(':id/check-access')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ anyInstituteRole: true })
  @ApiOperation({ summary: 'Check if current user can access a PAID_ONLY material' })
  checkAccess(@Param('id', ParseIdPipe) id: string, @Request() req: any) {
    const userId = req.user?.s || req.user?.id || req.user?.userId;
    return this.service.checkPaymentAccess(id, userId);
  }

  @Patch(':id')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles(ADMIN_ROLES)
  update(
    @Param('id', ParseIdPipe) id: string,
    @Body() dto: UpdateStudyMaterialDto,
    @Request() req: any,
  ) {
    return this.service.update(id, dto, req.user);
  }

  @Delete(':id')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles(ADMIN_ROLES)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseIdPipe) id: string, @Request() req: any) {
    return this.service.remove(id, req.user);
  }

  @Patch(':id/toggle-active')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles(ADMIN_ROLES)
  toggleActive(@Param('id', ParseIdPipe) id: string, @Request() req: any) {
    return this.service.toggleActive(id, req.user);
  }

  @Post('reorder')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles(ADMIN_ROLES)
  reorder(@Body() body: { ids: string[] }) {
    return this.service.reorder(body.ids);
  }
}
