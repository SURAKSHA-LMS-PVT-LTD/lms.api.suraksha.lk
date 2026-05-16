import { Entity, PrimaryColumn, Column, Index, AfterLoad, BeforeInsert } from 'typeorm';
import { Exclude } from 'class-transformer';
import { UserType } from '../enums/user-type.enum';
import { Gender } from '../enums/gender.enum';
import { SubscriptionPlan } from '../enums/subscription-plan.enum';
import { Province } from '../enums/province.enum';
import { District } from '../enums/district.enum';
import { Country } from '../enums/country.enum';
import { Language } from '../enums/language.enum';
import { Occupation } from '../enums/occupation.enum';
import { ProfileCompletionStatus } from '../enums/profile-completion-status.enum';
import { ImageVerificationStatus } from '../../institute_mudules/institue_user/enums/image-verification-status.enum';
import { CardStatus } from '../../user-card-management/enums/card-status.enum';

@Entity('users')
// 🎯 REAL QUERY-BASED INDEXES - Based on actual codebase queries (Nov 2024)
// Email login: auth.service.ts line 112, 643, 701
@Index('idx_users_email_login', ['email'], { unique: true })
// Phone lookup: user.service.ts line 654, SMS filtering
@Index('idx_users_phone_number', ['phoneNumber'])
// User type + active: user.service.ts line 634, 959, 1096
@Index('idx_users_type_active', ['userType', 'isActive'])
// Gender filtering: user.service.ts line 638, 1124, 1262
@Index('idx_users_gender_type', ['gender', 'userType'])
// Geographic filtering: user.service.ts line 646, 650, 1163, 1167
@Index('idx_users_province', ['province'])
@Index('idx_users_district', ['district'])
// City search: user.service.ts line 642, 1171
@Index('idx_users_city', ['city'])
// NIC search: user.service.ts line 658, 1254
@Index('idx_users_nic', ['nic'])
// Active status: user.service.ts line 670, 1099
@Index('idx_users_is_active', ['isActive'])
export class UserEntity {
  @PrimaryColumn({ type: 'bigint' })
  id: string;

  // Assigns a random 9-digit numeric ID before insert so IDs are non-sequential
  // while staying human-readable on receipts and SMS (e.g. 251041432).
  // The DB column no longer uses AUTO_INCREMENT after migration 1790000000003.
  @BeforeInsert()
  assignRandomId() {
    if (!this.id) {
      // 100_000_000 – 999_999_999  (9 digits, never starts with 0)
      const min = 100_000_000n;
      const range = 900_000_000n;
      const rand = BigInt(Math.floor(Math.random() * Number(range)));
      this.id = String(min + rand);
    }
  }

  @Column({ name: 'first_name', type: 'varchar', length: 50, nullable: true })
  firstName: string;

  @Column({ name: 'last_name', type: 'varchar', length: 50, nullable: true })
  lastName: string;

  @Column({ name: 'name_with_initials', type: 'varchar', length: 100, nullable: true })
  nameWithInitials: string;

  @Column({ type: 'varchar', length: 60, nullable: true, unique: true, transformer: {
    to: (value: string) => value ? value.toLowerCase() : null,
    from: (value: string) => value ? value.toLowerCase() : null
  }})
  email?: string;

  @Column({ type: 'varchar', length: 120, nullable: true, select: false })
  @Exclude()
  password?: string; // Bcrypt hash - exactly 60 characters (2x safety margin: 120 chars)

  @Column({ name: 'phone_number', type: 'varchar', length: 15, nullable: true })
  phoneNumber?: string;

  @Column({ name: 'user_type', type: 'enum', enum: UserType, nullable: false })
  userType: UserType;

  @Column({ name: 'date_of_birth', type: 'date', nullable: true })
  dateOfBirth?: Date;

  @Column({ type: 'enum', enum: Gender, nullable: true })
  gender?: Gender;

  @Column({ name: 'nic', type: 'varchar', length: 12, unique: true, nullable: true })
  nic?: string;

  @Column({ name: 'birth_certificate_no', type: 'varchar', length: 50, unique: true, nullable: true })
  birthCertificateNo?: string;

  @Column({ name: 'address_line1', type: 'varchar', length: 200, nullable: true })
  addressLine1?: string;

  @Column({ name: 'address_line2', type: 'varchar', length: 200, nullable: true })
  addressLine2?: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  city?: string;

  @Column({ type: 'enum', enum: District})
  district?: District;

  @Column({ type: 'enum', enum: Province })
  province?: Province;

  @Column({ name: 'postal_code', type: 'varchar', length: 6, nullable: true })
  postalCode?: string;

  @Column({ type: 'enum', enum: Country, default: Country.SRI_LANKA })
  country: Country;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;

  @Column({ name: 'image_url', type: 'varchar', length: 255, nullable: true })
  imageUrl?: string;

  @Column({ 
    name: 'image_verification_status', 
    type: 'enum', 
    enum: ImageVerificationStatus,
    nullable: true,
    comment: 'Profile image verification status: PENDING/VERIFIED/REJECTED'
  })
  imageVerificationStatus?: ImageVerificationStatus;

