import { Entity, PrimaryGeneratedColumn, Column,  ManyToOne, JoinColumn, OneToMany, Index } from 'typeorm';
import { UserEntity } from '../../user/entities/user.entity';
import { Card } from './card.entity';
import { CardPayment } from './card-payment.entity';
import { CardType } from '../enums/card-type.enum';
import { CardStatus } from '../enums/card-status.enum';
import { OrderStatus } from '../enums/order-status.enum';

@Entity('user_id_card_orders')
@Index('idx_user_card_order_user', ['userId'])
@Index('idx_user_card_order_status', ['orderStatus', 'status'])
@Index('idx_user_card_order_date', ['orderDate'])
@Index('idx_user_card_rfid', ['rfidNumber'], { unique: true, where: 'rfid_number IS NOT NULL' })
export class UserIdCardOrder {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'user_id', type: 'bigint' })
  userId: string;

  @Column({ name: 'card_id', type: 'bigint' })
  cardId: string;

  @Column({ name: 'card_type', type: 'enum', enum: CardType })
  cardType: CardType;

  @Column({ name: 'payment_id', type: 'bigint', nullable: true })
  paymentId?: string;

  @Column({ name: 'card_expiry_date', type: 'timestamp' })
  cardExpiryDate: Date;

  @Column({ name: 'status', type: 'enum', enum: CardStatus, default: CardStatus.INACTIVE })
  status: CardStatus;

  @Column({ name: 'order_status', type: 'enum', enum: OrderStatus, default: OrderStatus.PENDING_PAYMENT })
  orderStatus: OrderStatus;

  @Column({ name: 'rejected_reason', type: 'text', nullable: true })
  rejectedReason?: string;

  @Column({ name: 'order_date', type: 'timestamp' })
  orderDate: Date;

  @Column({ name: 'delivery_address', type: 'text' })
  deliveryAddress: string;

  @Column({ name: 'contact_phone', type: 'varchar', length: 20 })
  contactPhone: string;

  @Column({ name: 'notes', type: 'text', nullable: true })
  notes?: string;

  @Column({ name: 'tracking_number', type: 'varchar', length: 100, nullable: true })
  trackingNumber?: string;

  @Column({ name: 'rfid_number', type: 'varchar', length: 50, nullable: true, unique: true })
  rfidNumber?: string;

  @Column({ name: 'delivered_at', type: 'timestamp', nullable: true })
  deliveredAt?: Date;

  @Column({ name: 'activated_at', type: 'timestamp', nullable: true })
  activatedAt?: Date;

  @Column({ name: 'deactivated_at', type: 'timestamp', nullable: true })
  deactivatedAt?: Date;

  @Column({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;

  // Relations
  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;

  @ManyToOne(() => Card)
  @JoinColumn({ name: 'card_id' })
  card: Card;

  @OneToMany(() => CardPayment, payment => payment.order)
  payments: CardPayment[];
}
