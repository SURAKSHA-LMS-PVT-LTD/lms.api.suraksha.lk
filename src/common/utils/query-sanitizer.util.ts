/**
 * Query sanitization utilities to prevent SQL injection through
 * ORDER BY field name interpolation.
 *
 * OWASP: When column names must be dynamic (e.g. user-chosen sort fields),
 * parameterized queries don't help — an allowlist is the only safe approach.
 */

/**
 * Validates a user-provided sort field against a strict allowlist.
 * Returns the validated field or a safe default.
 *
 * @param sortBy - The user-provided sort field
 * @param allowedFields - Array of allowed column names
 * @param defaultField - Fallback if sortBy is not in the allowlist (default: 'createdAt')
 * @returns A safe field name guaranteed to be in the allowlist
 *
 * @example
 * ```ts
 * const safeSortBy = sanitizeSortField(dto.sortBy, ['name', 'email', 'createdAt'], 'createdAt');
 * queryBuilder.orderBy(`user.${safeSortBy}`, sortOrder);
 * ```
 */
export function sanitizeSortField(
  sortBy: string | undefined | null,
  allowedFields: readonly string[],
  defaultField = 'createdAt',
): string {
  if (!sortBy) return defaultField;
  return allowedFields.includes(sortBy) ? sortBy : defaultField;
}

/**
 * Validates and normalizes sort order to prevent injection.
 * Only 'ASC' or 'DESC' are valid SQL sort orders.
 *
 * @param sortOrder - The user-provided sort order
 * @param defaultOrder - Fallback order (default: 'DESC')
 * @returns 'ASC' or 'DESC'
 */
export function sanitizeSortOrder(
  sortOrder: string | undefined | null,
  defaultOrder: 'ASC' | 'DESC' = 'DESC',
): 'ASC' | 'DESC' {
  if (!sortOrder) return defaultOrder;
  const upper = sortOrder.toUpperCase();
  return upper === 'ASC' ? 'ASC' : upper === 'DESC' ? 'DESC' : defaultOrder;
}
