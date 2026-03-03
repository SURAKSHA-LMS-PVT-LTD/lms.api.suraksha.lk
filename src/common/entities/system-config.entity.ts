/**
 * ⚙️ SYSTEM CONFIG — Generic Key-Value Settings Store
 * 
 * A single table for ALL system-wide settings. Each row is a key-value pair
 * with an optional group for logical grouping. Designed to hold any future
 * system configuration — not just attendance sync.
 * 
 * Table: system_config
 * 
 * Examples:
 *   group=ATTENDANCE  key=SYNC_MODE          value=DYNAMO_FIRST
 *   group=ATTENDANCE  key=SYNC_CRON          value=0 * /15 * * * *
 *   group=ATTENDANCE  key=SYNC_BATCH_SIZE    value=500
 *   group=SYSTEM      key=MAINTENANCE_MODE   value=false
 *   group=NOTIFICATIONS key=MAX_RETRY        value=3
 */
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  Unique,
} from 'typeorm';

@Entity('system_config')
@Unique(['configGroup', 'configKey'])
@Index(['configGroup'])
export class SystemConfigEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({
    name: 'config_group',
    type: 'varchar',
    length: 64,
    comment: 'Logical group: ATTENDANCE, SYSTEM, NOTIFICATIONS, etc.',
  })
  configGroup: string;

  @Column({
    name: 'config_key',
    type: 'varchar',
    length: 128,
    comment: 'Setting key within the group (e.g. SYNC_MODE, SYNC_CRON)',
  })
  configKey: string;

  @Column({
    name: 'config_value',
    type: 'text',
    comment: 'Setting value (string, parsed by consumer)',
  })
  configValue: string;

  @Column({
    name: 'description',
    type: 'varchar',
    length: 512,
    nullable: true,
    comment: 'Human-readable description of what this setting does',
  })
  description: string | null;

  @Column({
    name: 'value_type',
    type: 'varchar',
    length: 32,
    default: 'STRING',
    comment: 'Hint for the value type: STRING, NUMBER, BOOLEAN, JSON, ENUM',
  })
  valueType: string;

  @Column({
    name: 'is_active',
    type: 'boolean',
    default: true,
    comment: 'Inactive settings are ignored (treated as if not set)',
  })
  isActive: boolean;

  @Column({
    name: 'updated_by',
    type: 'varchar',
    length: 64,
    nullable: true,
    comment: 'User ID who last changed this value',
  })
  updatedBy: string | null;

  @Column({
    name: 'created_at',
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
  })
  createdAt: Date;

  @Column({
    name: 'updated_at',
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
  })
  updatedAt: Date;
}
