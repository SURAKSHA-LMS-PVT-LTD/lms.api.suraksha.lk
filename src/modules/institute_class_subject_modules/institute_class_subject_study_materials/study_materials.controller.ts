import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { FlexibleAccessGuard } from '../../../auth/guards/flexible-access.guard';
import { RequireAnyOfRoles } from '../../../auth/decorators/flexible-access.decorator';
import { ParseBigIntPipe } from '../../../common/pipes/parse-bigint.pipe';
import { UserType } from '../../user/enums/user-type.enum';
import { StudyMaterialsService } from './study_materials.service';
import { CreateStudyMaterialDto } from './dto/create-study-material.dto';
import { UpdateStudyMaterialDto } from './dto/update-study-material.dto';
import { QueryStudyMaterialDto } from './dto/query-study-material.dto';

@ApiTags('Study Materials')
@Controller('study-materials')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class StudyMaterialsController {
  constructor(private readonly service: StudyMaterialsService) {}

  @Post()
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: {},
  })
  @ApiOperation({ summary: 'Create a study material' })
  create(@Body() dto: CreateStudyMaterialDto, @Request() req: any) {
    return this.service.create(dto, req.user);
  }

  @Get()
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ anyInstituteRole: true })
  @ApiOperation({ summary: 'List study materials with filters' })
  findAll(@Query() query: QueryStudyMaterialDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ anyInstituteRole: true })
  @ApiOperation({ summary: 'Get a single study material by ID' })
  findOne(@Param('id', ParseBigIntPipe) id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: {},
  })
  @ApiOperation({ summary: 'Update a study material' })
  update(
    @Param('id', ParseBigIntPipe) id: string,
    @Body() dto: UpdateStudyMaterialDto,
    @Request() req: any,
  ) {
    return this.service.update(id, dto, req.user);
  }

  @Delete(':id')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: {},
  })
  @ApiOperation({ summary: 'Delete a study material permanently' })
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseBigIntPipe) id: string, @Request() req: any) {
    return this.service.remove(id, req.user);
  }

  @Patch(':id/toggle-active')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: {},
  })
  @ApiOperation({ summary: 'Toggle active/hidden status' })
  toggleActive(@Param('id', ParseBigIntPipe) id: string, @Request() req: any) {
    return this.service.toggleActive(id, req.user);
  }

  @Post('reorder')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: {},
  })
  @ApiOperation({ summary: 'Reorder study materials (pass array of IDs in desired order)' })
  reorder(@Body() body: { ids: string[] }) {
    return this.service.reorder(body.ids);
  }
}
