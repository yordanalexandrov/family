/** Query parameters that only track where a click came from; they never pick the recipe. */
const TRACKING_PARAMS = new Set([
  'fbclid',
  'gclid',
  'dclid',
  'msclkid',
  'yclid',
  'igshid',
  'mc_cid',
  'mc_eid',
  '_ga',
  'ref',
  'ref_src',
]);

function isTracking(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.startsWith('utm_') || TRACKING_PARAMS.has(lower);
}

/** The name of a `name=value` (or bare `name`) query part, as written. */
function paramName(part: string): string {
  const name = part.split('=', 1)[0] ?? '';
  try {
    return decodeURIComponent(name.replaceAll('+', ' '));
  } catch {
    return name;
  }
}

/**
 * The form of a recipe's source link that two pastes of the same page share, for „Вече е в регистъра“: without
 * `utm_*` and other tracking parameters, without `#…` and a trailing `/`, with the scheme and host in lowercase (the
 * path keeps its case: servers tell it apart). A string that is not an absolute URL comes back trimmed.
 */
export function normalizeSourceUrl(url: string): string {
  // `shared` has no DOM or Node types, so no `URL`.
  const match =
    /^([a-z][a-z0-9+.-]*:\/\/)([^/?#]*)([^?#]*)(?:\?([^#]*))?/i.exec(
      url.trim(),
    );
  if (!match) {
    return url.trim();
  }
  const [, scheme = '', authority = '', path = '', query = ''] = match;
  const kept = query
    .split('&')
    .filter((part) => part !== '' && !isTracking(paramName(part)));
  return `${scheme.toLowerCase()}${authority.toLowerCase()}${path.replace(/\/+$/, '')}${kept.length > 0 ? `?${kept.join('&')}` : ''}`;
}
