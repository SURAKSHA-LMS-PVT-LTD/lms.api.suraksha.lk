import { Entity, Column, PrimaryGeneratedColumn,  Index, AfterLoad, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { UserType } from '../../user/enums/user-type.enum';
import { Gender } from '../../user/enums/gender.enum';
import { SubscriptionPlan } from '../../user/enums/subscription-plan.enum';
import { Province } from '../../user/enums/province.enum';
import { District } from '../../user/enums/district.enum';
import { Occupation } from '../../user/enums/occupation.enum';

export enum MediaType {
  IMAGE = 'image',
  VIDEO = 'video', 
  AUDIO = 'audio',
  PDF = 'pdf'
}

export enum SupportivePlatform {
  SMS = 'sms',
  WHATSAPP = 'whatsapp',
  TELEGRAM = 'telegram',
  EMAIL = 'email',
  MOBILE_PUSH = 'mobile-push',
  WEB_PUSH = 'web-push'
}

// 🎯 SENDING MODE: Defines which channels are used to ACTUALLY DELIVER the advertisement
// This controls the delivery pipeline — only these channels will be used when sending
export enum SendingMode {
  SMS = 'sms',
  EMAIL = 'email',
  WHATSAPP = 'whatsapp',
  TELEGRAM = 'telegram',
  PUSH_WEB = 'push-web',
  PUSH_MOBILE = 'push-mobile'
}

@Entity('advertisements')
// PERF-F FIX: The active-ads query filters isActive + date window + currentSendings<maxSendings
// and orders by priority,createdAt. This composite index covers the WHERE/ORDER BY of that
// hot query (attendance notifications). The remaining demographic targeting (userTypes,
// subscriptionPlans, genders, age) is filtered in application code against the cached set,
// NOT in SQL — and MySQL cannot use a plain B-tree index on SET columns for FIND_IN_SET
// membership anyway, so those per-column indexes were pure write/storage overhead and are removed.
@Index('idx_ads_active_window', ['isActive', 'startDate', 'endDate', 'priority'])
@Index('idx_ads_created_by', ['createdBy'])
export class AdvertisementEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255, nullable: false })
  title: string;

  @Column({ name: 'access_key', type: 'varchar', length: 100, nullable: false })
  accessKey: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  mediaUrl?: string;

  @Column({ name: 'landingUrl', type: 'varchar', length: 1000, nullable: true })
  landingUrl?: string;

  @Column({ name: 'sendingUrl', type: 'varchar', length: 500, nullable: true })
  sendingUrl?: string;

  @Column({ 
    type: 'set',
    enum: SupportivePlatform,
    nullable: true
  })
  supportivePlatforms?: SupportivePlatform[];

  // 🎯 MODE OF SENDING: Which channels to actually use when delivering this advertisement
  // Example: ['sms', 'whatsapp', 'email'] means the ad will be sent via SMS, WhatsApp, and Email
  @Column({ 
    type: 'set',
    enum: SendingMode,
    nullable: true
  })
  modeOfSending?: SendingMode[];

  @Column({ 
    type: 'enum', 
    enum: MediaType,
    default: MediaType.IMAGE
  })
  mediaType: MediaType;

  // Geographic Targeting
  @Column({ type: 'json', nullable: true })
  targetInstituteIds?: string[];

  @Column({ type: 'json', nullable: true })
  targetCities?: string[];

  @Column({ 
    type: 'set',
    enum: Province,
    nullable: true
  })
  targetProvinces?: Province[];

  @Column({ 
    type: 'set',
    enum: District,
    nullable: true
  })
  targetDistricts?: District[];

  // Demographic Targeting
  @Column({ type: 'int', nullable: true })
  minBornYear?: number;

  @Column({ type: 'int', nullable: true })
  maxBornYear?: number;

  @Column({ 
    type: 'set',
    enum: Gender,
    nullable: true
  })
  targetGenders?: Gender[];

  @Column({ type: 'json', nullable: true })
  targetOccupations?: Occupation[];

  // User Type & Subscription Targeting
  @Column({
    type: 'set',
    enum: UserType,
    nullable: true
  })
  targetUserTypes?: UserType[];

  @Column({
    type: 'set', 
    enum: SubscriptionPlan,
    nullable: true
  })
  targetSubscriptionPlans?: SubscriptionPlan[];

  // Campaign Settings
  @Column({ type: 'int', default: 30 })
  displayDuration: number;

  @Column({ type: 'int', default: 1 })
  priority: number;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'datetime', nullable: false })
  startDate: Date;

  @Column({ type: 'datetime', nullable: false })
  endDate: Date;

  @Column({ type: 'int', default: 1000 })
  maxSendings: number;

  @Column({ type: 'int', default: 0 })
  currentSendings: number;

  // 🎯 CASCADE TO PARENTS FEATURE
  // When true, if ad matches student, automatically send SAME ad to their parents too
  // Example: "Grade 10 girls tuition" ad → matches female student → parents also get this ad
  @Column({ type: 'boolean', default: false })
  cascadeToParents: boolean;

  // Analytics
  @Column({ type: 'int', default: 0 })
  clickCount: number;

  @Column({ type: 'int', default: 0 })
  impressionCount: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  budget?: number;

  @Column({ type: 'decimal', precision: 6, scale: 4, nullable: true })
  costPerClick?: number;

  @Column({ type: 'decimal', precision: 6, scale: 4, nullable: true })
  costPerImpression?: number;

  // Administration
  @Column({ type: 'varchar', length: 36, nullable: true })
  createdBy?: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;

  // 🎯 Automatic URL transformation hook
  @AfterLoad()
  transformFileUrls() {
    const baseUrl = process.env.GCS_BASE_URL || process.env.STORAGE_BASE_URL || '';
    
    // Transform mediaUrl
    if (this.mediaUrl && this.mediaUrl.startsWith('/') && baseUrl) {
      this.mediaUrl = `${baseUrl}${this.mediaUrl}`;
    }
  }

  // Helper methods
  isExpired(): boolean {
    return new Date() > this.endDate;
  }

  isCurrentlyActive(): boolean {
    const now = new Date();
    return this.isActive && 
           now >= this.startDate && 
           now <= this.endDate &&
           this.currentSendings < this.maxSendings;
  }

  canSend(): boolean {
    return this.isCurrentlyActive() && this.currentSendings < this.maxSendings;
  }

  incrementSending(): void {
    this.currentSendings += 1;
  }

  /**
   * ✅ FIXED: No longer calls incrementSending().
   * currentSendings is tracked separately by AdvertisementCacheService.trackSending()
   * to prevent double-counting.
   */
  incrementImpression(): void {
    this.impressionCount += 1;
  }

  incrementClick(): void {
    this.clickCount += 1;
  }
  
}


