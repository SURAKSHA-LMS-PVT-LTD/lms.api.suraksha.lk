import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { UserEntity } from './user.entity';

export enum DeviceType {
  ANDROID = 'android',
  IOS = 'ios',
  WEB = 'web',
  DESKTOP = 'desktop'
}

@Entity('user_fcm_tokens')
@Index(['userId', 'deviceId'], { unique: true }) // Composite unique index for user and device
export class UserFcmTokenEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'user_id', type: 'bigint' })
  userId: string;

  @Column({ name: 'fcm_token', type: 'varchar', length: 255 })
  fcmToken: string;

  @Column({ name: 'device_id', type: 'varchar', length: 255 })
  deviceId: string;

  @Column({ name: 'device_type', type: 'enum', enum: DeviceType, default: DeviceType.ANDROID })
  deviceType: DeviceType;

  @Column({ name: 'device_name', type: 'varchar', length: 255, nullable: true })
  deviceName?: string;

  @Column({ name: 'app_version', type: 'varchar', length: 50, nullable: true })
  appVersion?: string;

  @Column({ name: 'os_version', type: 'varchar', length: 50, nullable: true })
  osVersion?: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'is_synced', type: 'boolean', default: false })
  isSynced: boolean;

  @Column({ name: 'last_seen', type: 'timestamp', nullable: true })
  lastSeen?: Date;

  @Column({ name: 'last_notification_sent', type: 'timestamp', nullable: true })
  lastNotificationSent?: Date;

  @Column({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;

  // Relationship with User
  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;
}
