/** Без `clipboard.readText` (стар браузър, не-secure контекст) бутонът „Постави от клипборда“ не се показва. */
export function canReadClipboard(): boolean {
  return typeof navigator.clipboard?.readText === 'function';
}

/** Текстът от клипборда без празните краища; `undefined`, ако е празен или няма разрешение — тогава се поставя на ръка. */
export async function readClipboard(): Promise<string | undefined> {
  try {
    const text = (await navigator.clipboard.readText()).trim();
    return text || undefined;
  } catch {
    return undefined;
  }
}
