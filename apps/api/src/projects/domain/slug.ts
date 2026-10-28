/** Max length of a project slug (the database checks it too). */
export const SLUG_MAX_LENGTH = 64;

/**
 * URL-safe slug from a display name: lowercase ASCII letters and digits separated by
 * single dashes. Falls back to `project` when nothing usable is left.
 */
export function slugify(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX_LENGTH - 4)
    .replace(/-+$/g, '');
  return slug || 'project';
}

/** First free slug among `base`, `base-2`, `base-3`, ... given the slugs already taken. */
export function uniqueSlug(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}
