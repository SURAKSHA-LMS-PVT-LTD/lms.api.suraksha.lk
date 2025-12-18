/**
 * 🔐 FLEXIBLE ACCESS DECORATOR
 * 
 * Decorator for specifying multiple role-based access requirements with OR logic.
 * If ANY of the configured checks pass, access is granted.
 * 
 * Example Usage:
 * 
 * 1. Global OR Institute Admin access:
 * ```typescript
 * @RequireAnyOfRoles({
 *   global: [UserType.SUPERADMIN],
 *   instituteAdmin: true
 * })
 * ```
 * 
 * 2. Institute Admin OR Parent (with student validation):
 * ```typescript
 * @RequireAnyOfRoles({
 *   instituteAdmin: true,
 *   parent: { requireStudent: true }
 * })
 * ```
 * 
 * 3. Teacher OR Student OR Attendance Marker access:
 * ```typescript
 * @RequireAnyOfRoles({
 *   teacher: { requireClass: true, requireSubject: true },
 *   student: { requireClass: true },
 *   attendanceMarker: { requireClass: true }
 * })
 * ```
 * 
 * 4. Complex: SUPERADMIN OR Institute Admin OR Parent OR Teacher:
 * ```typescript
 * @RequireAnyOfRoles({
 *   global: [UserType.SUPERADMIN],
 *   instituteAdmin: true,
 *   parent: true,
 *   teacher: true
 * })
 * ```
 */

import { SetMetadata } from '@nestjs/common';
import { FlexibleAccessConfig, FLEXIBLE_ACCESS_KEY } from '../guards/flexible-access.guard';

/**
 * Decorator to configure flexible multi-role access with OR logic
 * 
 * @param config - Configuration specifying which roles have access
 * @returns Decorator that sets the metadata for FlexibleAccessGuard
 */
export const RequireAnyOfRoles = (config: FlexibleAccessConfig) =>
  SetMetadata(FLEXIBLE_ACCESS_KEY, config);
