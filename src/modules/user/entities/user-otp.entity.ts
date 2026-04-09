import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

export enum OtpType {
  EMAIL = 'EMAIL',
  PHONE = 'PHONE',
}

export enum OtpPurpose {
  VERIFICATION = 'VERIFICATION',
  PASSWORD_RESET = 'PASSWORD_RESET',
  TWO_FACTOR = 'TWO_FACTOR',
  PHONE_CHANGE = 'PHONE_CHANGE',
  EMAIL_CHANGE = 'EMAIL_CHANGE',
  INSTITUTE_PASSWORD_RESET = 'INSTITUTE_PASSWORD_RESET',
  INSTITUTE_ACTIVATION = 'INSTITUTE_ACTIVATION',
}

@Entity('user_otps')
@Index('idx_user_otps_user_type', ['userId', 'otpType'])
@Index('idx_user_otps_date', ['createdDate'])
export class UserOtpEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'user_id', type: 'bigint', nullable: true })
  @Index()
  userId?: string;

  @Column({ type: 'varchar', length: 60, nullable: true })
  @Index()
  email?: string;

  @Column({ name: 'phone_number', type: 'varchar', length: 15, nullable: true })
  @Index()
  phoneNumber?: string;

  @Column({ name: 'otp_code', type: 'varchar', length: 6 })
  otpCode: string;

  @Column({ name: 'otp_type', type: 'enum', enum: OtpType })
  otpType: OtpType;

  @Column({ name: 'otp_purpose', type: 'enum', enum: OtpPurpose, default: OtpPurpose.VERIFICATION })
  otpPurpose: OtpPurpose;

  @Column({ name: 'expires_at', type: 'timestamp' })
  expiresAt: Date;

  @Column({ name: 'is_verified', type: 'boolean', default: false })
  isVerified: boolean;

  @Column({ name: 'verified_at', type: 'timestamp', nullable: true })
  verifiedAt?: Date;

  @Column({ name: 'attempts', type: 'int', default: 0 })
  attempts: number;

  @Column({ name: 'ip_address', type: 'varchar', length: 45, nullable: true })
  ipAddress?: string;

  @Column({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @Column({ name: 'created_date', type: 'date' })
  @Index()
  createdDate: string; // Format: YYYY-MM-DD for daily limit tracking
}
