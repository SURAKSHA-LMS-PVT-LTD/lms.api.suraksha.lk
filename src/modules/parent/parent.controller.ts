import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';
import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseInterceptors, ClassSerializerInterceptor, HttpCode, HttpStatus, BadRequestException, UseGuards } from '@nestjs/common';
import { CloudStorageService } from '../../common/services/cloud-storage.service';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiConsumes, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { FlexibleAccessGuard } from '../../auth/guards/flexible-access.guard';
import { RequireAnyOfRoles } from '../../auth/decorators/flexible-access.decorator';
import { ParentsService } from '../parent/parent.service';
import { CreateParentDto } from './dto/create-parent.dto';
import { UpdateParentDto } from './dto/update-parent.dto';
import { QueryParentDto } from './dto/query-parent.dto';
import { ParentResponseDto } from './dto/parent-response.dto';
import { PaginatedParentResponseDto } from './dto/paginated-parent-response.dto';
import { ParentChildrenResponseDto } from './dto/parent-children-response.dto';
import { UserType } from '../user/enums/user-type.enum';

@ApiTags('parents')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('parents')
@UseInterceptors(ClassSerializerInterceptor)
export class ParentsController {
  constructor(
    private readonly parentsService: ParentsService,
    private readonly cloudStorageService: CloudStorageService
  ) {}

  // ❌ REMOVED: POST /parents - Use POST /user/comprehensive with userType: USER_WITHOUT_STUDENT instead
  // Comprehensive user creation handles parent creation with all related tables (users, parents)

  @Get()
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ 
    global: [UserType.SUPERADMIN], 
    instituteAdmin: true,
    teacher: true
  })
  @ApiOperation({ summary: 'Get all parents with filtering and pagination' })
  @ApiResponse({ status: 200, description: 'Parents retrieved successfully', type: PaginatedParentResponseDto })
  async findAll(@Query() query: QueryParentDto): Promise<PaginatedParentResponseDto> {
    return await this.parentsService.findAll(query);
  }

  @Get(':userId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ 
    global: [UserType.SUPERADMIN, UserType.USER ,UserType.USER_WITHOUT_STUDENT],
    parent: true,
    teacher: true,
    instituteAdmin: true
  })
  @ApiOperation({ 
    summary: 'Get parent by user ID',
    description: `Get parent information by user ID.
    
    **Access Control:**
    - SUPERADMIN: Can view any parent
    - USER_WITHOUT_STUDENT (Parents): Can view their own data only
    - Teachers/Admins: Can view parents through institute access`
  })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'Parent retrieved successfully', type: ParentResponseDto })
  @ApiResponse({ status: 404, description: 'Parent not found' })
  async findOne(@Param('userId', ParseBigIntPipe) userId: string): Promise<ParentResponseDto> {
    return await this.parentsService.findOne(userId);
  }

  @Get(':userId/children')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ 
    global: [UserType.SUPERADMIN,UserType.USER, UserType.USER_WITHOUT_STUDENT],
    parent: true,
    teacher: true,
    instituteAdmin: true
  })
  @ApiOperation({ 
    summary: 'Get parent with their children (simplified)',
    description: `Returns essential, non-sensitive information about parent and their children including ID, name, phone number, and relationship.
    
    **Access Control:**
    - SUPERADMIN: Can view any parent's children
    - USER_WITHOUT_STUDENT (Parents): Can view their own children only
    - Teachers/Admins: Can view children through institute access`
  })
  @ApiParam({ name: 'userId', description: 'Parent User ID' })
  @ApiResponse({ 
    status: 200, 
    description: 'Parent and children retrieved successfully',
    type: ParentChildrenResponseDto
  })
  @ApiResponse({ status: 404, description: 'Parent not found' })
  async findParentChildren(@Param('userId', ParseBigIntPipe) userId: string): Promise<ParentChildrenResponseDto> {
    return await this.parentsService.findParentChildren(userId);
  }

  @Patch(':userId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ 
    global: [UserType.SUPERADMIN], 
    instituteAdmin: true 
  })
  @ApiOperation({ summary: 'Update parent information' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'Parent updated successfully', type: ParentResponseDto })
  @ApiResponse({ status: 404, description: 'Parent not found' })
  async update(
    @Param('userId', ParseBigIntPipe) userId: string,
    @Body() updateParentDto: UpdateParentDto): Promise<ParentResponseDto> {
    return await this.parentsService.update(userId, updateParentDto);
  }

  @Delete(':userId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ 
    global: [UserType.SUPERADMIN]
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Permanently delete parent and associated user' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiResponse({ status: 204, description: 'Parent deleted successfully' })
  @ApiResponse({ status: 404, description: 'Parent not found' })
  async remove(@Param('userId', ParseBigIntPipe) userId: string): Promise<void> {
    await this.parentsService.remove(userId);
  }

  @Patch(':userId/deactivate')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ 
    global: [UserType.SUPERADMIN], 
    instituteAdmin: true 
  })
  @ApiOperation({ summary: 'Soft delete parent (deactivate)' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'Parent deactivated successfully', type: ParentResponseDto })
  @ApiResponse({ status: 404, description: 'Parent not found' })
  async softDelete(@Param('userId', ParseBigIntPipe) userId: string): Promise<ParentResponseDto> {
    return await this.parentsService.softDelete(userId);
  }
}
