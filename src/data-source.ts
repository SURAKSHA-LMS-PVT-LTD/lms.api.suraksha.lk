import { DataSource } from 'typeorm';
import { config } from 'dotenv';

// Load environment variables
config();

const AppDataSource = new DataSource({
  type: 'mysql',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  username: process.env.DB_USERNAME || (() => { throw new Error('DB_USERNAME environment variable is required'); })(),
  password: process.env.DB_PASSWORD ?? (() => { throw new Error('DB_PASSWORD environment variable is required'); })(),
  database: process.env.DB_DATABASE || 'test',
  entities: [
    __dirname + '/modules/**/entities/*.entity{.ts,.js}',
    __dirname + '/auth/entities/*.entity{.ts,.js}',
  ],
  migrations: [
    __dirname + '/database/migrations/*{.ts,.js}',
    __dirname + '/migrations/*{.ts,.js}'
  ],
  synchronize: false,
  logging: true,
  extra: {
    charset: 'utf8mb4_unicode_ci',
    timezone: '+05:30',
    connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT || '25'),
    connectTimeout: 10000,
    supportBigNumbers: true,
    bigNumberStrings: true,
    dateStrings: false,
    debug: false,
  },
});

export default AppDataSource;
