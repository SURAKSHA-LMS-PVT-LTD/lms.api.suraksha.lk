import { registerAs } from '@nestjs/config';

export default registerAs('auth', () => {
  const secret = process.env.JWT_SECRET;
  const refreshSecret = process.env.JWT_REFRESH_SECRET;

  if (!secret) {
    throw new Error('FATAL: JWT_SECRET environment variable is required but not set. Aborting startup.');
  }
  if (!refreshSecret) {
    throw new Error('FATAL: JWT_REFRESH_SECRET environment variable is required but not set. Aborting startup.');
  }
  if (secret.length < 32) {
    throw new Error('FATAL: JWT_SECRET must be at least 32 characters long for security.');
  }
  if (refreshSecret.length < 32) {
    throw new Error('FATAL: JWT_REFRESH_SECRET must be at least 32 characters long for security.');
  }

  return {
    secret,
    expiresIn: process.env.JWT_EXPIRATION || process.env.JWT_EXPIRES_IN || '15m',
    refreshSecret,
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  };
});
