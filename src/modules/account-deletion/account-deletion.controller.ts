import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  Ip,
  HttpCode,
  HttpStatus,
  BadRequestException,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AccountDeletionService } from './account-deletion.service';
import { RequestAccountDeletionDto, AccountDeletionResponseDto, DeletionStatusResponseDto } from './dto/account-deletion.dto';
import { JwtRequest } from '../../common/interfaces/jwt-request.interface';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

/**
 * Account Deletion Controller
 *
 * All endpoints require authentication (JWT).
 * Provides Google Play-compliant account deletion for Suraksha LMS.
 *
 * Flow:
 *   POST /account/delete   → Deactivate account + schedule 30-day permanent deletion
 *   POST /account/cancel   → Cancel pending deletion and re-activate account
 *   GET  /account/status   → Check current deletion status
 */
@ApiTags('Account Deletion')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('account')
export class AccountDeletionController {
  constructor(private readonly accountDeletionService: AccountDeletionService) {}

  /**
   * Request account deletion.
   * Deactivates the account immediately and schedules permanent deletion after 30 days.
   */
  @Post('delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request account deletion (authenticated user)' })
  @ApiResponse({ status: 200, description: 'Account deactivated and deletion scheduled', type: AccountDeletionResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  @ApiResponse({ status: 409, description: 'Deletion already requested' })
  async requestDeletion(
    @Body() dto: RequestAccountDeletionDto,
    @Req() req: JwtRequest,
    @Ip() ip: string,
  ): Promise<AccountDeletionResponseDto> {
    if (!dto.confirmDeletion) {
      throw new BadRequestException('You must confirm account deletion by setting confirmDeletion to true.');
    }

    const userId = req.user.s;
    return this.accountDeletionService.requestDeletion(userId, dto.reason, ip);
  }

  /**
   * Cancel a pending account deletion and re-activate the account.
   */
  @Post('cancel-deletion')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel pending account deletion' })
  @ApiResponse({ status: 200, description: 'Deletion cancelled, account re-activated', type: AccountDeletionResponseDto })
  @ApiResponse({ status: 404, description: 'No pending deletion found' })
  async cancelDeletion(
    @Req() req: JwtRequest,
  ): Promise<AccountDeletionResponseDto> {
    const userId = req.user.s;
    return this.accountDeletionService.cancelDeletion(userId);
  }

  /**
   * Check current deletion status.
   */
  @Get('deletion-status')
  @ApiOperation({ summary: 'Check account deletion status' })
  @ApiResponse({ status: 200, description: 'Current deletion status', type: DeletionStatusResponseDto })
  async getDeletionStatus(
    @Req() req: JwtRequest,
  ): Promise<DeletionStatusResponseDto> {
    const userId = req.user.s;
    return this.accountDeletionService.getDeletionStatus(userId);
  }
}
