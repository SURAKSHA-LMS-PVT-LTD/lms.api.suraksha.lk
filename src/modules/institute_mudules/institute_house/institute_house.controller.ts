import {
  Controller,
  Post,
  Get,
  Patch,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { FlexibleAccessGuard } from '../../../auth/guards/flexible-access.guard';
import { RequireAnyOfRoles } from '../../../auth/decorators/flexible-access.decorator';
import { NoDataMasking } from '../../../common/decorators/no-data-masking.decorator';
import { ParseBigIntPipe } from '../../../common/pipes/parse-bigint.pipe';
import { InstituteHouseService } from './institute_house.service';
import {
  CreateInstituteHouseDto,
  UpdateInstituteHouseDto,
  UpdateInstituteHouseImageDto,
  AssignUserToHouseDto,
  BulkAssignUsersToHouseDto,
  HouseMemberQueryDto,
  InstituteHouseResponseDto,
  HouseMemberResponseDto,
  HouseActionResponseDto,
  PaginatedHouseMembersDto,
} from './dto/institute_house.dto';

@ApiTags('Institute Houses')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, FlexibleAccessGuard)
@Controller('institutes/:instituteId/houses')
@NoDataMasking()
export class InstituteHouseController {
  constructor(private readonly houseService: InstituteHouseService) {}

