import { Injectable, Logger, BadRequestException, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { InstituteEntity } from '../institute/entities/institute.entity';
import { LoginEventEntity } from './entities/login-event.entity';
import { InstituteBillingConfigEntity } from './entities/institute-billing-config.entity';
import { MonthlyBillingSummaryEntity } from './entities/monthly-billing-summary.entity';
import { TenantServicePaymentEntity, TenantServicePaymentStatus, TenantServiceType } from './entities/tenant-billing-payment.entity';
import { InstituteTier, LoginMethod, LoginBackgroundType } from '../institute/enums/institute.enums';
import { UserType } from '../user/enums/user-type.enum';
import { InstituteSmsCredentialsEntity } from '../sms/entities/institute-sms-credentials.entity';
import { InstituteCreditsService } from '../notification-credits/services/institute-credits.service';
import { CreditTransactionType } from '../notification-credits/entities/institute-credit-transaction.entity';
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
  SubmitTenantServicePaymentDto,
  VerifyTenantServicePaymentDto,
  TenantServicePaymentFilterDto,
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
    @InjectRepository(TenantServicePaymentEntity)
    private readonly servicePaymentRepository: Repository<TenantServicePaymentEntity>,
    @InjectRepository(InstituteSmsCredentialsEntity)
    private readonly smsCredentialsRepository: Repository<InstituteSmsCredentialsEntity>,
    @InjectRepository(SenderMaskEntity)
    private readonly senderMaskRepository: Repository<SenderMaskEntity>,
    @InjectRepository(PackageDefinitionEntity)
    private readonly packageDefinitionRepository: Repository<PackageDefinitionEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    private readonly dataSource: DataSource,
    private readonly instituteCreditsService: InstituteCreditsService,
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
        'loginCustomCss', 'faviconUrl', 'customAppName', 'poweredByVisible', 'subdomain', 'customDomain',
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
        'loginCustomCss', 'faviconUrl', 'customAppName', 'poweredByVisible', 'subdomain', 'customDomain',
      ],
    });

    if (!institute) {
      // Log why it failed so we can debug in Cloud Run logs
      const raw = await this.instituteRepository.findOne({
        where: { customDomain: domain },
        select: ['id', 'isActive', 'customDomainVerified', 'customLoginEnabled', 'tier'],
      });
      if (raw) {
        this.logger.warn(
          `[BrandingDomain] domain=${domain} found institute=${raw.id} but blocked: ` +
          `isActive=${raw.isActive} verified=${raw.customDomainVerified} loginEnabled=${raw.customLoginEnabled} tier=${raw.tier}`,
        );
      } else {
        this.logger.warn(`[BrandingDomain] domain=${domain} not found in DB`);
      }
      return null;
    }

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
   * Verify custom domain — marks the domain as verified in the DB.
   * Admins call this after confirming DNS is correctly configured.
   */
  async verifyCustomDomain(instituteId: string): Promise<{ verified: boolean; message: string }> {
    const institute = await this.instituteRepository.findOne({ where: { id: instituteId } });
    if (!institute) throw new NotFoundException('Institute not found');
    if (!institute.customDomain) throw new BadRequestException('No custom domain configured');

    institute.customDomainVerified = true;
    institute.customLoginEnabled = true;
    institute.updatedAt = now();
    await this.instituteRepository.save(institute);

    this.logger.log(`✅ Custom domain verified: ${institute.customDomain} → institute ${instituteId}`);
    return {
      verified: true,
      message: `Domain ${institute.customDomain} marked as verified. Custom login is now active.`,
    };
  }

  /**
   * Force-verify custom domain (SUPERADMIN only) — bypasses any DNS restrictions.
   */
  async forceVerifyDomain(instituteId: string): Promise<{ verified: boolean; message: string }> {
    const institute = await this.instituteRepository.findOne({ where: { id: instituteId } });
    if (!institute) throw new NotFoundException('Institute not found');
    if (!institute.customDomain) throw new BadRequestException('No custom domain configured');

    institute.customDomainVerified = true;
    institute.customLoginEnabled = true;
    institute.updatedAt = now();
    await this.instituteRepository.save(institute);

    this.logger.log(`✅ Custom domain force-verified: ${institute.customDomain} → institute ${instituteId}`);
    return {
      verified: true,
      message: `Domain ${institute.customDomain} force-verified by system administrator.`,
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

    // Require at least STARTER tier for subdomain
    if (institute.tier === InstituteTier.FREE) {
      throw new BadRequestException('Subdomain requires STARTER tier or higher. Please upgrade your plan.');
    }

    // Set subdomain and enable custom login
    institute.subdomain = subdomain;
    institute.customLoginEnabled = true;
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

  async getLoginBranding(instituteId: string): Promise<{
    loginLogoUrl?: string | null;
    loginBackgroundType?: string | null;
    loginBackgroundUrl?: string | null;
    loginVideoPosterUrl?: string | null;
    loginIllustrationUrl?: string | null;
    loginWelcomeTitle?: string | null;
    loginWelcomeSubtitle?: string | null;
    loginFooterText?: string | null;
    faviconUrl?: string | null;
    customAppName?: string | null;
    poweredByVisible?: boolean;
  }> {
    const institute = await this.instituteRepository.findOne({
      where: { id: instituteId },
      select: [
        'id', 'loginLogoUrl', 'loginBackgroundType', 'loginBackgroundUrl',
        'loginVideoPosterUrl', 'loginIllustrationUrl', 'loginWelcomeTitle',
        'loginWelcomeSubtitle', 'loginFooterText', 'faviconUrl',
        'customAppName', 'poweredByVisible',
      ],
    });
    if (!institute) throw new NotFoundException('Institute not found');
    return {
      loginLogoUrl: institute.loginLogoUrl,
      loginBackgroundType: institute.loginBackgroundType,
      loginBackgroundUrl: institute.loginBackgroundUrl,
      loginVideoPosterUrl: institute.loginVideoPosterUrl,
      loginIllustrationUrl: institute.loginIllustrationUrl,
      loginWelcomeTitle: institute.loginWelcomeTitle,
      loginWelcomeSubtitle: institute.loginWelcomeSubtitle,
      loginFooterText: institute.loginFooterText,
      faviconUrl: institute.faviconUrl,
      customAppName: institute.customAppName,
      poweredByVisible: institute.poweredByVisible ?? true,
    };
  }

  async updateLoginBranding(instituteId: string, dto: UpdateLoginBrandingDto, currentUser?: any): Promise<InstituteEntity> {
    const institute = await this.instituteRepository.findOne({ where: { id: instituteId } });
    if (!institute) throw new NotFoundException('Institute not found');

    if (institute.tier === InstituteTier.FREE) {
      throw new BadRequestException('Login branding customization requires STARTER tier or higher. Please upgrade your plan.');
    }

    // Only system administrators can change the poweredByVisible setting
    if (dto.poweredByVisible !== undefined) {
      const isSuperAdmin = currentUser?.userType === UserType.SUPERADMIN;
      if (!isSuperAdmin) {
        throw new ForbiddenException('Only system administrators can change the "Powered by SurakshaLMS" setting');
      }
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
      subdomain: institute.subdomain || null,
      customDomain: institute.customDomain || null,
      customDomainVerified: institute.customDomainVerified || false,
      features: {
        subdomain: tier !== InstituteTier.FREE,
        customDomain: tier === InstituteTier.ENTERPRISE || tier === InstituteTier.ISOLATED,
        loginBranding: tier !== InstituteTier.FREE,
        videoBackground: tier === InstituteTier.PROFESSIONAL || tier === InstituteTier.ENTERPRISE || tier === InstituteTier.ISOLATED,
        hidePoweredBy: tier === InstituteTier.PROFESSIONAL || tier === InstituteTier.ENTERPRISE || tier === InstituteTier.ISOLATED,
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
      subdomain: institute.subdomain ?? null,
      customDomain: institute.customDomain ?? null,
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

  /**
   * Get a global billing overview across all institutes.
   * Returns summary of all institutes with tier/subdomain/billing info.
   */
  async getBillingOverview(year: number, month: number) {
    const billingMonth = new Date(`${year}-${String(month).padStart(2, '0')}-01`);

    // Get all active institutes with their tier, subdomain, domain info
    const institutes = await this.instituteRepository.find({
      where: { isActive: true },
      select: ['id', 'name', 'shortName', 'tier', 'subdomain', 'customDomain', 'customDomainVerified', 'logoUrl'],
      order: { name: 'ASC' },
    });

    // Get all billing configs
    const billingConfigs = await this.billingConfigRepository.find({
      where: { isActive: true },
    });
    const configMap = new Map(billingConfigs.map(c => [c.instituteId, c]));

    // Get all billing summaries for the requested month
    const summaries = await this.billingSummaryRepository.find({
      where: { billingMonth },
    });
    const summaryMap = new Map(summaries.map(s => [s.instituteId, s]));

    // Build per-institute overview
    const instituteOverviews = institutes.map(inst => {
      const config = configMap.get(inst.id);
      const summary = summaryMap.get(inst.id);
      return {
        id: inst.id,
        name: inst.name,
        shortName: inst.shortName,
        tier: inst.tier || 'FREE',
        subdomain: inst.subdomain || null,
        customDomain: inst.customDomain || null,
        customDomainVerified: inst.customDomainVerified || false,
        billing: config ? {
          baseMonthlyFee: Number(config.baseMonthlyFee) || 0,
          perUserMonthlyFee: Number(config.perUserMonthlyFee) || 0,
          perSubdomainLoginFee: Number(config.perSubdomainLoginFee) || 0,
          smsMaskingMonthlyFee: Number(config.smsMaskingMonthlyFee) || 0,
          currency: config.currency || 'LKR',
        } : null,
        monthlySummary: summary ? {
          totalLogins: summary.totalLogins || 0,
          subdomainLogins: summary.subdomainLogins || 0,
          customDomainLogins: summary.customDomainLogins || 0,
          totalActiveUsers: summary.totalActiveUsers || 0,
          baseFee: Number(summary.baseFee) || 0,
          userFee: Number(summary.userFee) || 0,
          loginFee: Number(summary.loginFee) || 0,
          smsMaskingFee: Number(summary.smsMaskingFee) || 0,
          totalFee: Number(summary.totalFee) || 0,
          status: summary.status || 'PENDING',
          paidAt: summary.paidAt || null,
        } : null,
      };
    });

    // Compute global totals
    const tierCounts: Record<string, number> = {};
    let totalRevenue = 0;
    let totalPaid = 0;
    let totalPending = 0;
    let withSubdomain = 0;
    let withCustomDomain = 0;

    for (const inst of instituteOverviews) {
      tierCounts[inst.tier] = (tierCounts[inst.tier] || 0) + 1;
      if (inst.subdomain) withSubdomain++;
      if (inst.customDomain) withCustomDomain++;
      if (inst.monthlySummary) {
        totalRevenue += inst.monthlySummary.totalFee;
        if (inst.monthlySummary.status === 'PAID') totalPaid += inst.monthlySummary.totalFee;
        else totalPending += inst.monthlySummary.totalFee;
      }
    }

    return {
      billingMonth,
      summary: {
        totalInstitutes: institutes.length,
        tierCounts,
        withSubdomain,
        withCustomDomain,
        totalRevenue,
        totalPaid,
        totalPending,
      },
      institutes: instituteOverviews,
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  // TENANT SERVICE PAYMENTS
  // Institute admins submit payment slips for platform services.
  // System admins verify/reject submissions.
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Submit a service payment slip (institute admin action).
   * Creates a PENDING record the system admin will then verify.
   */
  async submitServicePayment(
    instituteId: string,
    submittedByUserId: string,
    dto: SubmitTenantServicePaymentDto,
  ): Promise<TenantServicePaymentEntity> {
    const institute = await this.instituteRepository.findOne({ where: { id: instituteId } });
    if (!institute) throw new NotFoundException('Institute not found');

    const payment = this.servicePaymentRepository.create({
      instituteId,
      serviceType: dto.serviceType || TenantServiceType.CREDITS,
      serviceDescription: dto.serviceDescription,
      billingMonth: dto.billingMonth,
      paymentAmount: dto.paymentAmount,
      paymentMethod: dto.paymentMethod,
      paymentReference: dto.paymentReference,
      paymentSlipUrl: dto.paymentSlipUrl,
      paymentDate: dto.paymentDate,
      notes: dto.notes,
      requestedQuantity: dto.requestedQuantity,
      serviceMetadata: dto.serviceMetadata,
      status: TenantServicePaymentStatus.PENDING,
      submittedBy: submittedByUserId,
      submittedAt: now(),
      createdAt: now(),
      updatedAt: now(),
    });

    const saved = await this.servicePaymentRepository.save(payment);
    this.logger.log(`✅ Service payment submitted: institute=${instituteId} type=${dto.serviceType} amount=${dto.paymentAmount}`);
    return saved;
  }

  /**
   * List service payments for a specific institute (institute admin view).
   */
  async getInstituteServicePayments(
    instituteId: string,
    filters: TenantServicePaymentFilterDto,
  ): Promise<{ data: TenantServicePaymentEntity[]; total: number; page: number; limit: number }> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const skip = (page - 1) * limit;

    const qb = this.servicePaymentRepository
      .createQueryBuilder('p')
      .where('p.institute_id = :instituteId', { instituteId })
      .orderBy('p.created_at', 'DESC')
      .skip(skip)
      .take(limit);

    if (filters.serviceType) qb.andWhere('p.service_type = :serviceType', { serviceType: filters.serviceType });
    if (filters.status) qb.andWhere('p.status = :status', { status: filters.status });
    if (filters.billingMonth) qb.andWhere('p.billing_month = :billingMonth', { billingMonth: filters.billingMonth });

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  /**
   * List ALL service payments across all institutes (system admin view).
   */
  async getAllServicePayments(
    filters: TenantServicePaymentFilterDto & { instituteId?: string },
  ): Promise<{ data: TenantServicePaymentEntity[]; total: number; page: number; limit: number }> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const skip = (page - 1) * limit;

    const qb = this.servicePaymentRepository
      .createQueryBuilder('p')
      .orderBy('p.created_at', 'DESC')
      .skip(skip)
      .take(limit);

    if (filters.instituteId) qb.andWhere('p.institute_id = :instituteId', { instituteId: filters.instituteId });
    if (filters.serviceType) qb.andWhere('p.service_type = :serviceType', { serviceType: filters.serviceType });
    if (filters.status) qb.andWhere('p.status = :status', { status: filters.status });
    if (filters.billingMonth) qb.andWhere('p.billing_month = :billingMonth', { billingMonth: filters.billingMonth });

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  /**
   * Get a single service payment record.
   * Institute admins can only see their own; system admins can see all.
   */
  async getServicePaymentById(
    paymentId: string,
    requestingInstituteId?: string, // undefined = system admin (no scope restriction)
  ): Promise<TenantServicePaymentEntity> {
    const payment = await this.servicePaymentRepository.findOne({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException('Service payment not found');
    if (requestingInstituteId && payment.instituteId !== requestingInstituteId) {
      throw new ForbiddenException('Access denied');
    }
    return payment;
  }

  /**
   * Verify or reject a service payment (system admin only).
   * Uses a DB transaction. On VERIFIED:
   *  - SMS_CREDITS → grants credits to InstituteSmsCredentialsEntity
   *  - Future service types can be hooked here.
   */
  async verifyServicePayment(
    paymentId: string,
    verifiedByUserId: string,
    dto: VerifyTenantServicePaymentDto,
  ): Promise<TenantServicePaymentEntity> {
    return this.dataSource.transaction(async (manager) => {
      // Pessimistic lock to prevent double-verification
      const payment = await manager.findOne(TenantServicePaymentEntity, {
        where: { id: paymentId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!payment) throw new NotFoundException('Service payment not found');

      if (payment.status !== TenantServicePaymentStatus.PENDING) {
        throw new BadRequestException(`Payment is already ${payment.status.toLowerCase()}`);
      }

      if (dto.status === TenantServicePaymentStatus.REJECTED && !dto.rejectionReason) {
        throw new BadRequestException('rejectionReason is required when rejecting a payment');
      }

      // Update payment record
      payment.status = dto.status;
      payment.verifiedBy = verifiedByUserId;
      payment.verifiedAt = now();
      payment.rejectionReason = dto.rejectionReason ?? null;
      payment.grantedQuantity = dto.grantedQuantity ?? null;
      if (dto.notes) payment.notes = dto.notes;
      payment.updatedAt = now();

      // ═══ SERVICE-SPECIFIC PROVISIONING ON VERIFICATION ═══
      if (dto.status === TenantServicePaymentStatus.VERIFIED) {
        await this.provisionServiceOnVerification(manager, payment, verifiedByUserId, dto);
      }

      const saved = await manager.save(TenantServicePaymentEntity, payment);
      this.logger.log(`🔍 Service payment ${paymentId} ${dto.status} by admin=${verifiedByUserId}`);
      return saved;
    });
  }

  /**
   * Provision the purchased service after payment is verified.
   * Each service type has its own activation logic.
   */
  private async provisionServiceOnVerification(
    manager: import('typeorm').EntityManager,
    payment: TenantServicePaymentEntity,
    adminUserId: string,
    dto: VerifyTenantServicePaymentDto,
  ): Promise<void> {
    // Credit-based services: grant credits to the institute's unified balance
    const creditServiceTypes = [
      TenantServiceType.CREDITS,
      TenantServiceType.SMS_CREDITS,
      TenantServiceType.EMAIL_CREDITS,
      TenantServiceType.WHATSAPP_CREDITS,
      TenantServiceType.STORAGE_PURCHASE,
    ];

    if (creditServiceTypes.includes(payment.serviceType)) {
      await this.grantCreditsForPayment(manager, payment, adminUserId, dto.grantedQuantity);
      return;
    }

    switch (payment.serviceType) {
      case TenantServiceType.MONTHLY_INVOICE:
        await this.markBillingSummaryPaid(manager, payment);
        break;

      default:
        this.logger.log(`No auto-provisioning for service type: ${payment.serviceType}`);
        break;
    }
  }

  /**
   * Grant credits to an institute's unified credit balance.
   * Works for SMS, email, WhatsApp, storage — all go to the same balance.
   */
  private async grantCreditsForPayment(
    manager: import('typeorm').EntityManager,
    payment: TenantServicePaymentEntity,
    adminUserId: string,
    grantedQuantity?: number,
  ): Promise<void> {
    const creditsToGrant = grantedQuantity ?? payment.requestedQuantity;
    if (!creditsToGrant || creditsToGrant <= 0) {
      throw new BadRequestException(
        'grantedQuantity (or requestedQuantity) must be specified for credit verification',
      );
    }

    const result = await this.instituteCreditsService.grantCreditsWithManager(
      manager,
      payment.instituteId,
      {
        amount: creditsToGrant,
        type: CreditTransactionType.TOP_UP,
        referenceType: 'PAYMENT',
        referenceId: payment.id,
        description: `${payment.serviceType} payment verified — ${creditsToGrant} credits`,
      },
      adminUserId,
    );

    // Store in payment metadata for audit
    payment.grantedQuantity = creditsToGrant;
    payment.serviceMetadata = {
      ...payment.serviceMetadata,
      creditsGranted: creditsToGrant,
      previousBalance: result.balanceAfter - creditsToGrant,
      newBalance: result.balanceAfter,
      transactionId: result.transactionId,
    };

    this.logger.log(
      `✅ Credits granted: institute=${payment.instituteId} credits=${creditsToGrant} type=${payment.serviceType} balance=${result.balanceAfter}`,
    );
  }

  /**
   * Mark the monthly billing summary as PAID when an invoice payment is verified.
   */
  private async markBillingSummaryPaid(
    manager: import('typeorm').EntityManager,
    payment: TenantServicePaymentEntity,
  ): Promise<void> {
    // billingMonth is YYYY-MM, construct a Date for the first of that month
    const billingDate = new Date(`${payment.billingMonth}-01`);
    const summary = await manager.findOne(MonthlyBillingSummaryEntity, {
      where: { instituteId: payment.instituteId, billingMonth: billingDate },
    });

    if (summary) {
      summary.status = 'PAID' as any; // BillingStatus.PAID
      summary.paidAt = now();
      summary.updatedAt = now();
      await manager.save(MonthlyBillingSummaryEntity, summary);
      this.logger.log(`✅ Billing summary marked PAID: institute=${payment.instituteId} month=${payment.billingMonth}`);
    }
  }
}
