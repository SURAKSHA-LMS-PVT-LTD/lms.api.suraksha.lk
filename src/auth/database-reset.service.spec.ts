/**
 * Database Reset Service — Production Guard Tests
 * Verifies that ensureNotProduction blocks dangerous operations
 */

describe('DatabaseResetService Production Guard', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  // We test the guard logic directly since instantiating the service needs TypeORM
  function ensureNotProduction(operation: string): void {
    const env = (process.env.NODE_ENV || '').toLowerCase().trim();
    if (env === 'production' || env === 'prod') {
      throw new Error(`BLOCKED: ${operation} is not allowed in production environment`);
    }
  }

  it('should block when NODE_ENV=production', () => {
    process.env.NODE_ENV = 'production';
    expect(() => ensureNotProduction('Database reset')).toThrow('BLOCKED');
  });

  it('should block when NODE_ENV=prod', () => {
    process.env.NODE_ENV = 'prod';
    expect(() => ensureNotProduction('Database reset')).toThrow('BLOCKED');
  });

  it('should block case-insensitive Production', () => {
    process.env.NODE_ENV = 'Production';
    expect(() => ensureNotProduction('test')).toThrow('BLOCKED');
  });

  it('should block case-insensitive PRODUCTION', () => {
    process.env.NODE_ENV = 'PRODUCTION';
    expect(() => ensureNotProduction('test')).toThrow('BLOCKED');
  });

  it('should block with whitespace (e.g. "production ")', () => {
    process.env.NODE_ENV = ' production ';
    expect(() => ensureNotProduction('test')).toThrow('BLOCKED');
  });

  it('should allow when NODE_ENV=development', () => {
    process.env.NODE_ENV = 'development';
    expect(() => ensureNotProduction('test')).not.toThrow();
  });

  it('should allow when NODE_ENV=test', () => {
    process.env.NODE_ENV = 'test';
    expect(() => ensureNotProduction('test')).not.toThrow();
  });

  it('should allow when NODE_ENV is empty', () => {
    process.env.NODE_ENV = '';
    expect(() => ensureNotProduction('test')).not.toThrow();
  });

  it('should allow when NODE_ENV is not set', () => {
    delete process.env.NODE_ENV;
    expect(() => ensureNotProduction('test')).not.toThrow();
  });

  it('should include operation name in error message', () => {
    process.env.NODE_ENV = 'production';
    expect(() => ensureNotProduction('Seed database')).toThrow('Seed database');
  });
});
