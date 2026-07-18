import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/**
 * Migration: AddInstituteSeoFields
 *
 * Adds per-institute SEO metadata columns used to populate og:title, og:description,
 * og:image, and meta keywords on custom domain pages — ensuring WhatsApp, Telegram,
 * Twitter, and Google see institute-specific content rather than Suraksha branding.
 */
export class AddInstituteSeoFields1855000000000 implements MigrationInterface {
  name = 'AddInstituteSeoFields1855000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumns('institutes', [
      new TableColumn({
        name: 'seo_title',
        type: 'varchar',
        length: '200',
        isNullable: true,
        comment: 'Custom <title> / og:title shown on the custom domain (WhatsApp preview title)',
      }),
      new TableColumn({
        name: 'seo_description',
        type: 'text',
        isNullable: true,
        comment: 'Meta description and og:description — shown in Google snippets and WhatsApp previews',
      }),
      new TableColumn({
        name: 'seo_keywords',
        type: 'varchar',
        length: '500',
        isNullable: true,
        comment: 'Comma-separated meta keywords for the custom domain',
      }),
      new TableColumn({
        name: 'seo_og_image_url',
        type: 'varchar',
        length: '500',
        isNullable: true,
        comment: 'og:image URL — thumbnail shown in WhatsApp/Telegram/Twitter link previews',
      }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumns('institutes', [
      'seo_title',
      'seo_description',
      'seo_keywords',
      'seo_og_image_url',
    ]);
  }
}
