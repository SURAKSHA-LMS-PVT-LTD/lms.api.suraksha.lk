// NOTE: @Entity decorators removed from this file to avoid duplicate table registrations
// with structured-lecture.entity.ts which is the canonical entity used by the module.
// LectureDocumentEntity and LectureEntity here are only used by the unregistered
// StructuredLecturesServiceTypeorm and must NOT be registered as TypeORM entities.
import { PrimaryGeneratedColumn, Column, AfterLoad, ManyToOne, JoinColumn } from 'typeorm';
import { InstituteEntity } from '../../institute/entities/institute.entity';
import { InstituteClassEntity } from '../../institute_mudules/institue_class/entities/institue_class.entity';

export class LectureDocumentEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'lecture_id', type: 'varchar', length: 36 })
  lectureId: string;

  @Column({ name: 'document_name', type: 'varchar', length: 255 })
  documentName: string;

  @Column({ name: 'document_url', type: 'text' })
  documentUrl: string;

  @Column({ name: 'document_description', type: 'text', nullable: true })
  documentDescription?: string;

  @Column({ name: 'uploaded_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  uploadedAt: Date;

  @Column({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;

  // 🎯 Automatic URL transformation hook
  @AfterLoad()
  transformFileUrls() {
    const baseUrl = process.env.GCS_BASE_URL || process.env.STORAGE_BASE_URL || '';
    
    // Transform documentUrl
    if (this.documentUrl && this.documentUrl.startsWith('/') && baseUrl) {
      this.documentUrl = `${baseUrl}${this.documentUrl}`;
    }
  }
}

// @Entity removed — duplicate of StructuredLectureEntity for 'structured_lectures' table.
// Extra columns here (lessonNumber, provider, lectureLink, etc.) do not exist in the DB
// and caused TypeORM to generate SQL referencing unknown columns (ER_BAD_FIELD_ERROR).
export class LectureEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Institute relationship - lectures belong to an institute
  @Column({ name: 'institute_id', type: 'varchar', length: 36, nullable: true })
  instituteId: string;

  @ManyToOne(() => InstituteEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'institute_id' })
  institute: InstituteEntity;

  // Class relationship - lectures belong to a class within an institute
  @Column({ name: 'class_id', type: 'varchar', length: 36, nullable: true })
  classId: string;

  @ManyToOne(() => InstituteClassEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'class_id' })
  class: InstituteClassEntity;

  @Column({ type: 'varchar', length: 255, nullable: false })
  title: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'longtext', nullable: true })
  content?: string;

  @Column({ type: 'varchar', length: 36, nullable: false })
  subjectId: string;

  @Column({ type: 'int', nullable: false })
  grade: number;

  @Column({ type: 'int', nullable: true })
  duration?: number;

  @Column({ type: 'varchar', length: 500, nullable: true })
  videoUrl?: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  thumbnailUrl?: string;

  @Column({ type: 'json', nullable: true })
  attachments?: any[];

  @Column({ type: 'json', nullable: true })
  tags?: string[];

  @Column({ type: 'enum', enum: ['beginner', 'intermediate', 'advanced'], default: 'beginner' })
  difficulty?: string;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'int', default: 0 })
  viewCount?: number;

  @Column({ type: 'int', default: 0 })
  likeCount?: number;

  @Column({ type: 'varchar', length: 36, nullable: true })
  createdBy?: string;

  @Column({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;

  // Additional fields for structured lectures
  @Column({ type: 'int', nullable: true, default: 1 })
  lessonNumber?: number;

  @Column({ type: 'int', nullable: true, default: 1 })
  lectureNumber?: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  provider?: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  lectureLink?: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  coverImageUrl?: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  updatedBy?: string;

  // Virtual field for documents (loaded separately for performance)
  documents?: LectureDocumentEntity[];

  // 🎯 Automatic URL transformation hook
  @AfterLoad()
  transformFileUrls() {
    const baseUrl = process.env.GCS_BASE_URL || process.env.STORAGE_BASE_URL || '';
    
    // Transform thumbnailUrl (uploaded images)
    if (this.thumbnailUrl && this.thumbnailUrl.startsWith('/') && baseUrl) {
      this.thumbnailUrl = `${baseUrl}${this.thumbnailUrl}`;
    }
    
    // Transform coverImageUrl (uploaded images)
    if (this.coverImageUrl && this.coverImageUrl.startsWith('/') && baseUrl) {
      this.coverImageUrl = `${baseUrl}${this.coverImageUrl}`;
    }
    
    // ❌ DON'T transform videoUrl - keep external URLs (YouTube, Vimeo, etc.)
  }
}