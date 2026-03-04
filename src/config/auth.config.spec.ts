/**
 * Auth Config Unit Tests
 * Verifies that startup validation rejects insecure configurations
 */

describe('Auth Config Startup Validation', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    // Restore env after each test
    process.env = { ...originalEnv };
    // Clear module cache so registerAs re-evaluates
    jest.resetModules();
  });

  function loadAuthConfig(): any {
    // Dynamic import to re-evaluate the config factory
    const configModule = require('./auth.config');
    const factory = configModule.default;
    // registerAs returns a function — call it to get the config
    return factory();
  }

  it('should throw if JWT_SECRET is missing', () => {
    delete process.env.JWT_SECRET;
    process.env.JWT_REFRESH_SECRET = 'a'.repeat(32);

    expect(() => loadAuthConfig()).toThrow('JWT_SECRET');
  });

  it('should throw if JWT_REFRESH_SECRET is missing', () => {
    process.env.JWT_SECRET = 'a'.repeat(32);
    delete process.env.JWT_REFRESH_SECRET;

    expect(() => loadAuthConfig()).toThrow('JWT_REFRESH_SECRET');
  });

  it('should throw if JWT_SECRET is too short (< 32 chars)', () => {
    process.env.JWT_SECRET = 'short';
    process.env.JWT_REFRESH_SECRET = 'a'.repeat(32);

    expect(() => loadAuthConfig()).toThrow('at least 32 characters');
  });

  it('should throw if JWT_REFRESH_SECRET is too short (< 32 chars)', () => {
    process.env.JWT_SECRET = 'a'.repeat(32);
    process.env.JWT_REFRESH_SECRET = 'short';

    expect(() => loadAuthConfig()).toThrow('at least 32 characters');
  });

  it('should succeed with valid secrets', () => {
    process.env.JWT_SECRET = 'a'.repeat(64);
    process.env.JWT_REFRESH_SECRET = 'b'.repeat(64);

    const config = loadAuthConfig();
    expect(config.secret).toBe('a'.repeat(64));
    expect(config.refreshSecret).toBe('b'.repeat(64));
  });

  it('should use default expiration values', () => {
    process.env.JWT_SECRET = 'a'.repeat(64);
    process.env.JWT_REFRESH_SECRET = 'b'.repeat(64);
    delete process.env.JWT_EXPIRATION;
    delete process.env.JWT_EXPIRES_IN;
    delete process.env.JWT_REFRESH_EXPIRES_IN;

    const config = loadAuthConfig();
    expect(config.expiresIn).toBe('15m');
    expect(config.refreshExpiresIn).toBe('7d');
  });

  it('should respect custom expiration values', () => {
    process.env.JWT_SECRET = 'a'.repeat(64);
    process.env.JWT_REFRESH_SECRET = 'b'.repeat(64);
    process.env.JWT_EXPIRES_IN = '24h';
    process.env.JWT_REFRESH_EXPIRES_IN = '30d';

    const config = loadAuthConfig();
    expect(config.expiresIn).toBe('24h');
    expect(config.refreshExpiresIn).toBe('30d');
  });
});
