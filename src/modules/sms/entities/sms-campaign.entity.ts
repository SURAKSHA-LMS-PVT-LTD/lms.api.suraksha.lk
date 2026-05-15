import { Entity, PrimaryGeneratedColumn, Column,  Index } from 'typeorm';
import { SmsProviderResponse } from '../interfaces/sms-provider.interface';

export enum SmsCampaignStatus {
  PENDING = 'PENDING',
  SENDING = 'SENDING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  PARTIALLY_FAILED = 'PARTIALLY_FAILED',
}

export enum SmsCampaignType {
  SINGLE = 'SINGLE',
  BULK = 'BULK',
}

/**
 * SMS Campaign Entity
 * 
 * Tracks all SMS campaigns sent through the system
 * Status lifecycle: PENDING → SENDING → SUCCESS/FAILED
 */
@Entity('sms_campaigns')
@Index('idx_sms_campaigns_institute', ['instituteId'])
@Index('idx_sms_campaigns_status', ['status'])
@Index('idx_sms_campaigns_created', ['createdAt'])
export class SmsCampaignEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'institute_id', type: 'varchar', length: 36 })
  @Index('idx_institute_id')
  instituteId: string;

  @Column({ name: 'sender_id', type: 'varchar', length: 20 })
  senderId: string;

  @Column({ name: 'message', type: 'text' })
  message: string;

  @Column({ name: 'type', type: 'enum', enum: SmsCampaignType, default: SmsCampaignType.SINGLE })
  type: SmsCampaignType;

  @Column({ name: 'status', type: 'enum', enum: SmsCampaignStatus, default: SmsCampaignStatus.PENDING })
  status: SmsCampaignStatus;

  @Column({ name: 'total_recipients', type: 'int', default: 0 })
  totalRecipients: number;

  @Column({ name: 'successful_sends', type: 'int', default: 0 })
  successfulSends: number;

  @Column({ name: 'failed_sends', type: 'int', default: 0 })
  failedSends: number;

  @Column({ name: 'credits_deducted', type: 'decimal', precision: 10, scale: 2, default: 0 })
  creditsDeducted: number;

  @Column({ name: 'provider_campaign_id', type: 'varchar', length: 50, nullable: true })
  providerCampaignId: string;

  @Column({ name: 'provider_name', type: 'varchar', length: 50, default: 'SMSlenz' })
  providerName: string;

  @Column({ name: 'provider_response', type: 'json', nullable: true })
  providerResponse: SmsProviderResponse | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string;

  @Column({ name: 'initiated_by', type: 'bigint' })
  initiatedBy: string; // User ID who initiated the campaign

  @Column({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;

  @Column({ name: 'sent_at', type: 'timestamp', nullable: true })
  sentAt: Date;
}
