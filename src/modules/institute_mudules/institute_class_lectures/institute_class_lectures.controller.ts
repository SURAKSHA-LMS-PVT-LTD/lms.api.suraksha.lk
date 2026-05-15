import { ParseIdPipe } from '../../../common/pipes/parse-id.pipe';
import { Controller, Get, Post, Body, Patch, Param, Delete, Query, HttpCode, HttpStatus, UseGuards, Request, UsePipes, ValidationPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { FlexibleAccessGuard } from '../../../auth/guards/flexible-access.guard';
import { RequireAnyOfRoles } from '../../../auth/decorators/flexible-access.decorator';
import { InstituteClassLecturesService } from './institute_class_lectures.service';
import { CreateInstituteClassLectureDto } from './dto/create-institute_class_lecture.dto';
import { UpdateInstituteClassLectureDto } from './dto/update-institute_class_lecture.dto';
import { UpdateClassLectureStatusDto, RescheduleClassLectureDto, ClassLectureFilterDto } from './dto/class-lecture-filter.dto';
import { InstituteClassLectureEntity } from './entities/institute_class_lecture.entity';
import { PaginatedResponseDto } from '../../../common/dto/paginated-response.dto';
import { UserType } from '../../user/enums/user-type.enum';

@ApiTags('Institute Class Lectures')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('institute-class-lectures')
export class InstituteClassLecturesController {
  constructor(private readonly lecturesService: InstituteClassLecturesService) {}

  @Post()
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: true
  })
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  @ApiOperation({ summary: 'Create a class lecture visible to all class members' })
  @ApiResponse({ status: 201, description: 'Lecture created successfully' })
  async create(@Body() createDto: CreateInstituteClassLectureDto): Promise<InstituteClassLectureEntity> {
    // Handle recodingUrl typo
    const dto = { ...createDto } as any;
    if ('recodingUrl' in dto && !dto.recordingUrl) {
      dto.recordingUrl = dto.recodingUrl;
      delete dto.recodingUrl;
    }
    return await this.lecturesService.create(dto);
  }

  @Get()
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    anyInstituteRole: true
  })
  @ApiOperation({ summary: 'Get all class lectures with filtering and pagination' })
  @ApiResponse({ status: 200, description: 'List of class lectures' })
  async findAll(
    @Query() queryDto: ClassLectureFilterDto,
    @Request() req: any
  ): Promise<PaginatedResponseDto<InstituteClassLectureEntity>> {
    return await this.lecturesService.findAll(queryDto, req.user);
  }

  @Get('class/:classId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    anyInstituteRole: true
  })
  @ApiOperation({ summary: 'Get all lectures for a specific class (all members)' })
  @ApiParam({ name: 'classId', description: 'Class ID' })
  async findByClass(
    @Param('classId', ParseIdPipe) classId: string,
    @Query('instituteId') instituteId?: string
  ): Promise<InstituteClassLectureEntity[]> {
    return await this.lecturesService.findByClass(classId, instituteId);
  }

  @Get('institute/:instituteId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    anyInstituteRole: true
  })
  @ApiOperation({ summary: 'Get all class lectures for an institute' })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  async findByInstitute(
    @Param('instituteId', ParseIdPipe) instituteId: string
  ): Promise<InstituteClassLectureEntity[]> {
    return await this.lecturesService.findByInstitute(instituteId);
  }

  @Get('upcoming/:classId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    anyInstituteRole: true
  })
  @ApiOperation({ summary: 'Get upcoming lectures for a class' })
  async findUpcoming(
    @Param('classId', ParseIdPipe) classId: string,
    @Query('instituteId') instituteId?: string,
    @Query('limit') limit?: number
  ): Promise<InstituteClassLectureEntity[]> {
    return await this.lecturesService.findUpcoming(classId, instituteId, limit);
  }

  @Get('ongoing/:classId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    anyInstituteRole: true
  })
  @ApiOperation({ summary: 'Get ongoing lectures for a class' })
  async findOngoing(
    @Param('classId', ParseIdPipe) classId: string,
    @Query('instituteId') instituteId?: string
  ): Promise<InstituteClassLectureEntity[]> {
    return await this.lecturesService.findOngoing(classId, instituteId);
  }

  @Get('completed/:classId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    anyInstituteRole: true
  })
  @ApiOperation({ summary: 'Get completed lectures for a class' })
  async findCompleted(
    @Param('classId', ParseIdPipe) classId: string,
    @Query('instituteId') instituteId?: string,
    @Query('limit') limit?: number
  ): Promise<InstituteClassLectureEntity[]> {
    return await this.lecturesService.findCompleted(classId, instituteId, limit);
  }

  @Get('schedule/:date')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    anyInstituteRole: true
  })
  @ApiOperation({ summary: 'Get class lecture schedule for a specific date' })
  @ApiParam({ name: 'date', description: 'Date in YYYY-MM-DD format' })
  async getSchedule(
    @Param('date') date: string,
    @Query() query: ClassLectureFilterDto,
    @Request() req: any
  ): Promise<InstituteClassLectureEntity[]> {
    return await this.lecturesService.getSchedule(date, query, req.user);
  }

  @Get(':id')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    anyInstituteRole: true
  })
  @ApiOperation({ summary: 'Get class lecture by ID' })
  @ApiParam({ name: 'id', description: 'Lecture ID' })
  async findOne(
    @Param('id', ParseIdPipe) id: string,
    @Request() req: any
  ): Promise<InstituteClassLectureEntity> {
    return await this.lecturesService.findOne(id, req.user);
  }

  @Get(':id/details')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    anyInstituteRole: true
  })
  @ApiOperation({ summary: 'Get class lecture with full relation details' })
  async findOneWithDetails(
    @Param('id', ParseIdPipe) id: string
  ): Promise<InstituteClassLectureEntity> {
    return await this.lecturesService.findOneWithDetails(id);
  }

  @Patch(':id')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: true
  })
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  @ApiOperation({ summary: 'Update class lecture' })
  async update(
    @Param('id', ParseIdPipe) id: string,
    @Body() updateDto: UpdateInstituteClassLectureDto,
    @Request() req: any
  ): Promise<InstituteClassLectureEntity> {
    return await this.lecturesService.update(id, updateDto, req.user);
  }

  @Patch(':id/status')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: true
  })
  @UsePipes(new ValidationPipe({ transform: true }))
  @ApiOperation({ summary: 'Update class lecture status' })
  async updateStatus(
    @Param('id', ParseIdPipe) id: string,
    @Body() statusDto: UpdateClassLectureStatusDto,
    @Request() req: any
  ): Promise<any> {
    return await this.lecturesService.updateStatus(id, statusDto, req.user);
  }

  @Patch(':id/reschedule')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: true
  })
  @UsePipes(new ValidationPipe({ transform: true }))
  @ApiOperation({ summary: 'Reschedule class lecture' })
  async reschedule(
    @Param('id', ParseIdPipe) id: string,
    @Body() rescheduleDto: RescheduleClassLectureDto,
    @Request() req: any
  ): Promise<any> {
    return await this.lecturesService.reschedule(id, rescheduleDto, req.user);
  }

  @Delete(':id')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN]
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete class lecture (Super Admin Only)' })
  async remove(@Param('id', ParseIdPipe) id: string): Promise<void> {
    await this.lecturesService.remove(id);
  }

  @Delete(':id/permanent')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true
  })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Permanently delete class lecture' })
  async removePermanent(
    @Param('id', ParseIdPipe) id: string,
    @Request() req: any
  ): Promise<any> {
    return await this.lecturesService.removePermanent(id, req.user);
  }

  @Post('bulk')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: true
  })
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  @ApiOperation({ summary: 'Create multiple class lectures' })
  async createBulk(@Body() bulkDto: { lectures: CreateInstituteClassLectureDto[] }): Promise<InstituteClassLectureEntity[]> {
    return await this.lecturesService.createBulk(bulkDto.lectures);
  }
}

