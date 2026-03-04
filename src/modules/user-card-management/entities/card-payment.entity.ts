import { Entity, PrimaryGeneratedColumn, Column,  ManyToOne, JoinColumn, Index } from 'typeorm';
import { UserEntity } from '../../user/entities/user.entity';
import { UserIdCardOrder } from './user-id-card-order.entity';
import { CardPaymentType } from '../enums/payment-type.enum';

export enum PaymentUploadMethod {
  CLOUD_STORAGE = 'CLOUD_STORAGE',
  GOOGLE_DRIVE = 'GOOGLE_DRIVE',
}

@Entity('card_payments')
@Index('idx_card_payment_order', ['orderId'])
export class CardPayment {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'order_id', type: 'bigint' })
  orderId: string;

  @Column({ name: 'submission_url', type: 'varchar', length: 500, nullable: true })
  submissionUrl?: string;

  @Column({
    name: 'upload_method',
    type: 'enum',
    enum: PaymentUploadMethod,
    nullable: true,
    default: PaymentUploadMethod.CLOUD_STORAGE,
  })
  uploadMethod?: PaymentUploadMethod;

  @Column({ name: 'drive_file_id', type: 'varchar', length: 200, nullable: true })
  driveFileId?: string;

  @Column({ name: 'drive_web_view_link', type: 'varchar', length: 500, nullable: true })
  driveWebViewLink?: string;

  @Column({ name: 'drive_file_name', type: 'varchar', length: 255, nullable: true })
  driveFileName?: string;

  @Column({ name: 'payment_type', type: 'enum', enum: CardPaymentType })
  paymentType: CardPaymentType;

  @Column({ name: 'payment_amount', type: 'decimal', precision: 10, scale: 2 })
  paymentAmount: number;

  @Column({ name: 'payment_reference', type: 'varchar', length: 100, nullable: true })
  paymentReference?: string;

  @Column({ name: 'payment_status', type: 'varchar', length: 20, default: 'PENDING' })
  paymentStatus: string;

  @Column({ name: 'verified_by', type: 'bigint', nullable: true })
  verifiedBy?: string;

  @Column({ name: 'verified_at', type: 'timestamp', nullable: true })
  verifiedAt?: Date;

  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason?: string;

  @Column({ name: 'notes', type: 'text', nullable: true })
  notes?: string;

  @Column({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;

  // Relations
  @ManyToOne(() => UserIdCardOrder, order => order.payments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order: UserIdCardOrder;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'verified_by' })
  verifier?: UserEntity;
}
