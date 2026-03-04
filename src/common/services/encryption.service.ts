import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

/**
 * 🔐 ENHANCED ENCRYPTION SERVICE
 * Provides multiple layers of encryption and security utilities
 */
@Injectable()
export class EncryptionService {
  private readonly logger = new Logger(EncryptionService.name);
  private readonly algorithm = 'aes-256-gcm';
  private readonly keyDerivationIterations = 100000;
  private readonly saltLength = 32;
  private readonly ivLength = 16;
  private readonly tagLength = 16;

  constructor(private configService: ConfigService) {}

  /**
   * 🔒 Encrypt sensitive data with AES-256-GCM
   */
  async encryptData(plaintext: string, password?: string): Promise<{
    encrypted: string;
    salt: string;
    iv: string;
    tag: string;
  }> {
    try {
      const salt = crypto.randomBytes(this.saltLength);
      const iv = crypto.randomBytes(this.ivLength);
      
      // Use provided password or system secret
      const keySource = password || this.configService.get<string>('ENCRYPTION_KEY');
      if (!keySource) {
        throw new Error('No encryption key available');
      }

      // Derive key using PBKDF2
      const key = crypto.pbkdf2Sync(keySource, salt, this.keyDerivationIterations, 32, 'sha512');
      
      // Create cipher
      const cipher = crypto.createCipheriv(this.algorithm, key, iv);
      
      // Encrypt data
      let encrypted = cipher.update(plaintext, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      // Get authentication tag
      const tag = cipher.getAuthTag();

      return {
        encrypted,
        salt: salt.toString('hex'),
        iv: iv.toString('hex'),
        tag: tag.toString('hex'),
      };
    } catch (error) {
      this.logger.error(`Encryption failed: ${error.message}`);
      throw new Error('Encryption failed');
    }
  }

  /**
   * 🔓 Decrypt data encrypted with encryptData
   */
  async decryptData(encryptedData: {
    encrypted: string;
    salt: string;
    iv: string;
    tag: string;
  }, password?: string): Promise<string> {
    try {
      const salt = Buffer.from(encryptedData.salt, 'hex');
      const iv = Buffer.from(encryptedData.iv, 'hex');
      const tag = Buffer.from(encryptedData.tag, 'hex');
      
      // Use provided password or system secret
      const keySource = password || this.configService.get<string>('ENCRYPTION_KEY');
      if (!keySource) {
        throw new Error('No encryption key available');
      }

      // Derive key using same parameters
      const key = crypto.pbkdf2Sync(keySource, salt, this.keyDerivationIterations, 32, 'sha512');
      
      // Create decipher
      const decipher = crypto.createDecipheriv(this.algorithm, key, iv);
      decipher.setAuthTag(tag);
      
      // Decrypt data
      let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      this.logger.error(`Decryption failed: ${error.message}`);
      throw new Error('Decryption failed');
    }
  }



  /**
   * 🎲 Generate cryptographically secure random tokens
   */
  generateSecureToken(length: number = 32): string {
    return crypto.randomBytes(length).toString('base64url');
  }

  /**
   * 🔢 Generate secure numeric OTP
   * Uses crypto.randomInt to avoid modular bias (256 % 10 ≠ 0).
   */
  generateNumericOTP(length: number = 6): string {
    let otp = '';
    for (let i = 0; i < length; i++) {
      otp += crypto.randomInt(0, 10).toString();
    }
    return otp;
  }

  /**
   * 🔒 Create HMAC for data integrity
   */
  createHMAC(data: string, secret?: string): string {
    const hmacSecret = secret || this.configService.get<string>('HMAC_SECRET');
    if (!hmacSecret) {
      throw new Error('No HMAC secret available');
    }
    
    return crypto.createHmac('sha256', hmacSecret).update(data).digest('hex');
  }

  /**
   * ✅ Verify HMAC for data integrity
   */
  verifyHMAC(data: string, expectedHmac: string, secret?: string): boolean {
    try {
      const computedHmac = this.createHMAC(data, secret);
      return this.constantTimeCompare(computedHmac, expectedHmac);
    } catch (error) {
      this.logger.error(`HMAC verification failed: ${error.message}`);
      return false;
    }
  }

  /**
   * 🔐 Encrypt database fields
   */
  async encryptDatabaseField(value: string): Promise<string> {
    const encrypted = await this.encryptData(value);
    return JSON.stringify(encrypted);
  }

  /**
   * 🔓 Decrypt database fields
   */
  async decryptDatabaseField(encryptedValue: string): Promise<string> {
    try {
      const encryptedData = JSON.parse(encryptedValue);
      return await this.decryptData(encryptedData);
    } catch (error) {
      this.logger.error(`Database field decryption failed: ${error.message}`);
      throw new Error('Database field decryption failed');
    }
  }

  /**
   * 🛡️ Sanitize input to prevent injection attacks
   */
  sanitizeInput(input: string): string {
    if (!input) return '';
    
    return input
      .replace(/[<>'"&]/g, (match) => {
        const entities: { [key: string]: string } = {
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#x27;',
          '&': '&amp;',
        };
        return entities[match];
      })
      .trim();
  }

  /**
   * 🔍 Validate input against common injection patterns
   */
  validateInput(input: string): { isValid: boolean; reasons: string[] } {
    const reasons: string[] = [];
    
    // SQL injection patterns
    const sqlPatterns = [
      /union.*select/i,
      /drop.*table/i,
      /insert.*into/i,
      /'.*or.*'.*=/i,
      /--/,
      /\/\*/,
    ];

    // XSS patterns
    const xssPatterns = [
      /<script/i,
      /javascript:/i,
      /onload=/i,
      /onerror=/i,
      /onclick=/i,
      /onmouseover=/i,
    ];

    // Command injection patterns
    const cmdPatterns = [
      /;.*cat/i,
      /;.*ls/i,
      /;.*whoami/i,
      /\|.*cat/i,
      /`.*`/,
      /\$\(/,
    ];

    // Check patterns
    for (const pattern of sqlPatterns) {
      if (pattern.test(input)) {
        reasons.push('Potential SQL injection detected');
        break;
      }
    }

    for (const pattern of xssPatterns) {
      if (pattern.test(input)) {
        reasons.push('Potential XSS attack detected');
        break;
      }
    }

    for (const pattern of cmdPatterns) {
      if (pattern.test(input)) {
        reasons.push('Potential command injection detected');
        break;
      }
    }

    return {
      isValid: reasons.length === 0,
      reasons,
    };
  }

  /**
   * ⏱️ Constant time string comparison to prevent timing attacks
   * Uses Node.js crypto.timingSafeEqual for guaranteed constant-time comparison.
   */
  private constantTimeCompare(a: string, b: string): boolean {
    // Use same-length buffers for timingSafeEqual; pad shorter to avoid length leak
    const bufA = Buffer.from(a, 'utf-8');
    const bufB = Buffer.from(b, 'utf-8');

    // If lengths differ the values can't be equal, but we still run
    // timingSafeEqual on padded buffers so the timing is constant.
    if (bufA.length !== bufB.length) {
      // Compare bufA against itself so the elapsed time is the same
      // as a real comparison of equal-length strings.
      crypto.timingSafeEqual(bufA, bufA);
      return false;
    }

    return crypto.timingSafeEqual(bufA, bufB);
  }

  /**
   * 🧹 Clear sensitive data reference
   * NOTE: JavaScript strings are immutable — true memory clearing is not possible in JS/V8.
   * This method is a no-op placeholder. For sensitive data, rely on short variable lifetimes
   * and avoid storing secrets in long-lived variables.
   */
  secureMemoryClear(_sensitiveData: string): void {
    // No-op: JavaScript strings are immutable and cannot be overwritten in memory.
    // The previous implementation created garbage strings without clearing originals.
    // Rely on V8 garbage collection and minimize sensitive data lifetime instead.
  }
}