  @Column({ 
    name: 'image_verified_by', 
    type: 'bigint', 
    nullable: true,
    comment: 'Admin user ID who verified/rejected the image'
  })
  imageVerifiedBy?: string;

  @Column({ 
    name: 'image_verified_at', 
    type: 'timestamp', 
    nullable: true,
    comment: 'Timestamp when image was verified/rejected'
  })
  imageVerifiedAt?: Date;

  @Column({ 
    name: 'image_rejection_reason', 
    type: 'text', 
    nullable: true,
    comment: 'Reason provided when image was rejected'
  })
  imageRejectionReason?: string;

  @Column({ name: 'id_url', type: 'varchar', length: 255, nullable: true })
  idUrl?: string;

  @Column({ name: 'subscription_plan', type: 'enum', enum: SubscriptionPlan, default: SubscriptionPlan.FREE })
  subscriptionPlan: SubscriptionPlan;

  @Column({ name: 'payment_expires_at', type: 'timestamp', nullable: true })
  paymentExpiresAt?: Date;

  @Column({ name: 'telegram_id', type: 'varchar', length: 20, nullable: true })
  telegramId?: string;

  // ============================================
  // RFID / NFC CARD FIELDS
  // ============================================

  @Column({ name: 'rfid', type: 'varchar', length: 20, unique: true, nullable: true })
  rfid?: string;

  @Column({ 
    name: 'rfid_expiry_date', 
    type: 'timestamp', 
    nullable: true,
    comment: 'RFID/NFC card expiration date'
  })
  rfidExpiryDate?: Date;

  @Column({ 
    name: 'rfid_card_status', 
    type: 'enum', 
    enum: CardStatus,
    nullable: true,
    comment: 'RFID/NFC card status: ACTIVE/INACTIVE/DEACTIVATED/EXPIRED/LOST/DAMAGED/REPLACED'
  })
  rfidCardStatus?: CardStatus;

  // ============================================
  // NORMAL (QR/BARCODE) CARD FIELDS
  // ============================================

  @Column({ 
    name: 'card_id', 
    type: 'varchar', 
    length: 50, 
    unique: true, 
    nullable: true,
    comment: 'Normal (QR/Barcode) card identifier - used for attendance scanning'
  })
  cardId?: string;

  @Column({ 
    name: 'card_expiry_date', 
    type: 'timestamp', 
    nullable: true,
    comment: 'Normal card expiration date'
  })
  cardExpiryDate?: Date;

  @Column({ 
    name: 'card_status', 
    type: 'enum', 
    enum: CardStatus,
    nullable: true,
    comment: 'Normal card status: ACTIVE/INACTIVE/DEACTIVATED/EXPIRED/LOST/DAMAGED/REPLACED'
  })
  cardStatus?: CardStatus;

  @Column({ 
    type: 'enum', 
    enum: Language, 
    default: Language.ENGLISH,
    comment: 'User preferred language: S=Sinhala, E=English, T=Tamil'
  })
  language: Language;

  // ============================================
  // VERIFICATION & PROFILE COMPLETION FIELDS
  // ============================================

  @Column({ 
    name: 'is_phone_verified', 
    type: 'boolean', 
    default: false,
    comment: 'Whether phone number has been verified via OTP'
  })
  isPhoneVerified: boolean;

  @Column({ 
    name: 'is_email_verified', 
    type: 'boolean', 
    default: false,
    comment: 'Whether email has been verified via link/code'
  })
  isEmailVerified: boolean;

  @Column({ 
    name: 'profile_completion_status', 
    type: 'enum', 
    enum: ProfileCompletionStatus, 
    default: ProfileCompletionStatus.INCOMPLETE,
    comment: 'Profile completion level: INCOMPLETE, BASIC, COMPLETE'
  })
  profileCompletionStatus: ProfileCompletionStatus;

  @Column({ 
    name: 'profile_completion_percentage', 
    type: 'tinyint', 
    default: 0,
    comment: 'Profile completion percentage (0-100)'
  })
  profileCompletionPercentage: number;

  @Column({ 
    name: 'user_settings', 
    type: 'json', 
    nullable: true,
    comment: 'JSON object storing user preferences and settings'
  })
  userSettings?: {
    notifications?: {
      email?: boolean;
      sms?: boolean;
      push?: boolean;
    };
    privacy?: {
      showEmail?: boolean;
      showPhone?: boolean;
      showProfile?: boolean;
    };
    theme?: 'light' | 'dark' | 'system';
    timezone?: string;
    [key: string]: any;
  };

  @Column({ 
    name: 'first_login_completed', 
    type: 'boolean', 
    default: false,
    comment: 'Whether user has completed first login setup'
  })
  firstLoginCompleted: boolean;

  @Column({ 
    name: 'password_set_at', 
    type: 'timestamp', 
    nullable: true,
    comment: 'When password was set (null = no password set yet)'
  })
  passwordSetAt?: Date;

  @Column({ 
    name: 'last_login_at', 
    type: 'timestamp', 
    nullable: true,
    comment: 'Last successful login timestamp'
  })
  lastLoginAt?: Date;

  @Column({ 
    name: 'created_by_admin_id', 
    type: 'bigint', 
    nullable: true,
    comment: 'Admin user ID who created this user (for admin-created users)'
  })
  createdByAdminId?: string;

}

