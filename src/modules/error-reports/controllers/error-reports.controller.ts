import {
  Body, Controller, Get, NotFoundException, Param, Patch, Post,
  Query, Request, UseGuards,
} from '@nestjs/common';
import { FlexibleAccessGuard } from '../../../auth/guards/flexible-access.guard';
import { RequireAnyOfRoles } from '../../../auth/decorators/flexible-access.decorator';
import { UserType } from '../../user/enums/user-type.enum';
import { JwtRequest, JwtRequestHelper } from '../../../common/interfaces/jwt-request.interface';
import { Public } from '../../../common/decorators/public.decorator';
import { CreateErrorReportDto } from '../dto/create-error-report.dto';
import { UpdateErrorReportStatusDto } from '../dto/update-error-report-status.dto';
import { QueryErrorReportsDto } from '../dto/query-error-reports.dto';
import { ErrorReportsService } from '../services/error-reports.service';

@Controller()
export class ErrorReportsController {
  constructor(private readonly service: ErrorReportsService) {}

  /**
   * Submit an error report.
   * Works for authenticated users (userId extracted from JWT) or anonymous.
   * Marked @Public so the global JwtAuthGuard doesn't block unauthenticated requests,
   * but if a valid JWT is present, we still capture the userId.
   */
  @Public()
  @Post('error-reports')
  async create(@Body() dto: CreateErrorReportDto, @Request() req: any) {
    const userId: string | undefined = req.user?.s;
    return this.service.create(dto, userId);
  }

  // ── SuperAdmin endpoints ────────────────────────────────────────────────────

  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
  @Get('admin/error-reports')
  async findAll(@Query() query: QueryErrorReportsDto) {
    const { data, total } = await this.service.findAll(query);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
  @Get('admin/error-reports/status-counts')
  async getStatusCounts() {
    return this.service.getStatusCounts();
  }

  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
  @Get('admin/error-reports/:id')
  async findOne(@Param('id') id: string) {
    const report = await this.service.findOne(id);
    if (!report) throw new NotFoundException('Error report not found');
    return report;
  }

  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
  @Patch('admin/error-reports/:id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateErrorReportStatusDto,
    @Request() req: JwtRequest,
  ) {
    const resolvedByUserId = JwtRequestHelper.getUserId(req.user);
    const report = await this.service.updateStatus(id, dto, resolvedByUserId);
    if (!report) throw new NotFoundException('Error report not found');
    return report;
  }
}
