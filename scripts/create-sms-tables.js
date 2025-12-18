const mysql = require('mysql2/promise');
require('dotenv').config();

async function createSmsTablesDirectly() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE
  });

  console.log('🔗 Connected to database');

  try {
    // Create institute_sms_credentials table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS \`institute_sms_credentials\` (
        \`id\` varchar(36) NOT NULL PRIMARY KEY,
        \`institute_id\` varchar(36) NOT NULL,
        \`current_credits\` int NOT NULL DEFAULT 0,
        \`total_purchased\` int NOT NULL DEFAULT 0,
        \`total_used\` int NOT NULL DEFAULT 0,
        \`verification_stage\` enum('INITIAL', 'PENDING_VERIFICATION', 'PRE_APPROVED', 'VERIFIED', 'REJECTED') NOT NULL DEFAULT 'INITIAL',
        \`mask_ids\` json DEFAULT NULL,
        \`sender_masks\` json DEFAULT NULL,
        \`daily_limit\` int DEFAULT NULL,
        \`monthly_limit\` int DEFAULT NULL,
        \`daily_used\` int NOT NULL DEFAULT 0,
        \`monthly_used\` int NOT NULL DEFAULT 0,
        \`last_reset_date\` date DEFAULT NULL,
        \`is_active\` tinyint(1) NOT NULL DEFAULT 1,
        \`created_by\` varchar(36) DEFAULT NULL,
        \`approved_by\` varchar(36) DEFAULT NULL,
        \`approved_at\` datetime DEFAULT NULL,
        \`notes\` text DEFAULT NULL,
        \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        
        INDEX \`idx_institute_sms_credentials_institute_id\` (\`institute_id\`),
        INDEX \`idx_institute_sms_credentials_verification_stage\` (\`verification_stage\`),
        INDEX \`idx_institute_sms_credentials_is_active\` (\`is_active\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Created institute_sms_credentials table');



    // Create institute_sms_messages table (main SMS messages table)
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS \`institute_sms_messages\` (
        \`id\` bigint AUTO_INCREMENT PRIMARY KEY,
        \`institute_id\` bigint NOT NULL,
        \`sent_by\` bigint NOT NULL,
        \`message_type\` enum('CUSTOM_NUMBERS', 'BULK_INSTITUTE_USERS', 'CLASS_BASED', 'SUBJECT_BASED', 'USER_TYPE_BASED', 'SPECIFIC_USERS') NOT NULL,
        \`recipient_filter_type\` enum('CUSTOM', 'STUDENTS', 'TEACHERS', 'PARENTS', 'ADMIN', 'ALL') NOT NULL,
        \`message_template\` text NOT NULL,
        \`processed_message_sample\` text DEFAULT NULL,
        \`total_recipients\` int NOT NULL,
        \`successful_sends\` int NOT NULL DEFAULT 0,
        \`failed_sends\` int NOT NULL DEFAULT 0,
        \`credits_used\` int NOT NULL,
        \`status\` enum('PENDING_VERIFICATION', 'APPROVED', 'REJECTED', 'QUEUED', 'SENDING', 'SENT', 'PARTIALLY_SENT', 'FAILED') NOT NULL DEFAULT 'PENDING_VERIFICATION',
        \`mask_id_used\` varchar(100) DEFAULT NULL,
        \`sender_name\` varchar(100) DEFAULT NULL,
        \`filter_criteria\` json DEFAULT NULL,
        \`scheduled_at\` timestamp DEFAULT NULL,
        \`approved_at\` timestamp DEFAULT NULL,
        \`approved_by\` bigint DEFAULT NULL,
        \`sent_at\` timestamp DEFAULT NULL,
        \`completed_at\` timestamp DEFAULT NULL,
        \`rejection_reason\` text DEFAULT NULL,
        \`error_message\` text DEFAULT NULL,
        \`delivery_report\` json DEFAULT NULL,
        \`notification_logged\` boolean NOT NULL DEFAULT false,
        \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        
        INDEX \`idx_institute_sms_messages_institute_id\` (\`institute_id\`),
        INDEX \`idx_institute_sms_messages_status\` (\`status\`),
        INDEX \`idx_institute_sms_messages_message_type\` (\`message_type\`),
        INDEX \`idx_institute_sms_messages_created_at\` (\`created_at\`),
        INDEX \`idx_institute_sms_messages_scheduled_at\` (\`scheduled_at\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Created institute_sms_messages table');

    // Create institute_sms_payment_submissions table  
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS \`institute_sms_payment_submissions\` (
        \`id\` bigint AUTO_INCREMENT PRIMARY KEY,
        \`institute_id\` bigint NOT NULL,
        \`submitted_by\` bigint NOT NULL,
        \`requested_credits\` int NOT NULL,
        \`payment_amount\` decimal(10,2) NOT NULL,
        \`payment_method\` varchar(100) NOT NULL,
        \`payment_reference\` varchar(200) DEFAULT NULL,
        \`payment_slip_url\` varchar(500) NOT NULL,
        \`payment_slip_filename\` varchar(255) NOT NULL,
        \`status\` enum('PENDING', 'VERIFIED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
        \`credits_granted\` int DEFAULT NULL,
        \`cost_per_credit\` decimal(10,4) DEFAULT NULL,
        \`verified_by\` bigint DEFAULT NULL,
        \`verified_at\` timestamp DEFAULT NULL,
        \`rejection_reason\` text DEFAULT NULL,
        \`admin_notes\` text DEFAULT NULL,
        \`submission_notes\` text DEFAULT NULL,
        \`submitted_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        
        INDEX \`idx_institute_sms_payment_submissions_institute_id\` (\`institute_id\`),
        INDEX \`idx_institute_sms_payment_submissions_status\` (\`status\`),
        INDEX \`idx_institute_sms_payment_submissions_submitted_at\` (\`submitted_at\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Created institute_sms_payment_submissions table');

    // Insert sample data for testing
    await connection.execute(`
      INSERT IGNORE INTO \`institute_sms_credentials\` (
        \`id\`, \`institute_id\`, \`current_credits\`, \`total_purchased\`, \`verification_stage\`, \`is_active\`
      ) VALUES (
        UUID(), '1', 1000, 1000, 'PRE_APPROVED', 1
      )
    `);
    console.log('✅ Inserted sample SMS credentials for institute 1');

    console.log('🎉 All SMS tables created successfully!');
    
  } catch (error) {
    console.error('❌ Error creating tables:', error.message);
  } finally {
    await connection.end();
    console.log('🔒 Database connection closed');
  }
}

createSmsTablesDirectly().catch(console.error);