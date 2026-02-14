import { Entity, PrimaryGeneratedColumn, Column,  ManyToOne, JoinColumn, ValueTransformer, AfterLoad, Index } from 'typeorm';
// Date transformer for ISO serialization
const dateTransformer: ValueTransformer = {
  to: (value: Date | string | null) => value,
  from: (value: Date | string | null) => value instanceof Date ? value : value ? new Date(value) : null,
};
import { InstituteClassSubjectHomework } from '../../institute_class_subject_homeworks/entities/institute_class_subject_homework.entity';
import { UserEntity } from '../../../user/entities/user.entity';

/**
 * Entity representing submissions for homework assignments.
 * Maps to the 'institute_class_subject_homeworks_submissions' table in the database.
🧭 How the Robot User Works in Your System
- i will update that link after you created process.still use dull email.
- Share that folder with the service account’s email (e.g., robot@your-project.iam.gserviceaccount.com)
- Give it Editor access so it can upload files
- Use the Robot in Your Backend
- Your NestJS backend uses the JSON key to authenticate as the robot
- It uploads files into the shared folder
- set file permissions for student submission (e.g., give read access to a student’s ,teacher's email)
- set file permistion for teacher submitoin (student ,teacher ,parents emails)
- Save File Info in Your Database
- After upload, your backend stores the file link, student ID, and other metadata in your DB
-hadele errors well because it is a robot
*/

//to upload must start start_date< and end_date >
//can upload only one file at a time,pdf only .
//secure from vannerbilitiees like file upload etc



@Entity('institute_class_subject_homeworks_submissions')
@Index('idx_submission_homework', ['homeworkId'])
@Index('idx_submission_student', ['studentId'])
@Index('idx_submission_homework_student', ['homeworkId', 'studentId'])
export class InstituteClassSubjectHomeworksSubmission {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'homework_id', type: 'bigint' })
  homeworkId: string;

  @ManyToOne(() => InstituteClassSubjectHomework, { onDelete: 'CASCADE' })
  @JoinColumn([{ name: 'homework_id'  }])
  homework: InstituteClassSubjectHomework;

  @Column({ name: 'student_id', type: 'bigint' })
  studentId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn([{ name: 'student_id'  }])
  student: UserEntity;

  @Column({ name: 'submission_date', type: 'timestamp', nullable: true, transformer: dateTransformer })
  submissionDate?: Date;

  @Column({ name: 'file_url', type: 'varchar', length: 255, nullable: true })
  fileUrl?: string;

  @Column({ name: 'teacher_correction_file_url', type: 'varchar', length: 255, nullable: true })
  teacherCorrectionFileUrl?: string;

  // Google Drive Integration Fields for Teacher Corrections
  @Column({ name: 'correction_drive_file_id', type: 'varchar', length: 255, nullable: true })
  correctionDriveFileId?: string;

  @Column({ name: 'correction_drive_file_name', type: 'varchar', length: 500, nullable: true })
  correctionDriveFileName?: string;

  @Column({ name: 'correction_drive_mime_type', type: 'varchar', length: 100, nullable: true })
  correctionDriveMimeType?: string;

  @Column({ name: 'correction_drive_file_size', type: 'bigint', nullable: true })
  correctionDriveFileSize?: number;

  @Column({ name: 'correction_type', type: 'enum', enum: ['UPLOAD', 'GOOGLE_DRIVE'], nullable: true })
  correctionType?: 'UPLOAD' | 'GOOGLE_DRIVE';

  // Google Drive Integration Fields for Student Submissions
  @Column({ name: 'drive_file_id', type: 'varchar', length: 255, nullable: true })
  driveFileId?: string;

  @Column({ name: 'drive_file_name', type: 'varchar', length: 500, nullable: true })
  driveFileName?: string;

  @Column({ name: 'drive_mime_type', type: 'varchar', length: 100, nullable: true })
  driveMimeType?: string;

  @Column({ name: 'drive_file_size', type: 'bigint', nullable: true })
  driveFileSize?: number;

  @Column({ name: 'submission_type', type: 'enum', enum: ['UPLOAD', 'GOOGLE_DRIVE'], default: 'UPLOAD' })
  submissionType: 'UPLOAD' | 'GOOGLE_DRIVE';

  @Column({ type: 'text', nullable: true })
  remarks?: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'created_at', type: 'timestamp', nullable: true, transformer: dateTransformer })
  createdAt?: Date;

  @Column({ name: 'updated_at', type: 'timestamp', nullable: true, transformer: dateTransformer })
  updatedAt?: Date;

  toJSON() {
    return {
      ...this,
      submissionDate: this.submissionDate instanceof Date ? this.submissionDate.toISOString() : this.submissionDate,
      createdAt: this.createdAt instanceof Date ? this.createdAt.toISOString() : this.createdAt,
      updatedAt: this.updatedAt instanceof Date ? this.updatedAt.toISOString() : this.updatedAt,
      driveViewUrl: this.driveFileId ? `https://drive.google.com/file/d/${this.driveFileId}/view` : null,
      correctionDriveViewUrl: this.correctionDriveFileId ? `https://drive.google.com/file/d/${this.correctionDriveFileId}/view` : null,
    };
  }
}

