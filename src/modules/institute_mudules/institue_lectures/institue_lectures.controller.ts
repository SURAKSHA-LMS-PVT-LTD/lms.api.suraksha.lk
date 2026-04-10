import { ParseBigIntPipe } from '../../../common/pipes/parse-bigint.pipe';
import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { InstitueLecturesService } from './institue_lectures.service';
import { CreateInstitueLectureDto, BulkCreateInstitueLectureDto } from './dto/create-institue_lecture.dto';
import { UpdateInstitueLectureDto } from './dto/update-institue_lecture.dto';
import { LectureFilterDto } from './dto/lecture-filter.dto';
import { UpdateLectureStatusDto } from './dto/update-lecture-status.dto';
import { RescheduleLectureDto } from './dto/reschedule-lecture.dto';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { FlexibleAccessGuard } from '../../../auth/guards/flexible-access.guard';
import { RequireAnyOfRoles } from '../../../auth/decorators/flexible-access.decorator';
import { UserType } from '../../user/enums/user-type.enum';
import { LectureTimePipe } from './pipes/lecture-time.pipe';
import { LectureExistsPipe } from './pipes/lecture-exists.pipe';

@ApiTags('Institute Lectures')
@Controller('institute-lectures')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class InstitueLecturesController {
  constructor(private readonly institueLecturesService: InstitueLecturesService) {}

  @Post()
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: {}
  })
  @UsePipes(new ValidationPipe(), LectureTimePipe)
  create(@Body() createInstitueLectureDto: CreateInstitueLectureDto) {
    return this.institueLecturesService.create(createInstitueLectureDto);
  }

  @Post('bulk')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: {}
  })
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  createBulk(@Body() bulkDto: BulkCreateInstitueLectureDto) {
    return this.institueLecturesService.createBulk(bulkDto);
  }

  @Get()
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    anyInstituteRole: true
  })
  findAll(@Query() filterDto: LectureFilterDto) {
    return this.institueLecturesService.findAll(filterDto);
  }

  @Get('institute/:instituteId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    anyInstituteRole: true
  })
  findByInstitute(@Param('instituteId', ParseBigIntPipe) instituteId: string) {
    return this.institueLecturesService.findByInstitute(instituteId);
  }

  @Get('class/:classId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    anyInstituteRole: true
  })
  findByClass(@Param('classId', ParseBigIntPipe) classId: string) {
    return this.institueLecturesService.findByClass(classId);
  }

  @Get('instructor/:instructorId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    anyInstituteRole: true
  })
  findByInstructor(@Param('instructorId', ParseBigIntPipe) instructorId: string) {
    return this.institueLecturesService.findByInstructor(instructorId);
  }

  @Get('upcoming/:instituteId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    anyInstituteRole: true
  })
  findUpcoming(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Query('limit') limit?: number
  ) {
    return this.institueLecturesService.findUpcoming(instituteId, limit);
  }

  @Get('ongoing/:instituteId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    anyInstituteRole: true
  })
  findOngoing(@Param('instituteId', ParseBigIntPipe) instituteId: string) {
    return this.institueLecturesService.findOngoing(instituteId);
  }

  @Get('completed/:instituteId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    anyInstituteRole: true
  })
  findCompleted(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Query('limit') limit?: number
  ) {
    return this.institueLecturesService.findCompleted(instituteId, limit);
  }

  @Get('schedule/:date')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    anyInstituteRole: true
  })
  findBySchedule(
    @Param('date') date: string,
    @Query() filterDto: LectureFilterDto
  ) {
    return this.institueLecturesService.findBySchedule(date, filterDto);
  }

  @Get(':id')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    anyInstituteRole: true
  })
  findOne(@Param('id', LectureExistsPipe) id: string) {
    return this.institueLecturesService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: {}
  })
  // @UseGuards(LectureOwnerGuard)
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }), LectureTimePipe)
  update(
    @Param('id', LectureExistsPipe) id: string, 
    @Body() updateInstitueLectureDto: UpdateInstitueLectureDto
  ) {
    return this.institueLecturesService.update(id, updateInstitueLectureDto);
  }

  @Patch(':id/status')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: {}
  })
  // @UseGuards(LectureOwnerGuard)
  @UsePipes(new ValidationPipe({ transform: true }))
  updateStatus(
    @Param('id', LectureExistsPipe) id: string,
    @Body() updateStatusDto: UpdateLectureStatusDto
  ) {
    return this.institueLecturesService.updateStatus(id, updateStatusDto);
  }

  @Patch(':id/reschedule')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: {}
  })
  // @UseGuards(LectureOwnerGuard)
  @UsePipes(new ValidationPipe({ transform: true }), LectureTimePipe)
  reschedule(
    @Param('id', LectureExistsPipe) id: string,
    @Body() rescheduleDto: RescheduleLectureDto
  ) {
    return this.institueLecturesService.reschedule(id, rescheduleDto);
  }

  @Delete(':id')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN]
  })
  // @UseGuards(InstituteAdminGuard)
  remove(@Param('id', LectureExistsPipe) id: string) {
    return this.institueLecturesService.remove(id);
  }

  @Delete(':id/permanent')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true
  })
  removePermanent(@Param('id', ParseBigIntPipe) id: string) {
    return this.institueLecturesService.removePermanent(id);
  }
}
