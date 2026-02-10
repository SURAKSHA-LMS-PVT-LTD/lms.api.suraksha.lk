import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

/**
 * AES-256-GCM encryption utility for securing Google OAuth refresh tokens.
 * 
 * SECURITY PROPERTIES:
 * - AES-256-GCM provides authenticated encryption (confidentiality + integrity)
 * - Each encryption uses a unique random IV (12 bytes)
 * - Auth tag prevents tampering with ciphertext
 * - Key derived from DRIVE_TOKEN_ENCRYPTION_KEY env var (must be 32+ chars)
 * - Format: base64(iv):base64(authTag):base64(ciphertext)
 * 
 * WHY AES-256-GCM:
 * - Industry standard for token encryption at rest
 * - Built into Node.js crypto module (no external deps)
 * - Auth tag prevents token modification attacks
 * - Fast enough for per-request decryption
 */
@Injectable()
export class TokenEncryptionService {
  private readonly logger = new Logger(TokenEncryptionService.name);
  private readonly algorithm = 'aes-256-gcm';
  private readonly ivLength = 12; // GCM recommended IV length
  private readonly authTagLength = 16; // 128-bit auth tag
  private readonly key: Buffer;

  constructor(private readonly configService: ConfigService) {
    const rawKey = this.configService.get<string>('DRIVE_TOKEN_ENCRYPTION_KEY');
    
    if (!rawKey || rawKey.length < 32) {
      throw new Error(
        'DRIVE_TOKEN_ENCRYPTION_KEY must be set and at least 32 characters. ' +
        'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
      );
    }

    // Derive a consistent 32-byte key using SHA-256 hash
    this.key = crypto.createHash('sha256').update(rawKey).digest();
    this.logger.log('Token encryption service initialized');
  }

  /**
   * Encrypt a refresh token for database storage.
   * 
   * @param plaintext - The raw refresh token from Google
   * @returns Encrypted string in format: iv:authTag:ciphertext (all base64)
   */
  encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(this.ivLength);
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv, {
      authTagLength: this.authTagLength,
    });

    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    const authTag = cipher.getAuthTag();

    return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
  }

  /**
   * Decrypt a refresh token from database storage.
   * 
   * @param encryptedData - Encrypted string in format: iv:authTag:ciphertext
   * @returns The raw refresh token
   * @throws Error if decryption fails (token tampered or key changed)
   */
  decrypt(encryptedData: string): string {
    const parts = encryptedData.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted data format');
    }

    const [ivBase64, authTagBase64, ciphertext] = parts;
    const iv = Buffer.from(ivBase64, 'base64');
    const authTag = Buffer.from(authTagBase64, 'base64');

    const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv, {
      authTagLength: this.authTagLength,
    });
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertext, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Verify that an encrypted token can be decrypted (health check).
   */
  canDecrypt(encryptedData: string): boolean {
    try {
      this.decrypt(encryptedData);
      return true;
    } catch {
      return false;
    }
  }
}
