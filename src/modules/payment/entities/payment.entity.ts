import { Entity, PrimaryGeneratedColumn, Column,  ManyToOne, JoinColumn, Index, AfterLoad } from 'typeorm';
import { UserEntity } from '../../user/entities/user.entity';

export enum PaymentStatus {
  PENDING = 'PENDING',
  VERIFIED = 'VERIFIED',
  REJECTED = 'REJECTED',
  EXPIRED = 'EXPIRED'
}

export enum PaymentMethod {
  BANK_TRANSFER = 'BANK_TRANSFER',
  ONLINE_PAYMENT = 'ONLINE_PAYMENT',
  CASH_DEPOSIT = 'CASH_DEPOSIT'
}

@Entity('payments')
@Index('idx_payments_user_status', ['userId', 'status'])
@Index('idx_payments_status_month', ['status', 'paymentMonth'])
@Index('idx_payments_date', ['paymentDate'])
@Index('idx_payments_month', ['paymentMonth'])
@Index('idx_payments_method_status', ['paymentMethod', 'status'])
export class PaymentEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'user_id', type: 'bigint' })
  userId: string;

  @Column({ name: 'payment_amount', type: 'decimal', precision: 10, scale: 2 })
  paymentAmount: number;

  @Column({ name: 'payment_method', type: 'enum', enum: PaymentMethod })
  paymentMethod: PaymentMethod;

  @Column({ name: 'payment_reference', type: 'varchar', length: 50, nullable: true })
  paymentReference?: string;

  @Column({ name: 'payment_slip_url', type: 'varchar', length: 255, nullable: true })
  paymentSlipUrl?: string;

  @Column({ name: 'payment_slip_filename', type: 'varchar', length: 100, nullable: true })
  paymentSlipFilename?: string;

  @Column({ type: 'enum', enum: PaymentStatus, default: PaymentStatus.PENDING })
  status: PaymentStatus;

  @Column({ name: 'payment_date', type: 'timestamp' })
  paymentDate: Date;

  @Column({ name: 'payment_month', type: 'char', length: 7 }) // Format: YYYY-MM
  paymentMonth: string;

  @Column({ name: 'verified_by', type: 'bigint', nullable: true })
  verifiedBy?: string;

  @Column({ name: 'verified_at', type: 'timestamp', nullable: true })
  verifiedAt?: Date;

  @Column({ name: 'rejection_reason', type: 'varchar', length: 200, nullable: true })
  rejectionReason?: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  notes?: string;

  @Column({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'verified_by' })
  verifier?: UserEntity;
}
