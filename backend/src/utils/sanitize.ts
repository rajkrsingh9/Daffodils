import sanitizeHtml from 'sanitize-html';

/**
 * All user-authored text is stripped of markup before it is stored (spec §11).
 * Nothing in this product renders HTML, so the allow-list is empty — any tag
 * is an attempt at injection, not formatting.
 */
export function clean(input: string): string {
  return sanitizeHtml(input, {
    allowedTags: [],
    allowedAttributes: {},
    disallowedTagsMode: 'recursiveEscape',
  }).trim();
}

export function cleanOptional(input?: string | null): string | null {
  if (input === undefined || input === null) return null;
  const value = clean(input);
  return value.length ? value : null;
}

const ALLOWED_MEDIA = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
]);

export function isAllowedMime(mime: string): boolean {
  return ALLOWED_MEDIA.has(mime.toLowerCase());
}

/** Media URLs must point at our CDN and carry an allowed extension. */
export function isAllowedMediaUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    return /\.(jpe?g|png|webp|mp4)$/i.test(parsed.pathname);
  } catch {
    return false;
  }
}
