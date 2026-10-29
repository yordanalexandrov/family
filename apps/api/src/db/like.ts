/** `text` for a `like` pattern, where `%`, `_` and `\` match themselves, not any characters. */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, '\\$&');
}

/** `%text%` for `ilike`, where `%`, `_` and `\` in user text match themselves, not any characters. */
export function likePattern(text: string): string {
  return `%${escapeLike(text)}%`;
}
