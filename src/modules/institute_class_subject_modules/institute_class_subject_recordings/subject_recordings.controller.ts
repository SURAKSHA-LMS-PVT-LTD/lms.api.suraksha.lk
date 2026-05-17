import {
  Controller, Get, Post, Patch, Delete, Body, Param,
  Query, Request, HttpCode, HttpStatus,
  UseGuards, UseInterceptors,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam, ApiResponse } from '@nestjs/swagger';
import { ClassSerializerInterceptor } from '@nestjs/common';

import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { FlexibleAccessGuard } from '../../../auth/guards/flexible-access.guard';
import { RequireAnyOfRoles } from '../../../auth/decorators/flexible-access.decorator';
import { ParseIdPipe } from '../../../common/pipes/parse-id.pipe';
import { UserType } from '../../user/enums/user-type.enum';

import { SubjectRecordingsService } from './services/subject-recordings.service';
import {
  CreateSubjectRecordingDto,
  UpdateSubjectRecordingDto,
  QuerySubjectRecordingDto,
} from './dto/subject-recording.dto';

@ApiTags('Subject Recordings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@UseInterceptors(ClassSerializerInterceptor)
@Controller('subject-recordings')
export class SubjectRecordingsController {
  constructor(private readonly service: SubjectRecordingsService) {}

  @Post()
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true, teacher: true })
  @ApiOperation({ summary: 'Upload / register a new subject recording' })
  @ApiResponse({ status: 201, description: 'Recording created' })
  async create(@Body() dto: CreateSubjectRecordingDto, @Request() req: any) {
    return this.service.create(dto, req.user);
  }

  @Get()
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ anyInstituteRole: true })
  @ApiOperation({ summary: 'List subject recordings with filtering and pagination' })
  async findAll(@Query() query: QuerySubjectRecordingDto, @Request() req: any) {
    return this.service.findAll(query, req.user);
  }

  @Get(':id')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ anyInstituteRole: true })
  @ApiOperation({ summary: 'Get recording by ID' })
  @ApiParam({ name: 'id', description: 'Recording ID' })
  async findOne(@Param('id', ParseIdPipe) id: string, @Request() req: any) {
    return this.service.findOne(id, req.user);
  }

  @Patch(':id')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true, teacher: true })
  @ApiOperation({ summary: 'Update recording metadata, access settings, or welcome message' })
  @ApiParam({ name: 'id', description: 'Recording ID' })
  async update(
    @Param('id', ParseIdPipe) id: string,
    @Body() dto: UpdateSubjectRecordingDto,
    @Request() req: any,
  ) {
    return this.service.update(id, dto, req.user);
  }

  @Delete(':id')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete (deactivate) a recording' })
  @ApiParam({ name: 'id', description: 'Recording ID' })
  async remove(@Param('id', ParseIdPipe) id: string) {
    await this.service.remove(id);
  }

  @Delete(':id/permanent')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Permanently delete a recording (SuperAdmin only)' })
  @ApiParam({ name: 'id', description: 'Recording ID' })
  async removePermanent(@Param('id', ParseIdPipe) id: string, @Request() req: any) {
    return this.service.removePermanent(id, req.user);
  }
}
