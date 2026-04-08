import {
  Controller,
  Get,
  Post,
  Patch,
  Query,
  Param,
  Body,
  Request,
  UseGuards,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { InstituteCreditsService } from '../services/institute-credits.service';
import {
  AdminAdjustCreditsDto,
  CreditTransactionFilterDto,
  CreditBalanceResponseDto,
  CreditTransactionListResponseDto,
} from '../dto/institute-credits.dto';
import { CreditTransactionType } from '../entities/institute-credit-transaction.entity';
import { FlexibleAccessGuard, RequireAnyOfRoles, UserType } from '../../../auth/guards';
import { JwtRequestHelper } from '../../../common/interfaces/jwt-request.interface';

@ApiTags('Institute Wallet')
@Controller('v2/credits')
export class InstituteCreditsController {
  constructor(private readonly creditsService: InstituteCreditsService) {}

  /**
   * Get credit balance for an institute.
   * Institute admin sees own balance; SUPERADMIN can query any institute.
   */
  @Get('balance')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({ summary: 'Get institute wallet balance' })
  @ApiResponse({ status: 200, type: CreditBalanceResponseDto })
  async getBalance(
    @Request() req,
    @Query('instituteId') queryInstituteId?: string,
  ): Promise<CreditBalanceResponseDto> {
    const instituteId = this.resolveInstituteId(req, queryInstituteId);
    return this.creditsService.getBalance(instituteId);
  }

  /**
   * Get credit transaction history for an institute.
   */
  @Get('transactions')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({ summary: 'Get wallet transaction history' })
  @ApiResponse({ status: 200, type: CreditTransactionListResponseDto })
  async getTransactions(
    @Request() req,
    @Query('instituteId') queryInstituteId?: string,
    @Query('type') type?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ): Promise<CreditTransactionListResponseDto> {
    const instituteId = this.resolveInstituteId(req, queryInstituteId);
    const parsedPage = page ? Number(page) : undefined;
    const parsedLimit = limit ? Number(limit) : undefined;
    return this.creditsService.getTransactions(instituteId, {
      type: type as CreditTransactionType,
      startDate,
      endDate,
      page: parsedPage && !isNaN(parsedPage) ? parsedPage : undefined,
      limit: parsedLimit && !isNaN(parsedLimit) ? parsedLimit : undefined,
    });
  }

  /**
   * Admin: manually adjust credits for an institute (add or deduct).
   * SUPERADMIN only.
   */
  @Patch('admin/adjust/:instituteId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
  @ApiOperation({ summary: 'Admin: adjust wallet balance (SUPERADMIN)' })
  async adminAdjust(
    @Param('instituteId') instituteId: string,
    @Body() dto: AdminAdjustCreditsDto,
    @Request() req,
  ) {
    if (!instituteId) throw new BadRequestException('instituteId is required');
    const adminUserId = req.user?.s;
    if (!adminUserId) throw new BadRequestException('Admin user ID not found in token');
    return this.creditsService.adminAdjustCredits(instituteId, dto, adminUserId);
  }

  /**
   * Resolve and validate institute ID.
   * Institute admins can only access their own institute(s).
   * SUPERADMINs can access any institute via query param.
   */
  private resolveInstituteId(req: any, queryInstituteId?: string): string {
    const user = req.user;
    const isSuperAdmin = JwtRequestHelper.isSuperAdmin(user);
    const userInstituteId = user?.i?.[0]?.i ? String(user.i[0].i) : undefined;

    if (isSuperAdmin && queryInstituteId) {
      return queryInstituteId;
    }

    const instituteId = queryInstituteId || userInstituteId;
    if (!instituteId) throw new BadRequestException('instituteId is required');

    // Non-superadmin must have access to the requested institute
    if (!isSuperAdmin && queryInstituteId) {
      const hasAccess = JwtRequestHelper.hasInstituteAccess(user, String(queryInstituteId));
      if (!hasAccess) {
        throw new ForbiddenException('You can only access your own institute wallet');
      }
    }

    return String(instituteId);
  }
}
