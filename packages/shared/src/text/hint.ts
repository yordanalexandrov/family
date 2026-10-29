/**
 * A label with the hint of its request after it: „Предложено от Дани · „повече риба““; the label alone without one.
 * The caller shortens a hint that has to fit.
 */
export function withHint(
  label: string,
  hint: string | null | undefined,
): string {
  return hint ? `${label} · „${hint}“` : label;
}
