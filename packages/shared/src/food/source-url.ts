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

/** Characters a URL never needs escaped (RFC 3986 „unreserved“). */
const UNRESERVED = /^[A-Za-z0-9\-._~]$/;
/** A run of `%XX` escapes, or any one other character. */
const ESCAPES_OR_CHAR = /((?:%[0-9A-Fa-f]{2})+)|([\s\S])/gu;

function escapeChar(char: string): string {
  return UNRESERVED.test(char)
    ? char
    : encodeURIComponent(char).replace(
        /[!'()*]/g,
        (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
      );
}

/**
 * One spelling of a path or query part: escapes of plain characters decoded, every other escape in uppercase,
 * characters outside printable ASCII (Cyrillic, spaces) escaped as UTF-8. A delimiter keeps its meaning: `/` stays
 * `/`, `%2F` stays `%2F`. A run of escapes that is not UTF-8 stays as written.
 */
function canonicalEscapes(part: string): string {
  return part.replace(ESCAPES_OR_CHAR, (_, run?: string, char?: string) => {
    if (run !== undefined) {
      try {
        return [...decodeURIComponent(run)].map(escapeChar).join('');
      } catch {
        return run;
      }
    }
    return char !== undefined && /^[\x21-\x7e]$/.test(char)
      ? char
      : escapeChar(char ?? '');
  });
}

/**
 * The form of a recipe's source link that two pastes of the same page share, for „Вече е в регистъра“: without
 * `utm_*` and other tracking parameters, without `#…` and a trailing `/`, with the scheme and host in lowercase (the
 * path keeps its case: servers tell it apart), and with one spelling of its escapes, so a Cyrillic path and its
 * `%D0%9A…` form are the same link. The result is ASCII and opens as it is; `displaySourceUrl` is how people read it.
 * A string that is not an absolute URL comes back trimmed.
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
    .filter((part) => part !== '' && !isTracking(paramName(part)))
    .map(canonicalEscapes);
  return `${scheme.toLowerCase()}${authority.toLowerCase()}${canonicalEscapes(path).replace(/\/+$/, '')}${kept.length > 0 ? `?${kept.join('&')}` : ''}`;
}

/**
 * A source link the way people read it: `%D0%9A…` shown as Cyrillic, `%20` as a space. Escaped delimiters (`%2F`,
 * `%26`, `%23`, …) and escapes that are not UTF-8 stay escaped. For showing only; the link itself stays as stored.
 */
export function displaySourceUrl(url: string): string {
  return url.replace(/(?:%[0-9A-Fa-f]{2})+/g, (run) => {
    try {
      return decodeURI(run);
    } catch {
      return run;
    }
  });
}
