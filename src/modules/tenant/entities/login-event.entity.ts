import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';
import { LoginMethod } from '../../institute/enums/institute.enums';

@Entity('login_events')
@Index('idx_login_billing', ['instituteId', 'loginMethod', 'loginTimestamp'])
@Index('idx_login_user_month', ['userId', 'instituteId', 'loginMethod', 'loginTimestamp'])
@Index('idx_login_timestamp', ['loginTimestamp'])
export class LoginEventEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'user_id', type: 'bigint' })
  userId: string;

  @Column({ name: 'institute_id', type: 'varchar', length: 36, nullable: true })
  instituteId?: string;

  @Column({ name: 'login_method', type: 'enum', enum: LoginMethod })
  loginMethod: LoginMethod;

  @Column({ name: 'login_timestamp', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  loginTimestamp: Date;

  @Column({ name: 'ip_address', type: 'varchar', length: 45, nullable: true })
  ipAddress?: string;

  @Column({ name: 'user_agent', type: 'varchar', length: 500, nullable: true })
  userAgent?: string;
}
