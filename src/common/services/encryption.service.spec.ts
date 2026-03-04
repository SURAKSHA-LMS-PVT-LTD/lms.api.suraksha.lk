/**
 * EncryptionService Unit Tests
 * Verifies encryption/decryption roundtrip, HMAC, OTP generation,
 * input sanitization, and injection detection
 */
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EncryptionService } from './encryption.service';

describe('EncryptionService', () => {
  let service: EncryptionService;

  const ENCRYPTION_KEY = 'test-encryption-key-for-unit-tests-only';
  const HMAC_SECRET = 'test-hmac-secret-for-unit-tests-only!';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EncryptionService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config: Record<string, string> = {
                ENCRYPTION_KEY,
                HMAC_SECRET,
              };
              return config[key];
            }),
          },
        },
      ],
    }).compile();

    service = module.get<EncryptionService>(EncryptionService);
  });

  describe('Encrypt / Decrypt roundtrip', () => {
    it('should encrypt and decrypt a string successfully', async () => {
      const plaintext = 'Hello, Suraksha LMS!';
      const encrypted = await service.encryptData(plaintext);

      expect(encrypted).toBeDefined();
      expect(encrypted.encrypted).toBeDefined();
      expect(encrypted.salt).toBeDefined();
      expect(encrypted.iv).toBeDefined();
      expect(encrypted.tag).toBeDefined();

      // Encrypted text should differ from plaintext
      expect(encrypted.encrypted).not.toBe(plaintext);

      const decrypted = await service.decryptData(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it('should encrypt and decrypt with a custom password', async () => {
      const plaintext = 'secret data 🔐';
      const password = 'custom-password-12345678901234567890';

      const encrypted = await service.encryptData(plaintext, password);
      const decrypted = await service.decryptData(encrypted, password);
      expect(decrypted).toBe(plaintext);
    });

    it('should fail decryption with wrong password', async () => {
      const encrypted = await service.encryptData('test', 'password-A-1234567890123456');
      await expect(
        service.decryptData(encrypted, 'password-B-1234567890123456'),
      ).rejects.toThrow('Decryption failed');
    });

    it('should produce different ciphertexts for same plaintext (random salt/iv)', async () => {
      const plaintext = 'same input';
      const enc1 = await service.encryptData(plaintext);
      const enc2 = await service.encryptData(plaintext);
      expect(enc1.encrypted).not.toBe(enc2.encrypted);
      expect(enc1.salt).not.toBe(enc2.salt);
      expect(enc1.iv).not.toBe(enc2.iv);
    });

    it('should handle empty strings', async () => {
      const encrypted = await service.encryptData('');
      const decrypted = await service.decryptData(encrypted);
      expect(decrypted).toBe('');
    });

    it('should handle unicode and special characters', async () => {
      const plaintext = '中文 العربية 🎉 ñ ü ø';
      const encrypted = await service.encryptData(plaintext);
      const decrypted = await service.decryptData(encrypted);
      expect(decrypted).toBe(plaintext);
    });
  });

  describe('Database field encryption', () => {
    it('should encrypt and decrypt database fields', async () => {
      const value = 'sensitive-db-field-value';
      const encryptedJson = await service.encryptDatabaseField(value);

      expect(typeof encryptedJson).toBe('string');
      // Should be valid JSON
      expect(() => JSON.parse(encryptedJson)).not.toThrow();

      const decrypted = await service.decryptDatabaseField(encryptedJson);
      expect(decrypted).toBe(value);
    });

    it('should throw on invalid encrypted field data', async () => {
      await expect(
        service.decryptDatabaseField('not-valid-json'),
      ).rejects.toThrow();
    });
  });

  describe('generateSecureToken', () => {
    it('should generate a base64url token of expected length', () => {
      const token = service.generateSecureToken(32);
      expect(token).toBeDefined();
      expect(token.length).toBeGreaterThan(0);
      // base64url encoding: 32 bytes → ~43 chars
      expect(token.length).toBeGreaterThanOrEqual(40);
    });

    it('should generate unique tokens', () => {
      const tokens = new Set(
        Array.from({ length: 100 }, () => service.generateSecureToken()),
      );
      expect(tokens.size).toBe(100);
    });
  });

  describe('generateNumericOTP', () => {
    it('should generate a 6-digit OTP by default', () => {
      const otp = service.generateNumericOTP();
      expect(otp).toMatch(/^\d{6}$/);
    });

    it('should generate OTP of specified length', () => {
      const otp = service.generateNumericOTP(8);
      expect(otp).toMatch(/^\d{8}$/);
    });

    it('should generate different OTPs', () => {
      const otps = new Set(
        Array.from({ length: 50 }, () => service.generateNumericOTP()),
      );
      // At least most should be unique (6 digits = 1M combinations)
      expect(otps.size).toBeGreaterThan(40);
    });
  });

  describe('HMAC', () => {
    it('should create and verify an HMAC', () => {
      const data = 'important data';
      const hmac = service.createHMAC(data);
      expect(hmac).toBeDefined();
      expect(typeof hmac).toBe('string');

      const isValid = service.verifyHMAC(data, hmac);
      expect(isValid).toBe(true);
    });

    it('should reject tampered data', () => {
      const hmac = service.createHMAC('original');
      const isValid = service.verifyHMAC('tampered', hmac);
      expect(isValid).toBe(false);
    });

    it('should reject tampered HMAC', () => {
      const hmac = service.createHMAC('data');
      const isValid = service.verifyHMAC('data', hmac + 'x');
      expect(isValid).toBe(false);
    });

    it('should work with custom secret', () => {
      const data = 'data';
      const secret = 'my-custom-secret';
      const hmac = service.createHMAC(data, secret);
      expect(service.verifyHMAC(data, hmac, secret)).toBe(true);
      // Different secret should fail
      expect(service.verifyHMAC(data, hmac, 'wrong-secret')).toBe(false);
    });
  });

  describe('sanitizeInput', () => {
    it('should escape HTML entities', () => {
      expect(service.sanitizeInput('<script>alert("xss")</script>')).toBe(
        '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;',
      );
    });

    it('should escape single quotes', () => {
      expect(service.sanitizeInput("it's")).toBe("it&#x27;s");
    });

    it('should escape ampersands', () => {
      expect(service.sanitizeInput('a&b')).toBe('a&amp;b');
    });

    it('should handle empty/null input', () => {
      expect(service.sanitizeInput('')).toBe('');
      expect(service.sanitizeInput(null as any)).toBe('');
      expect(service.sanitizeInput(undefined as any)).toBe('');
    });

    it('should trim whitespace', () => {
      expect(service.sanitizeInput('  hello  ')).toBe('hello');
    });
  });

  describe('validateInput', () => {
    it('should accept clean input', () => {
      const result = service.validateInput('Hello World 123');
      expect(result.isValid).toBe(true);
      expect(result.reasons).toHaveLength(0);
    });

    it('should detect SQL injection patterns', () => {
      const tests = [
        "admin' OR '1'='1",
        'DROP TABLE users',
        'UNION SELECT * FROM passwords',
        "1; INSERT INTO users VALUES('hacker')",
      ];

      for (const input of tests) {
        const result = service.validateInput(input);
        expect(result.isValid).toBe(false);
        expect(result.reasons).toContain('Potential SQL injection detected');
      }
    });

    it('should detect XSS patterns', () => {
      const tests = [
        '<script>alert(1)</script>',
        'javascript:void(0)',
        '<img onerror=alert(1)>',
        '<div onclick=steal()>',
      ];

      for (const input of tests) {
        const result = service.validateInput(input);
        expect(result.isValid).toBe(false);
        expect(result.reasons).toContain('Potential XSS attack detected');
      }
    });

    it('should detect command injection patterns', () => {
      const tests = [';cat /etc/passwd', '|cat /etc/shadow', '`whoami`', '$(rm -rf /)'];

      for (const input of tests) {
        const result = service.validateInput(input);
        expect(result.isValid).toBe(false);
        expect(result.reasons).toContain('Potential command injection detected');
      }
    });
  });

  describe('secureMemoryClear', () => {
    it('should be a no-op without throwing', () => {
      expect(() => service.secureMemoryClear('sensitive')).not.toThrow();
    });
  });
});
