import { Controller, Get, Param, Patch, Post, Delete, Body, Query, UseGuards, HttpCode, HttpStatus, NotFoundException, ParseUUIDPipe } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { TenantService } from './tenant.service';
import { Public } from '../../common/decorators/public.decorator';
import { FlexibleAccessGuard } from '../../auth/guards/flexible-access.guard';
import { RequireAnyOfRoles } from '../../auth/decorators/flexible-access.decorator';
import { UserType } from '../user/enums/user-type.enum';
import {
  SetSubdomainDto,
  SetCustomDomainDto,
  UpdateLoginBrandingDto,
  UpdateTierDto,
  UpdateBillingConfigDto,
  UpdateVisibilityDto,
  UpdateSmsSettingsDto,
  InstituteBrandingResponse,
} from './dto/tenant.dto';

@ApiTags('Tenant / Multi-Tenancy')
@Controller('v2/tenant')
export class TenantController {
  constructor(private readonly tenantService: TenantService) {}

  // ═══════════════════════════════════════════════════════════════════
  // PUBLIC ENDPOINTS (no auth — used by login page before user signs in)
  // ═══════════════════════════════════════════════════════════════════

  @Public()
  @Get('branding/subdomain/:subdomain')
  @Throttle({ default: { limit: 20, ttl: 60000 } }) // 🔒 SECURITY: 20 req/min to prevent enumeration
  @ApiOperation({ summary: 'Get login branding for a subdomain (public)' })
  @ApiResponse({ status: 200, description: 'Institute branding returned' })
  @ApiResponse({ status: 404, description: 'Subdomain not found or not active' })
  async getBrandingBySubdomain(
    @Param('subdomain') subdomain: string,
  ): Promise<InstituteBrandingResponse> {
    const branding = await this.tenantService.resolveBySubdomain(subdomain);
    if (!branding) throw new NotFoundException('Institute not found for this subdomain');
    return branding;
  }

  @Public()
  @Get('branding/domain/:domain')
  @Throttle({ default: { limit: 20, ttl: 60000 } }) // 🔒 SECURITY: 20 req/min to prevent enumeration
  @ApiOperation({ summary: 'Get login branding for a custom domain (public)' })
  @ApiResponse({ status: 200, description: 'Institute branding returned' })
  @ApiResponse({ status: 404, description: 'Custom domain not found or not verified' })
  async getBrandingByDomain(
    @Param('domain') domain: string,
  ): Promise<InstituteBrandingResponse> {
    const branding = await this.tenantService.resolveByCustomDomain(domain);
    if (!branding) throw new NotFoundException('Institute not found for this domain');
    return branding;
  }

  @Public()
  @Get('subdomain/check/:subdomain')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Check if a subdomain is available (public)' })
  async checkSubdomainAvailability(
    @Param('subdomain') subdomain: string,
  ): Promise<{ available: boolean }> {
    const available = await this.tenantService.isSubdomainAvailable(subdomain);
    return { available };
  }

