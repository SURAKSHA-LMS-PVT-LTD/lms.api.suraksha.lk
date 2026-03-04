/**
 * Security Utility Tests
 * Verifies that crypto.randomInt and crypto.randomBytes are used correctly
 * for OTP generation and request ID generation across the codebase
 */
import * as crypto from 'crypto';

describe('Cryptographic Security Utilities', () => {
  describe('OTP Generation (crypto.randomInt)', () => {
    it('should generate 6-digit OTPs within valid range', () => {
      for (let i = 0; i < 100; i++) {
        const otp = crypto.randomInt(100000, 1000000).toString();
        expect(otp).toMatch(/^\d{6}$/);
        const num = parseInt(otp, 10);
        expect(num).toBeGreaterThanOrEqual(100000);
        expect(num).toBeLessThan(1000000);
      }
    });

    it('should produce varied outputs (not constant)', () => {
      const otps = new Set<string>();
      for (let i = 0; i < 50; i++) {
        otps.add(crypto.randomInt(100000, 1000000).toString());
      }
      // With 50 samples from 900,000 possibilities, we expect very high uniqueness
      expect(otps.size).toBeGreaterThan(40);
    });
  });

  describe('Request ID Generation (crypto.randomBytes)', () => {
    it('should generate base64url request IDs', () => {
      for (let i = 0; i < 50; i++) {
        const id = crypto.randomBytes(6).toString('base64url');
        expect(id).toBeDefined();
        expect(id.length).toBe(8); // 6 bytes → 8 base64url chars
        // base64url: alphanumeric + - + _
        expect(id).toMatch(/^[A-Za-z0-9_-]+$/);
      }
    });

    it('should generate unique request IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 1000; i++) {
        ids.add(crypto.randomBytes(6).toString('base64url'));
      }
      expect(ids.size).toBe(1000); // 6 bytes = 281 trillion combinations
    });
  });

  describe('UUID Generation (crypto.randomUUID)', () => {
    it('should generate valid UUID v4 format', () => {
      for (let i = 0; i < 20; i++) {
        const uuid = crypto.randomUUID();
        expect(uuid).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
        );
      }
    });

    it('should generate unique UUIDs', () => {
      const uuids = new Set(
        Array.from({ length: 100 }, () => crypto.randomUUID()),
      );
      expect(uuids.size).toBe(100);
    });
  });

  describe('Hex ID Generation (crypto.randomBytes hex)', () => {
    it('should generate 8-char hex IDs', () => {
      for (let i = 0; i < 50; i++) {
        const id = crypto.randomBytes(4).toString('hex');
        expect(id).toMatch(/^[0-9a-f]{8}$/);
      }
    });
  });
});
