import { Entity, PrimaryGeneratedColumn, Column,  Index, OneToMany } from 'typeorm';
import { Exclude } from 'class-transformer';
import { BookhireEntity } from './bookhire.entity';

@Entity('bookhire_owners')
@Index(['phone'])
@Index(['isVerified', 'isActive'])
@Index(['createdAt'])
export class BookhireOwnerEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255, nullable: false })
  name: string;

  @Column({ type: 'varchar', length: 255, nullable: false, unique: true })
  email: string;

  @Exclude()
  @Column({ type: 'varchar', length: 255, nullable: false, select: false })
  password: string;

  @Column({ type: 'varchar', length: 20, nullable: false })
  phone: string;

  @Column({ type: 'text', nullable: true })
  address?: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  profileImage?: string;

  @Column({ type: 'boolean', default: false })
  isVerified: boolean;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Exclude()
  @Column({ type: 'varchar', length: 255, nullable: true })
  verificationToken?: string;

  @Exclude()
  @Column({ type: 'varchar', length: 255, nullable: true })
  resetPasswordToken?: string;

  @Column({ type: 'timestamp', nullable: true })
  resetPasswordExpires?: Date;

  @Column({ name: 'createdAt', type: 'timestamp' })
  createdAt: Date;

  @Column({ name: 'updatedAt', type: 'timestamp' })
  updatedAt: Date;

  // Relations
  @OneToMany(() => BookhireEntity, bookhire => bookhire.owner)
  bookhires: BookhireEntity[];
}