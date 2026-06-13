import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { FlexibleAccessGuard } from '../../../auth/guards/flexible-access.guard';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { RequireAnyOfRoles } from '../../../auth/decorators/flexible-access.decorator';
import { UserType } from '../../user/enums/user-type.enum';
import { ParseBigIntPipe } from '../../../common/pipes/parse-bigint.pipe';
import { PackageDefinitionService } from '../services/package-definition.service';
import { CreatePackageDefinitionDto, UpdatePackageDefinitionDto, PackageDefinitionResponseDto } from '../dto/package-definition.dto';

@ApiTags('Package Definitions')
@Controller('package-definitions')
export class PackageDefinitionController {
  constructor(private readonly service: PackageDefinitionService) {}

  // ─── Public: any authenticated user can browse active packages ───────────

  @Get('active')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List active packages (any authenticated user)' })
  @ApiResponse({ status: 200, type: [PackageDefinitionResponseDto] })
  async findActive(): Promise<PackageDefinitionResponseDto[]> {
    return this.service.findActive();
  }

  // ─── System admin CRUD ────────────────────────────────────────────────────

  @Get()
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List all packages (SUPERADMIN)' })
  @ApiResponse({ status: 200, type: [PackageDefinitionResponseDto] })
  async findAll(): Promise<PackageDefinitionResponseDto[]> {
    return this.service.findAll();
  }

  @Post()
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create package definition (SUPERADMIN)' })
  @ApiResponse({ status: 201, type: PackageDefinitionResponseDto })
  async create(@Body() dto: CreatePackageDefinitionDto): Promise<PackageDefinitionResponseDto> {
    return this.service.create(dto);
  }

  @Get(':id')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get package definition by ID (SUPERADMIN)' })
  @ApiResponse({ status: 200, type: PackageDefinitionResponseDto })
  async findOne(@Param('id', ParseBigIntPipe) id: string): Promise<PackageDefinitionResponseDto> {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update package definition (SUPERADMIN)' })
  @ApiResponse({ status: 200, type: PackageDefinitionResponseDto })
  async update(
    @Param('id', ParseBigIntPipe) id: string,
    @Body() dto: UpdatePackageDefinitionDto,
  ): Promise<PackageDefinitionResponseDto> {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete package definition (SUPERADMIN)' })
  @ApiResponse({ status: 200 })
  async remove(@Param('id', ParseBigIntPipe) id: string): Promise<{ success: boolean }> {
    await this.service.remove(id);
    return { success: true };
  }
}
