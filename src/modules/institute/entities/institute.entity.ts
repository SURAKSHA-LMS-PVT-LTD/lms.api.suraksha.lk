import { Entity, PrimaryGeneratedColumn, Column,  Index, AfterLoad } from 'typeorm';
import { InstituteType, InstituteTier, LoginBackgroundType, CustomDomainSslStatus } from '../enums/institute.enums';
import { Province } from '../../user/enums/province.enum';
import { District } from '../../user/enums/district.enum';
import { Country } from '../../user/enums/country.enum';

@Entity('institutes')
// 🎯 REAL QUERY-BASED INDEXES - Based on actual codebase queries (Nov 2024)
// Active institutes: auth.service.ts line 542
@Index('idx_institutes_active', ['isActive'])
// Institute code lookup
@Index('idx_institutes_code', ['code'])
// Institute email lookup
@Index('idx_institutes_email', ['email'])
// Subdomain lookup (tenant resolution)
@Index('idx_institutes_subdomain', ['subdomain'], { unique: true })
// Custom domain lookup (tenant resolution)
@Index('idx_institutes_custom_domain', ['customDomain'], { unique: true })
export class InstituteEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ name: 'short_name', type: 'varchar', length: 20, nullable: true })
  shortName?: string;

  @Column({ type: 'varchar', length: 20, unique: true })
  code: string;

  @Column({ 
    type: 'varchar', 
    length: 60, 
    unique: true,
    transformer: {
      to: (value: string) => value?.toLowerCase(),
      from: (value: string) => value
    }
  })
  email: string;

  @Column({ type: 'varchar', length: 15, nullable: true })
  phone?: string;

  @Column({ name: 'system_contact_email', type: 'varchar', length: 100, nullable: true })
  systemContactEmail?: string;

  @Column({ name: 'system_contact_phone_number', type: 'varchar', length: 20, nullable: true })
  systemContactPhoneNumber?: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  address?: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  city?: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  state?: string;

  @Column({ 
    type: 'enum', 
    enum: Country, 
    nullable: true,
    default: Country.SRI_LANKA 
  })
  country?: Country;

  @Column({ 
    type: 'enum', 
    enum: District, 
    nullable: true 
  })
  district?: District;

  @Column({ 
    type: 'enum', 
    enum: Province, 
    nullable: true 
  })
  province?: Province;

  @Column({ name: 'pin_code', type: 'varchar', length: 10, nullable: true })
  pinCode?: string;

  @Column({ 
    type: 'enum', 
    enum: InstituteType, 
    default: InstituteType.SCHOOL,
    comment: 'Type of the institute (school, college, etc.)'
  })
  type: InstituteType;

  // Branding and Visual Identity
  @Column({ name: 'logo_url', type: 'varchar', length: 255, nullable: true })
  logoUrl?: string;

  @Column({ name: 'loading_gif_url', type: 'varchar', length: 255, nullable: true })
  loadingGifUrl?: string;

  @Column({ name: 'primary_color_code', type: 'char', length: 7, nullable: true, comment: 'Hex color code for primary theme' })
  primaryColorCode?: string;

  @Column({ name: 'secondary_color_code', type: 'char', length: 7, nullable: true, comment: 'Hex color code for secondary theme' })
  secondaryColorCode?: string;

  @Column({ 
    type: 'json', 
    name: 'image_urls', 
    nullable: true, 
    comment: 'JSON array of image URLs'
  })
  imageUrls?: string[]; // Native JSON type

  @Column({ name: 'is_default', type: 'boolean', default: false, comment: 'Whether this is the default institute' })
  isDefault: boolean;

  // Institute Information
  @Column({ type: 'text', nullable: true })
  vision?: string;

  @Column({ type: 'text', nullable: true })
  mission?: string;

  // Online Presence
  @Column({ name: 'website_url', type: 'varchar', length: 255, nullable: true })
  websiteUrl?: string;

  @Column({ name: 'facebook_page_url', type: 'varchar', length: 255, nullable: true })
  facebookPageUrl?: string;

  @Column({ name: 'youtube_channel_url', type: 'varchar', length: 255, nullable: true })
  youtubeChannelUrl?: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;

  // Legacy field - keeping for backward compatibility
  @Column({ type: 'varchar', length: 255, nullable: true })
  imageUrl?: string;

  // ═══════════════════════════════════════════════════════════════════
  // MULTI-TENANT / SUBDOMAIN / CUSTOM DOMAIN FIELDS
  // ═══════════════════════════════════════════════════════════════════

  // Tier & Subdomain
  @Column({ type: 'enum', enum: InstituteTier, default: InstituteTier.FREE, comment: 'Package tier: FREE, STARTER, PROFESSIONAL, ENTERPRISE, ISOLATED' })
  tier: InstituteTier;

  @Column({ type: 'varchar', length: 63, nullable: true, unique: true, comment: 'Subdomain slug e.g. "royalcollege" → royalcollege.suraksha.lk' })
  subdomain?: string;

  @Column({ name: 'custom_domain', type: 'varchar', length: 255, nullable: true, unique: true, comment: 'Custom domain e.g. "lms.royalcollege.lk"' })
  customDomain?: string;

  @Column({ name: 'custom_domain_verified', type: 'boolean', default: false })
  customDomainVerified: boolean;

  @Column({ name: 'custom_domain_ssl_status', type: 'enum', enum: CustomDomainSslStatus, nullable: true })
  customDomainSslStatus?: CustomDomainSslStatus;

  @Column({ name: 'custom_domain_verified_at', type: 'timestamp', nullable: true })
  customDomainVerifiedAt?: Date;

  // Session Limits
  @Column({ name: 'is_session_limit_enabled', type: 'boolean', default: false, comment: 'Whether institute session limits are active' })
  isSessionLimitEnabled: boolean;

  @Column({ name: 'default_sessions_per_user_count', type: 'int', default: 1, comment: 'Default device limit when new users enroll' })
  defaultSessionsPerUserCount: number;

  // Login Page Customization
  @Column({ name: 'custom_login_enabled', type: 'boolean', default: false, comment: 'Whether custom login page is active' })
  customLoginEnabled: boolean;

  @Column({ name: 'login_logo_url', type: 'varchar', length: 500, nullable: true })
  loginLogoUrl?: string;

  @Column({ name: 'login_background_type', type: 'enum', enum: LoginBackgroundType, default: LoginBackgroundType.COLOR })
  loginBackgroundType: LoginBackgroundType;

  @Column({ name: 'login_background_url', type: 'varchar', length: 500, nullable: true, comment: 'Background image or video URL' })
  loginBackgroundUrl?: string;

  @Column({ name: 'login_video_poster_url', type: 'varchar', length: 500, nullable: true, comment: 'Poster image for video background' })
  loginVideoPosterUrl?: string;

  @Column({ name: 'login_illustration_url', type: 'varchar', length: 500, nullable: true, comment: 'Replaces default login illustration' })
  loginIllustrationUrl?: string;

  @Column({ name: 'login_welcome_title', type: 'varchar', length: 200, nullable: true })
  loginWelcomeTitle?: string;

  @Column({ name: 'login_welcome_subtitle', type: 'varchar', length: 500, nullable: true })
  loginWelcomeSubtitle?: string;

  @Column({ name: 'login_footer_text', type: 'varchar', length: 200, nullable: true })
  loginFooterText?: string;

  @Column({ name: 'login_custom_css', type: 'json', nullable: true, comment: 'Custom CSS overrides: { fontFamily, borderRadius, ... }' })
  loginCustomCss?: Record<string, string>;

  @Column({ name: 'favicon_url', type: 'varchar', length: 500, nullable: true })
  faviconUrl?: string;

  @Column({ name: 'custom_app_name', type: 'varchar', length: 100, nullable: true, comment: 'Browser tab title override' })
  customAppName?: string;

  @Column({ name: 'powered_by_visible', type: 'boolean', default: true, comment: 'Show "Powered by Suraksha LMS"' })
  poweredByVisible: boolean = true;

  // Visibility Controls
  @Column({ name: 'is_visible_in_app', type: 'boolean', default: true, comment: 'Show in Suraksha mobile app institute selector' })
  isVisibleInApp: boolean;

  @Column({ name: 'is_visible_in_web_selector', type: 'boolean', default: true, comment: 'Show in lms.suraksha.lk institute selector' })
  isVisibleInWebSelector: boolean;

  // SMS / Email Masking
  @Column({ name: 'sms_sender_name', type: 'varchar', length: 11, nullable: true, comment: 'Custom SMS sender ID (max 11 chars)' })
  smsSenderName?: string;

  @Column({ name: 'email_sender_address', type: 'varchar', length: 255, nullable: true })
  emailSenderAddress?: string;

  @Column({ name: 'email_sender_name', type: 'varchar', length: 100, nullable: true })
  emailSenderName?: string;

  // Institute-defined custom column definitions for institute_user.extra_data.
  // Array of { key, label, type, applicableTo } objects — stored as JSON.
  @Column({
    name: 'user_extra_data_schema',
    type: 'json',
    nullable: true,
    comment: 'Array of custom column definitions for institute_user.extra_data: [{key,label,type,applicableTo}]',
  })
  userExtraDataSchema?: Array<{
    key: string;
    label: string;
    type: 'text' | 'number' | 'date' | 'email' | 'phone';
    applicableTo?: string[]; // e.g. ['Student','Teacher'] — empty = all roles
  }>;

  // ── PDF Report branding ──────────────────────────────────────────────────────
  // S3 relative paths.  institute.service.ts getSettings() resolves to full URLs.
  // Uploaded via PATCH /institutes/:id/settings with keys reportHeaderUrl / reportFooterUrl.
  // Frontend: InstituteSettingsPage.tsx → "Report Branding" section.

  @Column({ name: 'report_header_url', type: 'varchar', length: 500, nullable: true, comment: 'S3 path for PDF report header banner (~8:1 ratio)' })
  reportHeaderUrl?: string;

  @Column({ name: 'report_footer_url', type: 'varchar', length: 500, nullable: true, comment: 'S3 path for PDF report footer banner (~14:1 ratio)' })
  reportFooterUrl?: string;

}

