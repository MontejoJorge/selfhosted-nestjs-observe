/** True for a PostgreSQL unique violation, optionally on a given constraint. */
export function isUniqueViolation(
  error: unknown,
  constraint?: string,
): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { code, constraint: name } = error as {
    code?: unknown;
    constraint?: unknown;
  };
  return code === '23505' && (!constraint || name === constraint);
}
