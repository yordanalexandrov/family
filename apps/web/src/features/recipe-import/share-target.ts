import type { RecipeImportParams } from '@family/shared';

/**
 * What Android sends to the PWA share target (`share_target.params` in `vite.config.ts`): any of the three may be
 * missing. Many apps (Chrome too) put the link in `text`, not in `url`.
 */
export interface SharedData {
  title?: string | undefined;
  text?: string | undefined;
  url?: string | undefined;
}

/** A web link inside free text; trailing punctuation of the sentence is not part of it. */
const LINK_IN_TEXT = /https?:\/\/[^\s<>"']+/i;
const TRAILING_PUNCTUATION = /[.,;:!?)\]}»]+$/;

function webUrl(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && /^https?:\/\//i.test(trimmed) && URL.canParse(trimmed)
    ? trimmed
    : undefined;
}

function firstLinkIn(text: string | undefined): string | undefined {
  const match = text?.match(LINK_IN_TEXT)?.[0];
  return webUrl(match?.replace(TRAILING_PUNCTUATION, ''));
}

/**
 * The import a share starts: a link (from `url`, else the first link in `text`) is imported as a link; otherwise the
 * shared text, with the title on top unless the text already starts with it. Nothing to import → `null`.
 */
export function importFromShare(shared: SharedData): RecipeImportParams | null {
  const url = webUrl(shared.url) ?? firstLinkIn(shared.text);
  if (url) {
    return { kind: 'url', url };
  }
  const text = shared.text?.trim();
  if (!text) {
    return null;
  }
  const title = shared.title?.trim();
  return {
    kind: 'text',
    text: title && !text.startsWith(title) ? `${title}\n\n${text}` : text,
  };
}
