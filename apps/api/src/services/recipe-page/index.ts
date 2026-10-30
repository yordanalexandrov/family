import { extractRecipe, type StepImages } from './extract.js';
import { type FetchReason, fetchPage, type PageFetchFailure } from './fetch.js';

export type { StepImages } from './extract.js';
export { type FetchedImage, fetchImage } from './fetch.js';

/**
 * A recipe page as the agent gets it: the final URL and the JSON-LD Recipe (its step photos as references, their URLs
 * in `stepImages`) or the main text; or why it could not be read (`failure` for the request, `reason` for logs and the
 * smoke).
 */
export type RecipePage =
  | {
      ok: true;
      url: string;
      jsonLd?: Record<string, unknown>;
      stepImages?: StepImages;
      text?: string;
    }
  | {
      ok: false;
      url: string;
      failure: PageFetchFailure;
      reason: FetchReason | 'empty_page';
    };

/** Fetches the page of an import by link and extracts its recipe (`fetch.ts`, then `extract.ts`). Never throws. */
export async function readRecipePage(url: string): Promise<RecipePage> {
  const page = await fetchPage(url);
  if (!page.ok) {
    return page;
  }
  const recipe = extractRecipe(page.html, page.url);
  if (recipe.jsonLd) {
    return {
      ok: true,
      url: page.url,
      jsonLd: recipe.jsonLd,
      stepImages: recipe.stepImages,
    };
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
