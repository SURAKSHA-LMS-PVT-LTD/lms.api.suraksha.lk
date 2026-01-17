import { Entity, PrimaryGeneratedColumn, Column,  Index, AfterLoad } from 'typeorm';
import { InstituteType } from '../enums/institute.enums';
import { Province } from '../../user/enums/province.enum';
import { District } from '../../user/enums/district.enum';
import { Country } from '../../user/enums/country.enum';

@Entity('institutes')
// 🎯 REAL QUERY-BASED INDEXES - Based on actual codebase queries (Nov 2024)
// Active institutes: auth.service.ts line 542
@Index('idx_institutes_active', ['isActive'])
// Institute code lookup
@Index('idx_institutes_code', ['code'])
// Institute email lookup
@Index('idx_institutes_email', ['email'])
export class InstituteEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ name: 'short_name', type: 'varchar', length: 20, nullable: true })
  shortName?: string;

  @Column({ type: 'varchar', length: 20, unique: true })
  code: string;

  @Column({ 
    type: 'varchar', 
    length: 60, 
    unique: true,
    transformer: {
      to: (value: string) => value?.toLowerCase(),
      from: (value: string) => value
    }
  })
  email: string;

  @Column({ type: 'varchar', length: 15, nullable: true })
  phone?: string;

  @Column({ name: 'system_contact_email', type: 'varchar', length: 100, nullable: true })
  systemContactEmail?: string;

  @Column({ name: 'system_contact_phone_number', type: 'varchar', length: 20, nullable: true })
  systemContactPhoneNumber?: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  address?: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  city?: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  state?: string;

  @Column({ 
    type: 'enum', 
    enum: Country, 
    nullable: true,
    default: Country.SRI_LANKA 
  })
  country?: Country;

  @Column({ 
    type: 'enum', 
    enum: District, 
    nullable: true 
  })
  district?: District;

  @Column({ 
    type: 'enum', 
    enum: Province, 
    nullable: true 
  })
  province?: Province;

  @Column({ name: 'pin_code', type: 'varchar', length: 10, nullable: true })
  pinCode?: string;

  @Column({ 
    type: 'enum', 
    enum: InstituteType, 
    default: InstituteType.SCHOOL,
    comment: 'Type of the institute (school, college, etc.)'
  })
  type: InstituteType;

  // Branding and Visual Identity
  @Column({ name: 'logo_url', type: 'varchar', length: 255, nullable: true })
  logoUrl?: string;

  @Column({ name: 'loading_gif_url', type: 'varchar', length: 255, nullable: true })
  loadingGifUrl?: string;

  @Column({ name: 'primary_color_code', type: 'char', length: 7, nullable: true, comment: 'Hex color code for primary theme' })
  primaryColorCode?: string;

  @Column({ name: 'secondary_color_code', type: 'char', length: 7, nullable: true, comment: 'Hex color code for secondary theme' })
  secondaryColorCode?: string;

  @Column({ 
    type: 'json', 
    name: 'image_urls', 
    nullable: true, 
    comment: 'JSON array of image URLs'
  })
  imageUrls?: string[]; // Native JSON type

  @Column({ name: 'is_default', type: 'boolean', default: false, comment: 'Whether this is the default institute' })
  isDefault: boolean;

  // Institute Information
  @Column({ type: 'text', nullable: true })
  vision?: string;

  @Column({ type: 'text', nullable: true })
  mission?: string;

  // Online Presence
  @Column({ name: 'website_url', type: 'varchar', length: 255, nullable: true })
  websiteUrl?: string;

  @Column({ name: 'facebook_page_url', type: 'varchar', length: 255, nullable: true })
  facebookPageUrl?: string;

  @Column({ name: 'youtube_channel_url', type: 'varchar', length: 255, nullable: true })
  youtubeChannelUrl?: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;

  // Legacy field - keeping for backward compatibility
  @Column({ type: 'varchar', length: 255, nullable: true })
  imageUrl?: string;

}

