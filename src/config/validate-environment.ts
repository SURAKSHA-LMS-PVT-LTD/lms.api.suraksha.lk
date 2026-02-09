/**
 * 🔒 SECURITY: Environment Variable Validation
 * 
 * This module validates critical environment variables on application startup.
 * If validation fails, the application will NOT start.
 * 
 * Run manually: ts-node src/config/validate-environment.ts
 */

import { config } from 'dotenv';
import { existsSync } from 'fs';
import { join } from 'path';

// Load .env file
const envPath = join(__dirname, '../../.env');
if (existsSync(envPath)) {
  config({ path: envPath });
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate JWT_SECRET
 */
function validateJwtSecret(): ValidationResult {
  const result: ValidationResult = { valid: true, errors: [], warnings: [] };
  const jwtSecret = process.env.JWT_SECRET;

  if (!jwtSecret) {
    result.valid = false;
    result.errors.push(
      '❌ JWT_SECRET is not set!\n' +
      '   Generate with: openssl rand -hex 64\n' +
      '   Add to .env: JWT_SECRET=your_generated_secret'
    );
    return result;
  }

  if (jwtSecret.length < 32) {
    result.valid = false;
    result.errors.push(
      `❌ JWT_SECRET is too short (${jwtSecret.length} chars)!\n` +
      '   Minimum: 32 characters\n' +
      '   Recommended: 128 characters (64 bytes hex)\n' +
      '   Generate with: openssl rand -hex 64'
    );
  } else if (jwtSecret.length < 64) {
    result.warnings.push(
      `⚠️  JWT_SECRET is short (${jwtSecret.length} chars).\n` +
      '   Recommended: 128 characters (64 bytes hex)\n' +
      '   Generate with: openssl rand -hex 64'
    );
  }

  // Check for common weak secrets
  const weakSecrets = [
    'secret', 'fallback-secret-key', 'your-secret-key', 
    'jwt-secret', 'change-me', 'test', 'password',
    'your_super_secure_jwt_secret_key_here'
  ];
  
  if (weakSecrets.includes(jwtSecret.toLowerCase())) {
    result.valid = false;
    result.errors.push(
      '❌ JWT_SECRET is using a weak/default value!\n' +
      '   NEVER use default or common secrets.\n' +
      '   Generate with: openssl rand -hex 64'
    );
  }

  return result;
}

/**
 * Validate BCRYPT_PEPPER
 */
function validateBcryptPepper(): ValidationResult {
  const result: ValidationResult = { valid: true, errors: [], warnings: [] };
  const pepper = process.env.BCRYPT_PEPPER;

  if (!pepper) {
    result.valid = false;
    result.errors.push(
      '❌ BCRYPT_PEPPER is not set!\n' +
      '   Generate with: openssl rand -hex 64\n' +
      '   Add to .env: BCRYPT_PEPPER=your_generated_pepper'
    );
    return result;
  }

  if (pepper.length < 32) {
    result.valid = false;
    result.errors.push(
      `❌ BCRYPT_PEPPER is too short (${pepper.length} chars)!\n` +
      '   Minimum: 32 characters\n' +
      '   Recommended: 128 characters (64 bytes hex)\n' +
      '   Generate with: openssl rand -hex 64'
    );
  } else if (pepper.length < 64) {
    result.warnings.push(
      `⚠️  BCRYPT_PEPPER is short (${pepper.length} chars).\n` +
      '   Recommended: 128 characters (64 bytes hex)'
    );
  }

  // Check for weak defaults
  const weakPeppers = [
    'default-pepper-change-in-production',
    'pepper', 'secret', 'change-me', 'test',
    'generate_64_character_random_string_using_openssl_rand_hex_64'
  ];

  if (weakPeppers.includes(pepper.toLowerCase())) {
    result.valid = false;
    result.errors.push(
      '❌ BCRYPT_PEPPER is using a weak/default value!\n' +
      '   Generate with: openssl rand -hex 64'
    );
  }

  return result;
}

/**
 * Validate BCRYPT_SALT_ROUNDS
 */
function validateBcryptSaltRounds(): ValidationResult {
  const result: ValidationResult = { valid: true, errors: [], warnings: [] };
  const saltRounds = process.env.BCRYPT_SALT_ROUNDS;

  if (!saltRounds) {
    result.warnings.push(
      '⚠️  BCRYPT_SALT_ROUNDS not set, will use default (12).\n' +
      '   Recommended: 12-14 for production'
    );
    return result;
  }

  const rounds = parseInt(saltRounds, 10);
  
  if (isNaN(rounds)) {
    result.valid = false;
    result.errors.push(
      `❌ BCRYPT_SALT_ROUNDS must be a number, got: ${saltRounds}`
    );
  } else if (rounds < 10) {
    result.valid = false;
    result.errors.push(
      `❌ BCRYPT_SALT_ROUNDS too low (${rounds})!\n` +
      '   Minimum: 10\n' +
      '   Recommended: 12 for production, 14 for high security'
    );
  } else if (rounds > 15) {
    result.warnings.push(
      `⚠️  BCRYPT_SALT_ROUNDS very high (${rounds}).\n` +
      '   This will be VERY slow. Consider 12-14.'
    );
  }

  return result;
}

/**
 * Validate Database Configuration
 */
function validateDatabaseConfig(): ValidationResult {
  const result: ValidationResult = { valid: true, errors: [], warnings: [] };

  const required = ['DB_HOST', 'DB_PORT', 'DB_USERNAME', 'DB_PASSWORD', 'DB_DATABASE'];
  
  for (const key of required) {
    if (!process.env[key]) {
      result.valid = false;
      result.errors.push(`❌ ${key} is not set!`);
    }
  }

  // Check DB_PASSWORD strength
  const dbPassword = process.env.DB_PASSWORD;
  if (dbPassword) {
    if (dbPassword.length < 12) {
      result.warnings.push(
        `⚠️  DB_PASSWORD is short (${dbPassword.length} chars).\n` +
        '   Recommended: At least 16 characters with mixed case, numbers, symbols'
      );
    }

    const weakPasswords = [
      'password', 'admin', 'root', '123456', 'secure_password',
      'CHANGE_THIS_TO_SECURE_PASSWORD'
    ];

    if (weakPasswords.includes(dbPassword.toLowerCase())) {
      result.valid = false;
      result.errors.push(
        '❌ DB_PASSWORD is using a weak/default value!\n' +
        '   Use a strong, unique password for production'
      );
    }
  }

  return result;
}

/**
 * Validate Connection Pool Size
 */
function validateConnectionPool(): ValidationResult {
  const result: ValidationResult = { valid: true, errors: [], warnings: [] };
  const poolSize = process.env.DB_POOL_SIZE;

  if (!poolSize) {
    result.warnings.push(
      '⚠️  DB_POOL_SIZE not set, will use application default.\n' +
      '   Recommended: 20 for production (adjust based on server capacity)'
    );
    return result;
  }

  const size = parseInt(poolSize, 10);
  
  if (isNaN(size)) {
    result.valid = false;
    result.errors.push(`❌ DB_POOL_SIZE must be a number, got: ${poolSize}`);
  } else if (size < 5) {
    result.valid = false;
    result.errors.push(
      `❌ DB_POOL_SIZE too small (${size})!\n` +
      '   Minimum: 10 for production\n' +
      '   Recommended: 20-50 depending on server capacity'
    );
  } else if (size < 10) {
    result.warnings.push(
      `⚠️  DB_POOL_SIZE is small (${size}).\n` +
      '   Recommended: 20-50 for production'
    );
  }

  return result;
}

/**
 * Validate that secrets are not reused across different systems
 */
function validateSecretReuse(): ValidationResult {
  const result: ValidationResult = { valid: true, errors: [], warnings: [] };

  const secrets: Record<string, string | undefined> = {
    JWT_SECRET: process.env.JWT_SECRET,
    REFRESH_TOKEN_SECRET: process.env.REFRESH_TOKEN_SECRET,
    BCRYPT_PEPPER: process.env.BCRYPT_PEPPER,
    TELEGRAM_SECRET_TOKEN: process.env.TELEGRAM_SECRET_TOKEN,
    SPECIAL_API_KEY: process.env.SPECIAL_API_KEY,
  };

  const entries = Object.entries(secrets).filter(([, v]) => v && v.length > 0);
  
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      if (entries[i][1] === entries[j][1]) {
        result.warnings.push(
          `⚠️  SECRET REUSE DETECTED: ${entries[i][0]} and ${entries[j][0]} have the same value!\n` +
          `   Each secret should be unique. Reusing secrets across systems reduces security.\n` +
          `   Generate a unique value with: openssl rand -hex 64`
        );
      }
    }
  }

  return result;
}

