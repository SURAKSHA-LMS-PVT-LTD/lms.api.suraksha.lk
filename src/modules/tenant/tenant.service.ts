import { Injectable, Logger, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { InstituteEntity } from '../institute/entities/institute.entity';
import { LoginEventEntity } from './entities/login-event.entity';
import { InstituteBillingConfigEntity } from './entities/institute-billing-config.entity';
import { MonthlyBillingSummaryEntity } from './entities/monthly-billing-summary.entity';
import { InstituteTier, LoginMethod, LoginBackgroundType } from '../institute/enums/institute.enums';
import {
  RESERVED_SUBDOMAINS,
  SetSubdomainDto,
  SetCustomDomainDto,
  UpdateLoginBrandingDto,
  InstituteBrandingResponse,
  UpdateTierDto,
  UpdateBillingConfigDto,
  UpdateVisibilityDto,
  UpdateSmsSettingsDto,
  SmsSettingsResponse,
  PlanInfoResponse,
} from './dto/tenant.dto';
import { SenderMaskEntity, SenderMaskStatus } from '../sms/entities/sender-mask.entity';
import { now } from '../../common/utils/timezone.util';

@Injectable()
export class TenantService {
  private readonly logger = new Logger(TenantService.name);

  constructor(
    @InjectRepository(InstituteEntity)
    private readonly instituteRepository: Repository<InstituteEntity>,
    @InjectRepository(LoginEventEntity)
    private readonly loginEventRepository: Repository<LoginEventEntity>,
    @InjectRepository(InstituteBillingConfigEntity)
    private readonly billingConfigRepository: Repository<InstituteBillingConfigEntity>,
    @InjectRepository(MonthlyBillingSummaryEntity)
    private readonly billingSummaryRepository: Repository<MonthlyBillingSummaryEntity>,
    @InjectRepository(SenderMaskEntity)
    private readonly senderMaskRepository: Repository<SenderMaskEntity>,
    private readonly dataSource: DataSource,
  ) {}

  // ═══════════════════════════════════════════════════════════════════
  // PUBLIC RESOLUTION (called from login flow — no auth required)
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Resolve institute by subdomain for login page branding.
   * Returns public branding data only — no sensitive fields.
   */
  async resolveBySubdomain(subdomain: string): Promise<InstituteBrandingResponse | null> {
    const institute = await this.instituteRepository.findOne({
      where: { subdomain, isActive: true, customLoginEnabled: true },
      select: [
        'id', 'name', 'code', 'tier', 'logoUrl', 'primaryColorCode', 'secondaryColorCode',
        'loginLogoUrl', 'loginBackgroundType', 'loginBackgroundUrl', 'loginVideoPosterUrl',
        'loginIllustrationUrl', 'loginWelcomeTitle', 'loginWelcomeSubtitle', 'loginFooterText',
        'loginCustomCss', 'faviconUrl', 'customAppName', 'poweredByVisible',
      ],
    });

    if (!institute) return null;

    return this.toBrandingResponse(institute);
  }

  /**
   * Resolve institute by custom domain for login page branding.
   */
  async resolveByCustomDomain(domain: string): Promise<InstituteBrandingResponse | null> {
    const institute = await this.instituteRepository.findOne({
      where: { customDomain: domain, isActive: true, customDomainVerified: true, customLoginEnabled: true },
      select: [
        'id', 'name', 'code', 'tier', 'logoUrl', 'primaryColorCode', 'secondaryColorCode',
        'loginLogoUrl', 'loginBackgroundType', 'loginBackgroundUrl', 'loginVideoPosterUrl',
        'loginIllustrationUrl', 'loginWelcomeTitle', 'loginWelcomeSubtitle', 'loginFooterText',
        'loginCustomCss', 'faviconUrl', 'customAppName', 'poweredByVisible',
      ],
    });

    if (!institute) return null;

    return this.toBrandingResponse(institute);
  }

  /**
   * Get institute ID by subdomain (used in login flow for validation)
   */
  async getInstituteIdBySubdomain(subdomain: string): Promise<string | null> {
    const institute = await this.instituteRepository.findOne({
      where: { subdomain, isActive: true },
      select: ['id'],
    });
    return institute?.id || null;
  }

  /**
   * Get institute ID by custom domain (used in login flow for validation)
   */
  async getInstituteIdByCustomDomain(domain: string): Promise<string | null> {
    const institute = await this.instituteRepository.findOne({
      where: { customDomain: domain, isActive: true, customDomainVerified: true },
      select: ['id'],
    });
    return institute?.id || null;
  }

  /**
   * Verify custom domain DNS (CNAME check).
   * Placeholder — Cloudflare integration added later via env vars.
   */
  async verifyCustomDomain(instituteId: string): Promise<{ verified: boolean; message: string }> {
    const institute = await this.instituteRepository.findOne({ where: { id: instituteId } });
    if (!institute) throw new NotFoundException('Institute not found');
    if (!institute.customDomain) throw new BadRequestException('No custom domain configured');

    // TODO: When CLOUDFLARE_API_TOKEN env is set, call Cloudflare API to verify CNAME
    // For now, mark as pending — system admin can manually verify
    return {
      verified: false,
      message: `DNS verification pending for ${institute.customDomain}. Ensure CNAME points to proxy.suraksha.lk`,
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  // SUBDOMAIN MANAGEMENT (Institute Admin / System Admin)
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Set or update subdomain for an institute.
   */
  async setSubdomain(instituteId: string, dto: SetSubdomainDto): Promise<InstituteEntity> {
    const subdomain = dto.subdomain.toLowerCase();

    // Check reserved subdomains
    if (RESERVED_SUBDOMAINS.includes(subdomain)) {
      throw new BadRequestException(`Subdomain "${subdomain}" is reserved and cannot be used`);
    }

    // Check uniqueness
    const existing = await this.instituteRepository.findOne({ where: { subdomain } });
    if (existing && existing.id !== instituteId) {
      throw new ConflictException(`Subdomain "${subdomain}" is already taken`);
    }

    const institute = await this.instituteRepository.findOne({ where: { id: instituteId } });
    if (!institute) throw new NotFoundException('Institute not found');

    // Set subdomain and enable custom login
    institute.subdomain = subdomain;
    institute.customLoginEnabled = true;
    if (institute.tier === InstituteTier.FREE) {
      institute.tier = InstituteTier.STARTER;
    }
    institute.updatedAt = now();

    const saved = await this.instituteRepository.save(institute);

    // Auto-create billing config if not exists
    await this.ensureBillingConfig(instituteId, institute.tier);

    this.logger.log(`✅ Subdomain set: ${subdomain}.suraksha.lk → institute ${instituteId}`);
    return saved;
  }

  /**
   * Remove subdomain from an institute (revert to free).
   */
  async removeSubdomain(instituteId: string): Promise<void> {
    await this.instituteRepository
      .createQueryBuilder()
      .update()
      .set({ subdomain: () => 'NULL', customLoginEnabled: false, updatedAt: now() })
      .where('id = :id', { id: instituteId })
      .execute();
    this.logger.log(`Subdomain removed for institute ${instituteId}`);
  }

  /**
   * Set custom domain for an institute.
   */
  async setCustomDomain(instituteId: string, dto: SetCustomDomainDto): Promise<InstituteEntity> {
    const domain = dto.domain.toLowerCase();

    const existing = await this.instituteRepository.findOne({ where: { customDomain: domain } });
    if (existing && existing.id !== instituteId) {
      throw new ConflictException(`Domain "${domain}" is already registered`);
    }

    const institute = await this.instituteRepository.findOne({ where: { id: instituteId } });
    if (!institute) throw new NotFoundException('Institute not found');

    if (institute.tier !== InstituteTier.ENTERPRISE && institute.tier !== InstituteTier.ISOLATED) {
      throw new BadRequestException('Custom domains require ENTERPRISE or ISOLATED tier');
    }

    institute.customDomain = domain;
    institute.customDomainVerified = false;
    institute.customDomainSslStatus = null;
    institute.customLoginEnabled = true;
    institute.updatedAt = now();

    return this.instituteRepository.save(institute);
  }

  // ═══════════════════════════════════════════════════════════════════
  // LOGIN BRANDING MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════

  async updateLoginBranding(instituteId: string, dto: UpdateLoginBrandingDto): Promise<InstituteEntity> {
    const institute = await this.instituteRepository.findOne({ where: { id: instituteId } });
    if (!institute) throw new NotFoundException('Institute not found');

    // Auto-upgrade FREE tier to STARTER when saving branding
    if (institute.tier === InstituteTier.FREE) {
      institute.tier = InstituteTier.STARTER;
      await this.ensureBillingConfig(instituteId, InstituteTier.STARTER);
      this.logger.log(`Auto-upgraded institute ${instituteId} to STARTER tier on branding update`);
    }

    // Tier-based restrictions
    if (dto.loginBackgroundType === LoginBackgroundType.VIDEO) {
      if (institute.tier === InstituteTier.STARTER) {
        throw new BadRequestException('Video backgrounds require PROFESSIONAL tier or higher');
      }
    }

    if (dto.poweredByVisible === false) {
      if (institute.tier === InstituteTier.STARTER) {
        throw new BadRequestException('Hiding "Powered by" badge requires PROFESSIONAL tier or higher');
      }
    }

    // 🔒 SECURITY: Sanitize loginCustomCss to prevent CSS injection attacks
    if (dto.loginCustomCss) {
      const ALLOWED_CSS_PROPERTIES = new Set([
        'color', 'background-color', 'background', 'font-size', 'font-family',
        'font-weight', 'text-align', 'border-radius', 'padding', 'margin',
        'border', 'border-color', 'opacity', 'line-height', 'letter-spacing',
      ]);
      const entries = Object.entries(dto.loginCustomCss);
      if (entries.length > 10) {
        throw new BadRequestException('loginCustomCss may contain at most 10 properties');
      }
      for (const [key, value] of entries) {
        if (!ALLOWED_CSS_PROPERTIES.has(key)) {
          throw new BadRequestException(`CSS property "${key}" is not allowed`);
        }
        if (typeof value !== 'string' || value.length > 200) {
          throw new BadRequestException(`CSS value for "${key}" must be a string under 200 chars`);
        }
        // Block url(), expression(), import, javascript: in CSS values
        if (/url\s*\(|expression\s*\(|@import|javascript:|data:/i.test(value)) {
          throw new BadRequestException(`CSS value for "${key}" contains forbidden content`);
        }
      }
    }

    // Apply updates
    Object.assign(institute, dto);
    institute.updatedAt = now();

    return this.instituteRepository.save(institute);
  }

  // ═══════════════════════════════════════════════════════════════════
  // TIER & BILLING MANAGEMENT (System Admin)
  // ═══════════════════════════════════════════════════════════════════

  async updateTier(instituteId: string, dto: UpdateTierDto): Promise<InstituteEntity> {
    const institute = await this.instituteRepository.findOne({ where: { id: instituteId } });
    if (!institute) throw new NotFoundException('Institute not found');

    institute.tier = dto.tier;
    institute.updatedAt = now();

    // Auto-set defaults based on tier
    if (dto.tier === InstituteTier.FREE) {
      institute.customLoginEnabled = false;
      institute.subdomain = null;
      institute.customDomain = null;
    }

    const saved = await this.instituteRepository.save(institute);
    await this.ensureBillingConfig(instituteId, dto.tier);

    return saved;
  }

  async updateBillingConfig(instituteId: string, dto: UpdateBillingConfigDto): Promise<InstituteBillingConfigEntity> {
    let config = await this.billingConfigRepository.findOne({ where: { instituteId } });
    if (!config) {
      const institute = await this.instituteRepository.findOne({ where: { id: instituteId } });
      if (!institute) throw new NotFoundException('Institute not found');
      config = await this.ensureBillingConfig(instituteId, institute.tier);
    }

    Object.assign(config, dto);
    config.updatedAt = now();

    return this.billingConfigRepository.save(config);
  }

  async getBillingConfig(instituteId: string): Promise<InstituteBillingConfigEntity | null> {
    return this.billingConfigRepository.findOne({ where: { instituteId } });
  }

  async updateVisibility(instituteId: string, dto: UpdateVisibilityDto): Promise<InstituteEntity> {
    const institute = await this.instituteRepository.findOne({ where: { id: instituteId } });
    if (!institute) throw new NotFoundException('Institute not found');

    if (dto.isVisibleInApp !== undefined) institute.isVisibleInApp = dto.isVisibleInApp;
    if (dto.isVisibleInWebSelector !== undefined) institute.isVisibleInWebSelector = dto.isVisibleInWebSelector;
    institute.updatedAt = now();

    return this.instituteRepository.save(institute);
  }

  // ═══════════════════════════════════════════════════════════════════
  // LOGIN EVENT TRACKING (called async from auth flow)
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Record a login event. Called fire-and-forget from auth service.
   * Never blocks the login response.
   */
  async recordLoginEvent(
    userId: string,
    loginMethod: LoginMethod,
    instituteId?: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<void> {
    try {
      await this.loginEventRepository.insert({
        userId,
        instituteId: instituteId || undefined,
        loginMethod,
        ipAddress,
        userAgent: userAgent?.substring(0, 500),
      });
    } catch (error: any) {
      // Never fail the login — log and move on
      this.logger.warn(`Failed to record login event: ${error.message}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // BILLING CALCULATION
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Get billing summary for an institute for a given month.
   */
  async getBillingSummary(instituteId: string, year: number, month: number): Promise<MonthlyBillingSummaryEntity | null> {
    // Use string date format for reliable MySQL DATE comparison
    const billingMonthStr = `${year}-${String(month).padStart(2, '0')}-01`;
    return this.billingSummaryRepository
      .createQueryBuilder('mbs')
      .where('mbs.institute_id = :instituteId', { instituteId })
      .andWhere('mbs.billing_month = :billingMonth', { billingMonth: billingMonthStr })
      .getOne();
  }

  /**
   * Get login stats for billing dashboard.
   */
  async getLoginStats(instituteId: string, year: number, month: number) {
    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = new Date(year, month, 0, 23, 59, 59);

    const stats = await this.loginEventRepository
      .createQueryBuilder('le')
      .select('le.login_method', 'loginMethod')
      .addSelect('COUNT(*)', 'totalLogins')
      .addSelect('COUNT(DISTINCT le.user_id)', 'uniqueUsers')
      .where('le.institute_id = :instituteId', { instituteId })
      .andWhere('le.login_timestamp BETWEEN :start AND :end', { start: monthStart, end: monthEnd })
      .groupBy('le.login_method')
      .getRawMany();

    return stats;
  }

  // ═══════════════════════════════════════════════════════════════════
  // SMS SETTINGS MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════

  async getSmsSettings(instituteId: string): Promise<SmsSettingsResponse> {
    const institute = await this.instituteRepository.findOne({ where: { id: instituteId } });
    if (!institute) throw new NotFoundException('Institute not found');

    const activeMasks = await this.senderMaskRepository.find({
      where: { instituteId, status: SenderMaskStatus.ACTIVE },
      order: { isDefault: 'DESC', displayName: 'ASC' },
    });

    const effectiveSmsSender = institute.smsSenderName || 'SurakshaLMS';

    return {
      smsSenderName: institute.smsSenderName || null,
      emailSenderAddress: institute.emailSenderAddress || null,
      emailSenderName: institute.emailSenderName || null,
      effectiveSmsSender,
      activeMasks: activeMasks.map(m => ({
        maskId: m.maskId,
        displayName: m.displayName,
        isDefault: m.isDefault,
        status: m.status,
      })),
      tier: institute.tier,
    };
  }

  async updateSmsSettings(instituteId: string, dto: UpdateSmsSettingsDto): Promise<SmsSettingsResponse> {
    const institute = await this.instituteRepository.findOne({ where: { id: instituteId } });
    if (!institute) throw new NotFoundException('Institute not found');

    // If setting a custom SMS sender name, must have an approved mask or be PROFESSIONAL+
    if (dto.smsSenderName !== undefined) {
      if (dto.smsSenderName === null || dto.smsSenderName === '') {
        institute.smsSenderName = null;
      } else {
        // Validate the mask exists and is approved for this institute
        const mask = await this.senderMaskRepository.findOne({
          where: { instituteId, maskId: dto.smsSenderName, status: SenderMaskStatus.ACTIVE },
        });
        if (!mask) {
          throw new BadRequestException(
            `SMS sender mask "${dto.smsSenderName}" is not approved for this institute. Request approval first.`,
          );
        }
        institute.smsSenderName = dto.smsSenderName;
      }
    }

    if (dto.emailSenderAddress !== undefined) {
      institute.emailSenderAddress = dto.emailSenderAddress || null;
    }
    if (dto.emailSenderName !== undefined) {
      institute.emailSenderName = dto.emailSenderName || null;
    }

    institute.updatedAt = now();
    await this.instituteRepository.save(institute);

    return this.getSmsSettings(instituteId);
  }

  // ═══════════════════════════════════════════════════════════════════
  // PLAN INFO
  // ═══════════════════════════════════════════════════════════════════

  async getPlanInfo(instituteId: string): Promise<PlanInfoResponse> {
    const institute = await this.instituteRepository.findOne({ where: { id: instituteId } });
    if (!institute) throw new NotFoundException('Institute not found');

    const tier = institute.tier || InstituteTier.FREE;
    const billingConfig = await this.billingConfigRepository.findOne({ where: { instituteId } });

    return {
      tier,
      features: {
        subdomain: true, // All tiers can set subdomain (auto-upgrades from FREE to STARTER)
        customDomain: tier === InstituteTier.ENTERPRISE || tier === InstituteTier.ISOLATED,
        loginBranding: true, // All tiers can customize branding (auto-upgrades from FREE to STARTER)
        videoBackground: tier !== InstituteTier.FREE && tier !== InstituteTier.STARTER,
        hidePoweredBy: tier !== InstituteTier.FREE && tier !== InstituteTier.STARTER,
        smsMasking: tier !== InstituteTier.FREE,
        whiteLabel: tier === InstituteTier.ISOLATED,
      },
      billing: billingConfig ? {
        baseMonthlyFee: Number(billingConfig.baseMonthlyFee) || 0,
        perUserMonthlyFee: Number(billingConfig.perUserMonthlyFee) || 0,
        perSubdomainLoginFee: Number(billingConfig.perSubdomainLoginFee) || 0,
        smsMaskingMonthlyFee: Number(billingConfig.smsMaskingMonthlyFee) || 0,
        maxFreeSubdomainLogins: Number(billingConfig.maxFreeSubdomainLogins) || 0,
      } : null,
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════

  private toBrandingResponse(institute: InstituteEntity): InstituteBrandingResponse {
    return {
      id: institute.id,
      name: institute.name,
      code: institute.code,
      tier: institute.tier,
      logoUrl: institute.logoUrl,
      primaryColorCode: institute.primaryColorCode,
      secondaryColorCode: institute.secondaryColorCode,
      loginLogoUrl: institute.loginLogoUrl,
      loginBackgroundType: institute.loginBackgroundType || LoginBackgroundType.COLOR,
      loginBackgroundUrl: institute.loginBackgroundUrl,
      loginVideoPosterUrl: institute.loginVideoPosterUrl,
      loginIllustrationUrl: institute.loginIllustrationUrl,
      loginWelcomeTitle: institute.loginWelcomeTitle,
      loginWelcomeSubtitle: institute.loginWelcomeSubtitle,
      loginFooterText: institute.loginFooterText,
      loginCustomCss: institute.loginCustomCss,
      faviconUrl: institute.faviconUrl,
      customAppName: institute.customAppName,
      poweredByVisible: institute.poweredByVisible ?? true,
    };
  }

  private async ensureBillingConfig(instituteId: string, tier: InstituteTier): Promise<InstituteBillingConfigEntity> {
    let config = await this.billingConfigRepository.findOne({ where: { instituteId } });
    if (config) {
      config.tier = tier;
      config.updatedAt = now();
      return this.billingConfigRepository.save(config);
    }

    // Create with tier defaults
    const defaults: Partial<InstituteBillingConfigEntity> = { instituteId, tier, createdAt: now(), updatedAt: now() };

    switch (tier) {
      case InstituteTier.STARTER:
        defaults.baseMonthlyFee = 2500;
        defaults.perSubdomainLoginFee = 25;
        defaults.maxFreeSubdomainLogins = 50;
        break;
      case InstituteTier.PROFESSIONAL:
        defaults.baseMonthlyFee = 5000;
        defaults.perSubdomainLoginFee = 25;
        defaults.maxFreeSubdomainLogins = 100;
        break;
      case InstituteTier.ENTERPRISE:
        defaults.baseMonthlyFee = 15000;
        defaults.perUserMonthlyFee = 50;
        break;
      case InstituteTier.ISOLATED:
        defaults.baseMonthlyFee = 30000;
        defaults.perUserMonthlyFee = 75;
        break;
    }

    return this.billingConfigRepository.save(this.billingConfigRepository.create(defaults));
  }

  /**
   * Check if a subdomain is available.
   */
  async isSubdomainAvailable(subdomain: string): Promise<boolean> {
    if (RESERVED_SUBDOMAINS.includes(subdomain.toLowerCase())) return false;
    const existing = await this.instituteRepository.findOne({ where: { subdomain: subdomain.toLowerCase() } });
    return !existing;
  }
}
