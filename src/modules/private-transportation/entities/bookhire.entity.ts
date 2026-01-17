import { Entity, PrimaryGeneratedColumn, Column,  Index, ManyToOne, JoinColumn, AfterLoad } from 'typeorm';
import { BookhireOwnerEntity } from './bookhire-owner.entity';

@Entity('bookhires')
@Index(['ownerId'])
@Index(['vehicleNumber'])
@Index(['isActive', 'status'])
@Index(['vehicleType'])
@Index(['capacity'])
@Index(['ownerId', 'isActive'])
@Index(['createdAt'])
export class BookhireEntity {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'varchar', length: 36, nullable: false })
  ownerId: string;

  @Column({ type: 'varchar', length: 50, nullable: false })
  vehicleNumber: string;

  @Column({ type: 'enum', enum: ['bus', 'van', 'car', 'auto'], nullable: false })
  vehicleType: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  vehicleModel?: string;

  @Column({ type: 'int', nullable: false })
  capacity: number;

  @Column({ type: 'text', nullable: true })
  route?: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: false })
  pricePerMonth: number;

  @Column({ type: 'int', nullable: false })
  availableSeats: number;

  @Column({ type: 'json', nullable: true })
  vehicleImages?: string[];

  @Column({ type: 'json', nullable: true })
  amenities?: string[];

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'enum', enum: ['pending', 'approved', 'rejected', 'suspended'], default: 'pending' })
  status: string;

  @Column({ type: 'timestamp', nullable: true })
  approvedAt?: Date;

  @Column({ type: 'varchar', length: 36, nullable: true })
  approvedBy?: string;

  @Column({ type: 'timestamp', nullable: true })
  rejectedAt?: Date;

  @Column({ type: 'text', nullable: true })
  rejectionReason?: string;

  @Column({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;

  // Relation to BookhireOwner
  @ManyToOne(() => BookhireOwnerEntity)
  @JoinColumn({ name: 'ownerId' })
  owner: BookhireOwnerEntity;

  // 🎯 Automatic URL transformation hook
  @AfterLoad()
  transformFileUrls() {
    const baseUrl = process.env.GCS_BASE_URL || process.env.STORAGE_BASE_URL || '';
    
    // Transform vehicleImages array
    if (this.vehicleImages && Array.isArray(this.vehicleImages) && baseUrl) {
      this.vehicleImages = this.vehicleImages.map(url => {
        if (url && url.startsWith('/')) {
          return `${baseUrl}${url}`;
        }
        return url;
      });
    }
  }
}