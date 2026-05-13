import {
  Controller, Get, Post, Patch, Param, Body, Query,
  UseGuards, Req, ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { FlexibleAccessGuard } from '../../auth/guards/flexible-access.guard';
import { RequireAnyOfRoles } from '../../auth/decorators/flexible-access.decorator';
import { UserType } from '../user/enums/user-type.enum';
import { JwtRequest } from '../../common/interfaces/jwt-request.interface';
import { FinanceService } from './services/finance.service';
import {
  CreateFinanceAccountDto, UpdateFinanceAccountDto, SettleFundsDto,
  CreateFinanceCategoryDto, UpdateFinanceCategoryDto,
  CollectPhysicalPaymentDto,
  TeacherPayoutDto, TeacherDeductionDto,
  TeacherAdvanceDto, ManualRecordDto,
  LedgerQueryDto, AnalyticsQueryDto,
} from './dto/finance.dto';

function resolveInstituteId(req: JwtRequest): string {
  const user = req.user;
  if (user.i && user.i.length > 0) return String(user.i[0].i);
  throw new ForbiddenException('No institute access');
}

function resolveUserName(req: JwtRequest): string {
  return (req as any).user?.name || (req as any).user?.username || String(req.user.s);
}

@ApiTags('Finance')
@ApiBearerAuth()
@Controller('api/finance')
@UseGuards(JwtAuthGuard, FlexibleAccessGuard)
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  // ─── Summary ─────────────────────────────────────────────────────

  @Get('summary')
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({ summary: 'Get institute finance summary (balances)' })
  async getSummary(@Req() req: JwtRequest) {
    const instituteId = resolveInstituteId(req);
    return this.financeService.getSummary(instituteId);
  }

  // ─── Accounts ────────────────────────────────────────────────────

  @Get('accounts')
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  async getAccounts(@Req() req: JwtRequest) {
    return this.financeService.getAllAccounts(resolveInstituteId(req));
  }

  @Post('accounts')
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  async createAccount(@Body() dto: CreateFinanceAccountDto, @Req() req: JwtRequest) {
    return this.financeService.createAccount(dto, resolveInstituteId(req));
  }

  @Patch('accounts/:id')
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  async updateAccount(@Param('id') id: string, @Body() dto: UpdateFinanceAccountDto, @Req() req: JwtRequest) {
    return this.financeService.updateAccount(id, dto, resolveInstituteId(req));
  }

  // ─── Categories ───────────────────────────────────────────────────

  @Get('categories')
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true, teacher: true, attendanceMarker: true })
  async getCategories(@Req() req: JwtRequest) {
    return this.financeService.getCategories(resolveInstituteId(req));
  }

  @Post('categories')
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  async createCategory(@Body() dto: CreateFinanceCategoryDto, @Req() req: JwtRequest) {
    return this.financeService.createCategory(dto, resolveInstituteId(req));
  }

  @Patch('categories/:id')
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  async updateCategory(@Param('id') id: string, @Body() dto: UpdateFinanceCategoryDto, @Req() req: JwtRequest) {
    return this.financeService.updateCategory(id, dto, resolveInstituteId(req));
  }

  // ─── Physical collection ─────────────────────────────────────────

  @Post('collect')
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true, teacher: true, attendanceMarker: true })
  @ApiOperation({ summary: 'Record physical cash collection from a student' })
  async collectPhysical(@Body() dto: CollectPhysicalPaymentDto, @Req() req: JwtRequest) {
    const instituteId = resolveInstituteId(req);
    return this.financeService.collectPhysical(dto, String(req.user.s), resolveUserName(req), instituteId);
  }

  // ─── Settle funds ─────────────────────────────────────────────────

  @Post('settle')
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({ summary: 'Transfer funds between finance accounts' })
  async settleFunds(@Body() dto: SettleFundsDto, @Req() req: JwtRequest) {
    const instituteId = resolveInstituteId(req);
    return this.financeService.settleFunds(dto, String(req.user.s), resolveUserName(req), instituteId);
  }

  // ─── Payouts & Deductions ─────────────────────────────────────────

  @Post('payout')
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({ summary: 'Pay out accumulated wallet balance to a teacher' })
  async payoutTeacher(@Body() dto: TeacherPayoutDto, @Req() req: JwtRequest) {
    const instituteId = resolveInstituteId(req);
    return this.financeService.payoutTeacher(dto, String(req.user.s), resolveUserName(req), instituteId);
  }

  @Post('deduct')
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({ summary: 'Apply a deduction to a teacher wallet' })
  async deductTeacher(@Body() dto: TeacherDeductionDto, @Req() req: JwtRequest) {
    const instituteId = resolveInstituteId(req);
    return this.financeService.deductTeacher(dto, String(req.user.s), resolveUserName(req), instituteId);
  }

  // ─── Teacher advance ─────────────────────────────────────────────

  @Post('advance')
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({ summary: 'Give a teacher an advance payment against future earnings' })
  async giveTeacherAdvance(@Body() dto: TeacherAdvanceDto, @Req() req: JwtRequest) {
    const instituteId = resolveInstituteId(req);
    return this.financeService.giveTeacherAdvance(dto, String(req.user.s), resolveUserName(req), instituteId);
  }

  // ─── Manual record ────────────────────────────────────────────────

  @Post('manual')
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({ summary: 'Add a manual income or expense record' })
  async addManualRecord(@Body() dto: ManualRecordDto, @Req() req: JwtRequest) {
    const instituteId = resolveInstituteId(req);
    return this.financeService.addManualRecord(dto, String(req.user.s), resolveUserName(req), instituteId);
  }

  // ─── Teachers summary ─────────────────────────────────────────────

  @Get('teachers/summary')
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({ summary: 'Get all teacher wallets for this institute' })
  async getTeachersSummary(@Req() req: JwtRequest) {
    return this.financeService.getTeachersSummary(resolveInstituteId(req));
  }

  // ─── Category analytics ───────────────────────────────────────────

  @Get('analytics/categories')
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({ summary: 'Analytics breakdown by category' })
  async getAnalyticsByCategory(@Query() query: AnalyticsQueryDto, @Req() req: JwtRequest) {
    return this.financeService.getAnalyticsByCategory(query, resolveInstituteId(req));
  }

  // ─── Ledger ───────────────────────────────────────────────────────

  @Get('ledger')
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({ summary: 'Paginated finance ledger with filters' })
  async getLedger(@Query() query: LedgerQueryDto, @Req() req: JwtRequest) {
    return this.financeService.getLedger(query, resolveInstituteId(req));
  }

  // ─── Analytics ───────────────────────────────────────────────────

  @Get('analytics')
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({ summary: 'Finance analytics — income vs expense over time' })
  async getAnalytics(@Query() query: AnalyticsQueryDto, @Req() req: JwtRequest) {
    return this.financeService.getAnalytics(query, resolveInstituteId(req));
  }

  // ─── Teacher self-service ─────────────────────────────────────────

  @Get('teacher/wallet')
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true, teacher: true })
  @ApiOperation({ summary: "Get the calling teacher's wallet for this institute" })
  async getMyWallet(@Req() req: JwtRequest) {
    const instituteId = resolveInstituteId(req);
    return this.financeService.getTeacherWallet(String(req.user.s), instituteId);
  }

  @Get('teacher/ledger')
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true, teacher: true })
  @ApiOperation({ summary: "Get the calling teacher's earnings ledger" })
  async getMyLedger(@Query() query: LedgerQueryDto, @Req() req: JwtRequest) {
    const instituteId = resolveInstituteId(req);
    return this.financeService.getTeacherLedger(String(req.user.s), instituteId, query);
  }

  @Post('teacher/:teacherId/init-wallet')
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({ summary: 'Initialize a teacher wallet (creates if not exists)' })
  async initTeacherWallet(@Param('teacherId') teacherId: string, @Req() req: JwtRequest) {
    return this.financeService.initTeacherWallet(teacherId, resolveInstituteId(req));
  }

  @Get('teacher/:teacherId/wallet')
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({ summary: "Get a specific teacher's wallet (admin)" })
  async getTeacherWallet(@Param('teacherId') teacherId: string, @Req() req: JwtRequest) {
    return this.financeService.getTeacherWallet(teacherId, resolveInstituteId(req));
  }

  @Get('teacher/:teacherId/ledger')
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({ summary: "Get a specific teacher's earnings ledger (admin)" })
  async getTeacherLedger(
    @Param('teacherId') teacherId: string,
    @Query() query: LedgerQueryDto,
    @Req() req: JwtRequest,
  ) {
    return this.financeService.getTeacherLedger(teacherId, resolveInstituteId(req), query);
  }
}
