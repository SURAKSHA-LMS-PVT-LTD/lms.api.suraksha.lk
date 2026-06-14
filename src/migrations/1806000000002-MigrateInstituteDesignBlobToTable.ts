import { MigrationInterface, QueryRunner } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

export class MigrateInstituteDesignBlobToTable1806000000002 implements MigrationInterface {
  name = 'MigrateInstituteDesignBlobToTable1806000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const tableExists = await queryRunner.hasTable('design_templates');
    if (!tableExists) {
      console.log('design_templates table not found — skipping blob migration');
      return;
    }

    // Check that design_templates column exists on institutes
    const cols = await queryRunner.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'institutes' AND COLUMN_NAME = 'design_templates'`
    );
    if (!cols || cols.length === 0) {
      console.log('institutes.design_templates column not found — skipping blob migration');
      return;
    }

    const institutes: { id: string; design_templates: string | null }[] = await queryRunner.query(
      `SELECT id, design_templates FROM institutes WHERE design_templates IS NOT NULL AND design_templates != 'null' AND design_templates != '[]'`
    );

    let migrated = 0;
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

    for (const inst of institutes) {
      let templates: any[];
      try {
        const raw = typeof inst.design_templates === 'string'
          ? JSON.parse(inst.design_templates)
          : inst.design_templates;
        templates = Array.isArray(raw) ? raw : [];
      } catch {
        continue;
      }

      for (const tpl of templates) {
        if (!tpl || typeof tpl !== 'object') continue;

        // Check if already migrated (idempotent by matching institute + name)
        const existing = await queryRunner.query(
          `SELECT id FROM design_templates WHERE institute_id = ? AND name = ? LIMIT 1`,
          [inst.id, tpl.name || 'Unnamed']
        );
        if (existing && existing.length > 0) continue;

        const id = uuidv4();
        const name = (tpl.name || 'Unnamed').substring(0, 255);
        const definition = JSON.stringify(tpl);

        await queryRunner.query(
          `INSERT INTO design_templates
            (id, institute_id, name, definition, status, cost_png, cost_pdf, cost_whatsapp, cost_print,
             allow_png, allow_pdf, allow_whatsapp, allow_print, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'PENDING', 0, 0, 0, 0, 0, 0, 0, 0, ?, ?)`,
          [id, inst.id, name, definition, now, now]
        );
        migrated++;
      }
    }

    console.log(`✅ Migrated ${migrated} design templates from blob to design_templates table (all set to PENDING for review)`);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Intentionally no-op: don't delete migrated rows on rollback
    // to avoid data loss; re-running up is idempotent.
    console.log('MigrateInstituteDesignBlobToTable down: no-op (rows not deleted)');
  }
}
