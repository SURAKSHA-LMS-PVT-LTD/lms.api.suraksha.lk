import { Entity, PrimaryGeneratedColumn, Column,  Index, AfterLoad } from 'typeorm';

@Entity('structured_lectures')
@Index('idx_lecture_subject_grade', ['subjectId', 'grade'])
@Index('idx_lecture_active', ['isActive'])
export class StructuredLectureEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

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
  difficulty: string;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'int', default: 0 })
  viewCount: number;

  @Column({ type: 'int', default: 0 })
  likeCount: number;

  @Column({ type: 'varchar', length: 36, nullable: true })
  createdBy?: string;

  @Column({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;

  // 🎯 Automatic URL transformation hook
  @AfterLoad()
  transformFileUrls() {
    const baseUrl = process.env.GCS_BASE_URL || process.env.STORAGE_BASE_URL || '';
    
    // Transform thumbnailUrl (uploaded images)
    if (this.thumbnailUrl && this.thumbnailUrl.startsWith('/') && baseUrl) {
      this.thumbnailUrl = `${baseUrl}${this.thumbnailUrl}`;
    }
    
    // ❌ DON'T transform videoUrl - keep external URLs (YouTube, Vimeo, etc.)
  }
}