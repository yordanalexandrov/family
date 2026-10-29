/** The lines of `text` that are not blank, trimmed, in order (pasted text: a first line, a lead). */
export function nonEmptyLines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
}
