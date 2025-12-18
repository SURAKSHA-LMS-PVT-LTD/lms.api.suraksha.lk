import { SetMetadata } from '@nestjs/common';

/**
 * 🔓 PUBLIC DECORATOR
 * 
 * Mark routes that can be accessed WITHOUT JWT authentication token
 * 
 * IMPORTANT: @Public() routes STILL enforce:
 * ✅ Origin validation (must come from whitelisted frontends)
 * ✅ CORS restrictions
 * ✅ Rate limiting
 * ✅ All other security measures
 * 
 * @Public() ONLY means: No JWT token required
 * 
 * Use for:
 * - Login endpoints
 * - Password reset flows
 * - OTP verification
 * - Public registration endpoints
 * 
 * Usage:
 * @Public()
 * @Post('login')
 * login(@Body() dto: LoginDto) { ... }
 */
export const Public = () => SetMetadata('isPublic', true);
