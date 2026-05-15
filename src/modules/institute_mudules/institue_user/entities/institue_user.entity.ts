//this is file for manage relation betwween user and isntitute
//this is specilaly need [get all institeues by user id,get all users by institute id,get all users by institue id filtering user type,assign user to institute,assign institute to user]
//manage here status of user and institute like active,former,etc 
import { Entity, PrimaryColumn, Column, ManyToOne, JoinColumn, Index, AfterLoad } from 'typeorm';
import { UserEntity } from '../../../user/entities/user.entity';
import { InstituteEntity } from '../../../institute/entities/institute.entity';
import { InstituteUserStatus } from '../enums/institute-user-status.enum';
import { ImageVerificationStatus } from '../enums/image-verification-status.enum';
import { InstituteUserType } from '../enums/institute-user-type.enum';

@Entity('institute_user')
// 🎯 REAL QUERY-BASED INDEXES - Based on actual codebase queries (Nov 2024)
// User's institutes: auth.service.ts line 176, enhanced-jwt.service.ts line 153
@Index('idx_institute_user_userid_status', ['userId', 'status'])
// Institute's users: user.service.ts line 1418, 1419, 1420
@Index('idx_institute_user_institute_status', ['instituteId', 'status'])
// Student filtering: sms.service.ts line 1735, 1736, 1737
@Index('idx_institute_user_type_status', ['instituteId', 'instituteUserType', 'status'])
// Verification queries: user.service.ts verification workflows
@Index('idx_institute_user_verified', ['instituteId', 'status', 'verifiedAt'])
export class InstituteUserEntity {
  @PrimaryColumn({ name: 'institute_id', type: 'varchar', length: 36 })
  instituteId: string;

  @PrimaryColumn({ name: 'user_id', type: 'bigint' })
  userId: string;

  //for like index number etc at instite not must and requered
  //using this column we need filter all users using this too .
  //this like entrance id .for instutes gives mannually.now need access to past data using this.also
  @Column({ name: 'user_id_institue', type: 'varchar', length: 50, nullable: true })
  userIdByInstitute?: string;

  @Column({
    name: 'status',
    type: 'enum',
    enum: InstituteUserStatus,
    default: InstituteUserStatus.PENDING  // Changed from ACTIVE to PENDING - requires verification
  })
  status: InstituteUserStatus;

  @Column({
    name: 'institute_user_type',
    type: 'enum',
    enum: InstituteUserType,
    default: InstituteUserType.STUDENT
  })
  instituteUserType: InstituteUserType;

  // Verification tracking fields
  @Column({ name: 'verified_by', type: 'bigint', nullable: true })
  verifiedBy?: string;

  @Column({ name: 'verified_at', type: 'timestamp', nullable: true })
  verifiedAt?: Date;

  // Institute user image and verification fields
  @Column({ name: 'institute_user_image_url', type: 'varchar', length: 255, nullable: true })
  instituteUserImageUrl?: string;

  @Column({ name: 'institute_card_id', type: 'varchar', length: 100, nullable: true })
  instituteCardId?: string;

  @Column({
    name: 'image_verification_status',
    type: 'enum',
    enum: ImageVerificationStatus,
    default: ImageVerificationStatus.PENDING
  })
  imageVerificationStatus: ImageVerificationStatus;

  @Column({ name: 'image_verified_by', type: 'bigint', nullable: true })
  imageVerifiedBy?: string;

  // Institute-level password (independent of main user table)
  @Column({ name: 'institute_password', type: 'varchar', length: 120, nullable: true, select: false })
  institutePassword?: string;

  @Column({ name: 'institute_password_set_at', type: 'timestamp', nullable: true })
  institutePasswordSetAt?: Date;

  // House this user belongs to within the institute
  @Column({ name: 'house_id', type: 'bigint', nullable: true })
  houseId?: string;

  // Institute-defined custom key-value metadata (e.g. phone, email, notes).
  // Stored as plain JSON — fully visible to admins, no encryption.
  @Column({ name: 'extra_data', type: 'json', nullable: true, comment: 'Institute-defined custom key-value data. Visible to admins, not encrypted.' })
  extraData?: Record<string, any>;

  /** Max simultaneous active institute login sessions per user. NULL = unlimited. */
  @Column({ name: 'max_devices_per_user', type: 'tinyint', unsigned: true, nullable: true, default: null })
  maxDevicesPerUser?: number | null;

  /** FK to institute_user_types — the dynamic RBAC role for this membership. */
  @Column({ name: 'primary_user_type_id', type: 'bigint', unsigned: true, nullable: true, default: null })
  primaryUserTypeId?: string | null;

  @Column({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;

  @ManyToOne(() => InstituteEntity, { onDelete: 'CASCADE' })
  @JoinColumn([{ name: 'institute_id' }])
  institute: InstituteEntity;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn([{ name: 'user_id' }])
  user: UserEntity;

  // Optional: Reference to the user who verified this enrollment
  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn([{ name: 'verified_by' }])
  verifier?: UserEntity;

  // Optional: Reference to the user who verified the image
  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn([{ name: 'image_verified_by' }])
  imageVerifier?: UserEntity;
}

