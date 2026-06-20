import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Seeds demo LECTURES + RECORDINGS (with materials) into the demo institute
 * (Demo Academy, seeded by 1812000000000). Placeholder media URLs — nothing
 * streams, but the academics UI/flow is fully demoable.
 *
 * Scoped to the demo institute id, so down() removes exactly this content.
 */
export class SeedDemoLecturesRecordings1812000000002 implements MigrationInterface {
  name = 'SeedDemoLecturesRecordings1812000000002';

  private readonly INST = 'de300000-0000-4000-8000-000000000001';
  private readonly TEACHER_UID = 990000011; // demo teacher 1 (from the base seed)

  private classId(n: number)   { return `dec10000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`; }
  private subjectId(n: number) { return `de500000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`; }

  private materials(subject: string) {
    return JSON.stringify([
      { documentName: `${subject} - Notes.pdf`, documentUrl: 'https://example.com/demo/notes.pdf', source: 'EXTERNAL' },
      { documentName: `${subject} - Worksheet.pdf`, documentUrl: 'https://example.com/demo/worksheet.pdf', source: 'EXTERNAL' },
    ]);
  }

  public async up(qr: QueryRunner): Promise<void> {
    const inst = await qr.query(`SELECT id FROM institutes WHERE id = ?`, [this.INST]);
    if (inst.length === 0) {
      console.log('[SeedDemoLecturesRecordings] Demo institute not found — skipping.');
      return;
    }
    const already = await qr.query(`SELECT id FROM subject_recordings WHERE institute_id = ? LIMIT 1`, [this.INST]);
    if (already.length > 0) {
      console.log('[SeedDemoLecturesRecordings] Demo recordings already present — skipping.');
      return;
    }

    const subjects = ['Mathematics', 'Science', 'English', 'History'];
    const now = new Date();
    let lectureCount = 0;
    let recordingCount = 0;

    for (let si = 0; si < subjects.length; si++) {
      const subjectName = subjects[si];
      const subjectId = this.subjectId(si + 1);
      const classId = this.classId((si % 3) + 1);

      // ── 2 lectures per subject (one past/completed, one upcoming/scheduled) ──
      for (let li = 1; li <= 2; li++) {
        const past = li === 1;
        const start = new Date(now);
        start.setDate(now.getDate() + (past ? -7 * li : 3 * li));
        start.setHours(9, 0, 0, 0);
        const end = new Date(start);
        end.setHours(10, 30, 0, 0);
        const fmt = (d: Date) => d.toISOString().slice(0, 19).replace('T', ' ');

        await qr.query(
          `INSERT INTO institute_class_subject_lectures
             (institute_id, class_id, subject_id, instructor_id, title, description,
              lecture_type, venue, start_time, end_time, status, is_recorded,
              recording_url, is_active, materials, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 'online', 'Online (Demo)', ?, ?, ?, ?, ?, 1, ?, NOW(), NOW())`,
          [
            this.INST, classId, subjectId, this.TEACHER_UID,
            `${subjectName} — Lecture ${li}`,
            `Demo ${subjectName} lecture ${li}.`,
            fmt(start), fmt(end),
            past ? 'completed' : 'scheduled',
            past ? 1 : 0,
            past ? 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' : null,
            this.materials(subjectName),
          ],
        );
        lectureCount++;
      }

      // ── 2 recordings per subject ──
      for (let ri = 1; ri <= 2; ri++) {
        const platform = ri === 1 ? 'YOUTUBE' : 'GOOGLE_DRIVE';
        const url = ri === 1
          ? 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
          : 'https://drive.google.com/file/d/DEMO_FILE_ID/view';
        await qr.query(
          `INSERT INTO subject_recordings
             (institute_id, class_id, subject_id, uploaded_by_id, title, description,
              platform, recording_url, duration_seconds, status, is_active,
              rec_access_level, materials, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', 1, 'ENROLLED_ONLY', ?, NOW(), NOW())`,
          [
            this.INST, classId, subjectId, this.TEACHER_UID,
            `${subjectName} — Recording ${ri}`,
            `Demo ${subjectName} recording ${ri}.`,
            platform, url, 3600 + ri * 120,
            this.materials(subjectName),
          ],
        );
        recordingCount++;
      }
    }

    console.log(`[SeedDemoLecturesRecordings] Done. ${lectureCount} lectures, ${recordingCount} recordings (with materials) for the demo institute.`);
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DELETE FROM subject_recordings WHERE institute_id = ?`, [this.INST]);
    await qr.query(`DELETE FROM institute_class_subject_lectures WHERE institute_id = ?`, [this.INST]);
    console.log('[SeedDemoLecturesRecordings] Demo lectures + recordings removed.');
  }
}
