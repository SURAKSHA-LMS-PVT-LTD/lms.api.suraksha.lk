import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';
import { CardType } from '../enums/card-type.enum';

@Entity('cards')
@Index('idx_cards_type_active', ['cardType', 'isActive'])
export class Card {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'card_name', type: 'varchar', length: 100 })
  cardName: string;

  @Column({ name: 'card_type', type: 'enum', enum: CardType })
  cardType: CardType;

  @Column({ name: 'card_image_url', type: 'varchar', length: 500, nullable: true })
  cardImageUrl?: string;

  @Column({ name: 'card_video_url', type: 'varchar', length: 500, nullable: true })
  cardVideoUrl?: string;

  @Column({ name: 'description', type: 'text', nullable: true })
  description?: string;

  @Column({ name: 'price', type: 'decimal', precision: 10, scale: 2 })
  price: number;

  @Column({ name: 'quantity_available', type: 'int', default: 0 })
  quantityAvailable: number;

  @Column({ name: 'validity_days', type: 'int', default: 365 })
  validityDays: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
