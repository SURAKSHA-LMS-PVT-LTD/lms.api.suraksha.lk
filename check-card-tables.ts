import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';

dotenv.config();

const dataSource = new DataSource({
  type: 'mysql',
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '3306'),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
});

async function checkTables() {
  try {
    console.log('Connecting to database...');
    await dataSource.initialize();
    
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();

    console.log('\nChecking for user card management tables:\n');

    const tables = await queryRunner.query(`
      SHOW TABLES LIKE '%card%'
    `);

    if (tables.length === 0) {
      console.log('❌ No card-related tables found.');
      console.log('\nYou can safely run the migration.');
    } else {
      console.log('✅ Found card-related tables:');
      tables.forEach((row: any) => {
        const tableName = Object.values(row)[0];
        console.log(`   - ${tableName}`);
      });
      
      // Check specific tables
      const cardTables = ['cards', 'user_id_card_orders', 'card_payments'];
      console.log('\nSpecific table status:');
      for (const table of cardTables) {
        try {
          const result = await queryRunner.query(`SHOW TABLES LIKE '${table}'`);
          if (result.length > 0) {
            const count = await queryRunner.query(`SELECT COUNT(*) as count FROM \`${table}\``);
            console.log(`   ✅ ${table} (${count[0].count} rows)`);
          } else {
            console.log(`   ❌ ${table} does not exist`);
          }
        } catch (error) {
          console.log(`   ❌ ${table} does not exist`);
        }
      }
    }

    await queryRunner.release();
    await dataSource.destroy();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    await dataSource.destroy();
    process.exit(1);
  }
}

checkTables();