  // ═══════════════════════════════════════════════════════════════════
  // ADMIN ENDPOINTS (requires JWT auth — institute or system admin)
  // ═══════════════════════════════════════════════════════════════════

  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @Patch('institutes/:id/subdomain')
  @ApiOperation({ summary: 'Set or update subdomain for an institute' })
  async setSubdomain(
    @Param('id') id: string,
    @Body() dto: SetSubdomainDto,
  ) {
    const institute = await this.tenantService.setSubdomain(id, dto);
    return {
      success: true,
      subdomain: institute.subdomain,
      url: `https://${institute.subdomain}.suraksha.lk`,
    };
  }

  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @Delete('institutes/:id/subdomain')
  @ApiOperation({ summary: 'Remove subdomain from an institute' })
  async removeSubdomain(@Param('id') id: string) {
    await this.tenantService.removeSubdomain(id);
    return { success: true, message: 'Subdomain removed' };
  }

  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @Patch('institutes/:id/custom-domain')
  @ApiOperation({ summary: 'Set custom domain for an institute (ENTERPRISE+)' })
  async setCustomDomain(
    @Param('id') id: string,
    @Body() dto: SetCustomDomainDto,
  ) {
    const institute = await this.tenantService.setCustomDomain(id, dto);
    return {
      success: true,
      domain: institute.customDomain,
      verified: institute.customDomainVerified,
      message: 'Set CNAME record pointing to proxy.suraksha.lk, then verify.',
    };
  }

  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @Post('institutes/:id/verify-domain')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify custom domain DNS configuration' })
  async verifyCustomDomain(@Param('id') id: string) {
    return this.tenantService.verifyCustomDomain(id);
  }

  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @Patch('institutes/:id/login-branding')
  @ApiOperation({ summary: 'Update login page branding for an institute' })
  async updateLoginBranding(
    @Param('id') id: string,
    @Body() dto: UpdateLoginBrandingDto,
  ) {
    await this.tenantService.updateLoginBranding(id, dto);
    return { success: true };
  }

  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
  @Patch('institutes/:id/tier')
  @ApiOperation({ summary: 'Update institute tier (system admin only)' })
  async updateTier(
    @Param('id') id: string,
    @Body() dto: UpdateTierDto,
  ) {
    const institute = await this.tenantService.updateTier(id, dto);
    return { success: true, tier: institute.tier };
  }

  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @Patch('institutes/:id/visibility')
  @ApiOperation({ summary: 'Update institute visibility settings' })
  async updateVisibility(
    @Param('id') id: string,
    @Body() dto: UpdateVisibilityDto,
  ) {
    const institute = await this.tenantService.updateVisibility(id, dto);
    return {
      success: true,
      isVisibleInApp: institute.isVisibleInApp,
      isVisibleInWebSelector: institute.isVisibleInWebSelector,
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  // BILLING ENDPOINTS
  // ═══════════════════════════════════════════════════════════════════

  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @Get('institutes/:id/billing-config')
  @ApiOperation({ summary: 'Get billing configuration for an institute' })
  async getBillingConfig(@Param('id') id: string) {
    const config = await this.tenantService.getBillingConfig(id);
    if (!config) throw new NotFoundException('No billing configuration found');
    return config;
  }

  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
  @Patch('institutes/:id/billing-config')
  @ApiOperation({ summary: 'Update billing configuration (system admin)' })
  async updateBillingConfig(
    @Param('id') id: string,
    @Body() dto: UpdateBillingConfigDto,
  ) {
    const config = await this.tenantService.updateBillingConfig(id, dto);
    return { success: true, config };
  }

  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @Get('institutes/:id/billing-summary')
  @ApiOperation({ summary: 'Get billing summary for a month' })
  async getBillingSummary(
    @Param('id') id: string,
    @Query('year') year: string,
    @Query('month') month: string,
  ) {
    const y = parseInt(year) || new Date().getFullYear();
    const m = parseInt(month) || new Date().getMonth() + 1;
    const summary = await this.tenantService.getBillingSummary(id, y, m);
    if (!summary) throw new NotFoundException('No billing summary for this period');
    return summary;
  }

  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @Get('institutes/:id/login-stats')
  @ApiOperation({ summary: 'Get login statistics for billing' })
  async getLoginStats(
    @Param('id') id: string,
    @Query('year') year: string,
    @Query('month') month: string,
  ) {
    const y = parseInt(year) || new Date().getFullYear();
    const m = parseInt(month) || new Date().getMonth() + 1;
    return this.tenantService.getLoginStats(id, y, m);
  }

  // ═══════════════════════════════════════════════════════════════════
  // SMS SETTINGS ENDPOINTS
  // ═══════════════════════════════════════════════════════════════════

  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @Get('institutes/:id/sms-settings')
  @ApiOperation({ summary: 'Get SMS sender settings for an institute' })
  async getSmsSettings(@Param('id') id: string) {
    return this.tenantService.getSmsSettings(id);
  }

  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @Patch('institutes/:id/sms-settings')
  @ApiOperation({ summary: 'Update SMS sender settings for an institute' })
  async updateSmsSettings(
    @Param('id') id: string,
    @Body() dto: UpdateSmsSettingsDto,
  ) {
    return this.tenantService.updateSmsSettings(id, dto);
  }

  // ═══════════════════════════════════════════════════════════════════
  // PLAN INFO ENDPOINT
  // ═══════════════════════════════════════════════════════════════════

  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @Get('institutes/:id/plan-info')
  @ApiOperation({ summary: 'Get plan/tier info with feature flags and billing' })
  async getPlanInfo(@Param('id') id: string) {
    return this.tenantService.getPlanInfo(id);
  }
}