/**
 * Run all validations
 */
function validateAll(): boolean {
  console.log('🔒 ENVIRONMENT SECURITY VALIDATION\n');
  console.log('='.repeat(60));

  const validations = [
    { name: 'JWT Secret', fn: validateJwtSecret },
    { name: 'Bcrypt Pepper', fn: validateBcryptPepper },
    { name: 'Bcrypt Salt Rounds', fn: validateBcryptSaltRounds },
    { name: 'Database Configuration', fn: validateDatabaseConfig },
    { name: 'Connection Pool', fn: validateConnectionPool },
    { name: 'Secret Reuse', fn: validateSecretReuse },
  ];

  let hasErrors = false;
  let hasWarnings = false;

  for (const validation of validations) {
    console.log(`\n📋 Validating: ${validation.name}`);
    const result = validation.fn();

    if (result.errors.length > 0) {
      hasErrors = true;
      result.errors.forEach(err => console.log(err));
    }

    if (result.warnings.length > 0) {
      hasWarnings = true;
      result.warnings.forEach(warn => console.log(warn));
    }

    if (result.valid && result.errors.length === 0 && result.warnings.length === 0) {
      console.log(`✅ ${validation.name}: OK`);
    }
  }

  console.log('\n' + '='.repeat(60));

  if (hasErrors) {
    console.log('\n❌ VALIDATION FAILED!');
    console.log('\n🛑 APPLICATION CANNOT START WITH THESE ERRORS.');
    console.log('\nFix the errors above and try again.');
    console.log('\n📖 Quick Fix Commands:');
    console.log('   Generate JWT_SECRET:    openssl rand -hex 64');
    console.log('   Generate BCRYPT_PEPPER: openssl rand -hex 64');
    console.log('\n   Add to .env file, then restart the application.\n');
    return false;
  }

  if (hasWarnings) {
    console.log('\n⚠️  VALIDATION PASSED WITH WARNINGS');
    console.log('\nThe application will start, but you should address the warnings above.');
  } else {
    console.log('\n✅ ALL VALIDATIONS PASSED!');
    console.log('\nYour environment configuration is secure.\n');
  }

  return true;
}

// Run validation if executed directly
if (require.main === module) {
  const isValid = validateAll();
  process.exit(isValid ? 0 : 1);
}

// Export for use in application
export { validateAll };
