import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards, Request } from '@nestjs/common';
import { InstituteClassLectureGroupsService } from './institute_class_lecture_groups.service';
import { CreateInstituteClassLectureGroupDto } from './dto/create-institute_class_lecture_group.dto';
import { UpdateInstituteClassLectureGroupDto } from './dto/update-institute_class_lecture_group.dto';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';

@Controller('institute-class-lecture-groups')
@UseGuards(JwtAuthGuard)
export class InstituteClassLectureGroupsController {
  constructor(private readonly groupsService: InstituteClassLectureGroupsService) {}

  @Post()
  create(
    @Body() createDto: CreateInstituteClassLectureGroupDto,
    @Request() req,
  ) {
    return this.groupsService.create(createDto, req.user.id.toString());
  }

  @Get()
  findAll(
    @Query('instituteId') instituteId: string,
    @Query('classId') classId: string,
  ) {
    return this.groupsService.findAll(instituteId, classId);
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @Query('instituteId') instituteId: string,
  ) {
    return this.groupsService.findOne(id, instituteId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Query('instituteId') instituteId: string,
    @Body() updateDto: UpdateInstituteClassLectureGroupDto,
    @Request() req,
  ) {
    return this.groupsService.update(id, instituteId, updateDto, req.user.id.toString());
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @Query('instituteId') instituteId: string,
  ) {
    return this.groupsService.remove(id, instituteId);
  }
}
