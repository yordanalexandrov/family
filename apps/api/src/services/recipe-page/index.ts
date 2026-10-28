import { extractRecipe } from './extract.js';
import { fetchPage, type PageFetchFailure } from './fetch.js';

/**
 * A recipe page as the agent gets it: the final URL and the JSON-LD Recipe or the main text; or why it could not be
 * read (`failure` for the request, `reason` for logs and the smoke).
 */
export type RecipePage =
  | {
      ok: true;
      url: string;
      jsonLd?: Record<string, unknown>;
      text?: string;
    }
  | { ok: false; url: string; failure: PageFetchFailure; reason: string };

/** Fetches the page of an import by link and extracts its recipe (`fetch.ts`, then `extract.ts`). Never throws. */
export async function readRecipePage(url: string): Promise<RecipePage> {
  const page = await fetchPage(url);
  if (!page.ok) {
    return page;
  }
  const recipe = extractRecipe(page.html);
  if (recipe.jsonLd) {
    return { ok: true, url: page.url, jsonLd: recipe.jsonLd };
  }
  if (recipe.text.trim() === '') {
    return {
      ok: false,
      url: page.url,
      failure: 'fetch_failed',
      reason: 'empty_page',
    };
  }
  return { ok: true, url: page.url, text: recipe.text };
}
