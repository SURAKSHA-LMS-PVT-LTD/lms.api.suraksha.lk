/**
 * 🔐 ACCESS CONTROL BARREL EXPORTS
 * 
 * Centralized exports for access control guards and decorators.
 * 
 * ⚠️ SIMPLIFIED ARCHITECTURE - USE ONLY FlexibleAccessGuard
 * 
 * All endpoints should use:
 * - JwtAuthGuard (for authentication)
 * - FlexibleAccessGuard (for role-based authorization)
 * - RequireAnyOfRoles (for configuring access)
 * 
 * Example:
 * ```typescript
 * import {
 *   JwtAuthGuard,
 *   FlexibleAccessGuard,
 *   RequireAnyOfRoles,
 *   UserType
 * } from './auth/guards';
 * 
 * @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
 * @RequireAnyOfRoles({
 *   global: [UserType.SUPERADMIN],
 *   instituteAdmin: true
 * })
 * ```
 */

// ============================================
// CORE AUTHENTICATION
// ============================================
export * from './jwt-auth.guard';
export * from './api-key-or-jwt.guard';

// ============================================
// ✅ FLEXIBLE ACCESS GUARD (ONLY GUARD TO USE)
// ============================================
export {
  FlexibleAccessGuard,
  FlexibleAccessConfig
} from './flexible-access.guard';

// ============================================
// ✅ FLEXIBLE ACCESS DECORATOR
// ============================================
export { RequireAnyOfRoles } from '../decorators/flexible-access.decorator';

// ============================================
// TYPE EXPORTS
// ============================================
export { UserType } from '../../modules/user/enums/user-type.enum';
export {
  EnhancedJwtPayload,
  EnhancedInstituteAccessEntry,
  CompactClassAccess,
  GLOBAL_INSTITUTE_ACCESS_FLAG,
  ROLE_BITMASKS,
  USER_TYPE_COMPACT,
  COMPACT_TO_USER_TYPE
} from '../interfaces/enhanced-jwt-payload.interface';