  // ─── House CRUD ───────────────────────────────────────────────────────────

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequireAnyOfRoles({ instituteAdmin: true })
  @ApiParam({ name: 'instituteId', description: 'Institute ID', example: '42' })
  @ApiOperation({ summary: 'Create a house (institute admin only)' })
  @ApiBody({ type: CreateInstituteHouseDto })
  @ApiResponse({ status: 201, type: InstituteHouseResponseDto })
  @ApiResponse({ status: 409, description: 'House name already exists' })
  async createHouse(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Body() dto: CreateInstituteHouseDto,
    @Request() req: any,
  ): Promise<InstituteHouseResponseDto> {
    const adminId = req.user.s ?? req.user.userId ?? req.user.sub;
    return this.houseService.createHouse(instituteId, adminId, dto);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @RequireAnyOfRoles({ instituteAdmin: true, teacher: {}, student: {} })
  @ApiParam({ name: 'instituteId', example: '42' })
  @ApiOperation({ summary: 'List all active houses of an institute' })
  @ApiResponse({ status: 200, type: [InstituteHouseResponseDto] })
  async getHouses(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Request() req: any,
  ): Promise<InstituteHouseResponseDto[]> {
    const userId = req.user.s ?? req.user.userId ?? req.user.sub;
    return this.houseService.getHouses(instituteId, userId);
  }

  @Get(':houseId')
  @HttpCode(HttpStatus.OK)
  @RequireAnyOfRoles({ instituteAdmin: true })
  @ApiParam({ name: 'instituteId', example: '42' })
  @ApiParam({ name: 'houseId', example: '1' })
  @ApiOperation({ summary: 'Get house details with member count (admin only)' })
  @ApiResponse({ status: 200, type: InstituteHouseResponseDto })
  async getHouse(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Param('houseId', ParseBigIntPipe) houseId: string,
    @Request() req: any,
  ): Promise<InstituteHouseResponseDto> {
    const adminId = req.user.s ?? req.user.userId ?? req.user.sub;
    return this.houseService.getHouse(instituteId, houseId, adminId);
  }

  @Patch(':houseId')
  @HttpCode(HttpStatus.OK)
  @RequireAnyOfRoles({ instituteAdmin: true })
  @ApiParam({ name: 'instituteId', example: '42' })
  @ApiParam({ name: 'houseId', example: '1' })
  @ApiOperation({ summary: 'Update house name / colour / description (admin only)' })
  @ApiBody({ type: UpdateInstituteHouseDto })
  @ApiResponse({ status: 200, type: InstituteHouseResponseDto })
  async updateHouse(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Param('houseId', ParseBigIntPipe) houseId: string,
    @Body() dto: UpdateInstituteHouseDto,
    @Request() req: any,
  ): Promise<InstituteHouseResponseDto> {
    const adminId = req.user.s ?? req.user.userId ?? req.user.sub;
    return this.houseService.updateHouse(instituteId, houseId, adminId, dto);
  }

  @Put(':houseId/image')
  @HttpCode(HttpStatus.OK)
  @RequireAnyOfRoles({ instituteAdmin: true })
  @ApiParam({ name: 'instituteId', example: '42' })
  @ApiParam({ name: 'houseId', example: '1' })
  @ApiOperation({
    summary: 'Upload / replace house profile image (admin only)',
    description:
      'First obtain a signed upload URL via `POST /upload/generate-signed-url`, ' +
      'upload the file directly to cloud storage, then pass the returned path here.',
  })
  @ApiBody({ type: UpdateInstituteHouseImageDto })
  @ApiResponse({ status: 200, type: InstituteHouseResponseDto })
  async updateHouseImage(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Param('houseId', ParseBigIntPipe) houseId: string,
    @Body() dto: UpdateInstituteHouseImageDto,
    @Request() req: any,
  ): Promise<InstituteHouseResponseDto> {
    const adminId = req.user.s ?? req.user.userId ?? req.user.sub;
    return this.houseService.updateHouseImage(instituteId, houseId, adminId, dto);
  }

  @Delete(':houseId')
  @HttpCode(HttpStatus.OK)
  @RequireAnyOfRoles({ instituteAdmin: true })
  @ApiParam({ name: 'instituteId', example: '42' })
  @ApiParam({ name: 'houseId', example: '1' })
  @ApiOperation({ summary: 'Soft-delete a house (admin only)' })
  @ApiResponse({ status: 200, type: HouseActionResponseDto })
  async deleteHouse(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Param('houseId', ParseBigIntPipe) houseId: string,
    @Request() req: any,
  ): Promise<HouseActionResponseDto> {
    const adminId = req.user.s ?? req.user.userId ?? req.user.sub;
    return this.houseService.deleteHouse(instituteId, houseId, adminId);
  }

  // ─── Member Management ───────────────────────────────────────────────────

  @Post(':houseId/members')
  @HttpCode(HttpStatus.CREATED)
  @RequireAnyOfRoles({ instituteAdmin: true })
  @ApiParam({ name: 'instituteId', example: '42' })
  @ApiParam({ name: 'houseId', example: '1' })
  @ApiOperation({ summary: 'Assign a single user to a house (admin only)' })
  @ApiBody({ type: AssignUserToHouseDto })
  @ApiResponse({ status: 201, type: HouseActionResponseDto })
  async assignUser(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Param('houseId', ParseBigIntPipe) houseId: string,
    @Body() dto: AssignUserToHouseDto,
    @Request() req: any,
  ): Promise<HouseActionResponseDto> {
    const adminId = req.user.s ?? req.user.userId ?? req.user.sub;
    return this.houseService.assignUserToHouse(instituteId, houseId, adminId, dto);
  }

  @Post(':houseId/members/bulk')
  @HttpCode(HttpStatus.OK)
  @RequireAnyOfRoles({ instituteAdmin: true })
  @ApiParam({ name: 'instituteId', example: '42' })
  @ApiParam({ name: 'houseId', example: '1' })
  @ApiOperation({ summary: 'Bulk-assign multiple users to a house (admin only)' })
  @ApiBody({ type: BulkAssignUsersToHouseDto })
  @ApiResponse({ status: 200, description: 'Partial success possible — check results array' })
  async bulkAssignUsers(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Param('houseId', ParseBigIntPipe) houseId: string,
    @Body() dto: BulkAssignUsersToHouseDto,
    @Request() req: any,
  ) {
    const adminId = req.user.s ?? req.user.userId ?? req.user.sub;
    return this.houseService.bulkAssignUsersToHouse(instituteId, houseId, adminId, dto);
  }

  @Post(':houseId/enroll')
  @HttpCode(HttpStatus.OK)
  @RequireAnyOfRoles({ instituteAdmin: true, teacher: {}, student: {} })
  @ApiParam({ name: 'instituteId', example: '42' })
  @ApiParam({ name: 'houseId', example: '1' })
  @ApiOperation({ summary: 'Self-enroll into a house (active institute member)' })
  @ApiResponse({ status: 200, type: HouseActionResponseDto })
  async selfEnroll(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Param('houseId', ParseBigIntPipe) houseId: string,
    @Request() req: any,
  ): Promise<HouseActionResponseDto> {
    const userId = req.user.s ?? req.user.userId ?? req.user.sub;
    return this.houseService.selfEnroll(instituteId, houseId, userId);
  }

  @Get(':houseId/members')
  @HttpCode(HttpStatus.OK)
  @RequireAnyOfRoles({ instituteAdmin: true })
  @ApiParam({ name: 'instituteId', example: '42' })
  @ApiParam({ name: 'houseId', example: '1' })
  @ApiOperation({ summary: 'Get house members with user details (admin only)' })
  @ApiResponse({ status: 200, type: PaginatedHouseMembersDto })
  async getHouseMembers(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Param('houseId', ParseBigIntPipe) houseId: string,
    @Query() query: HouseMemberQueryDto,
    @Request() req: any,
  ): Promise<PaginatedHouseMembersDto> {
    const adminId = req.user.s ?? req.user.userId ?? req.user.sub;
    return this.houseService.getHouseMembers(instituteId, houseId, adminId, query);
  }

  @Delete(':houseId/members/:userId')
  @HttpCode(HttpStatus.OK)
  @RequireAnyOfRoles({ instituteAdmin: true })
  @ApiParam({ name: 'instituteId', example: '42' })
  @ApiParam({ name: 'houseId', example: '1' })
  @ApiParam({ name: 'userId', example: '123' })
  @ApiOperation({ summary: 'Remove a user from a house (admin only)' })
  @ApiResponse({ status: 200, type: HouseActionResponseDto })
  async removeUser(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Param('houseId', ParseBigIntPipe) houseId: string,
    @Param('userId', ParseBigIntPipe) userId: string,
    @Request() req: any,
  ): Promise<HouseActionResponseDto> {
    const adminId = req.user.s ?? req.user.userId ?? req.user.sub;
    return this.houseService.removeUserFromHouse(instituteId, houseId, adminId, userId);
  }
}
