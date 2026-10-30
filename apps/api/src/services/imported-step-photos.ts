import type { NormalizedStep, RecipeStep } from '@family/shared';
import type { DbExecutor } from '../db/client.js';
import { UnsupportedPhotoError } from './errors.js';
import { fetchImage, type StepImages } from './recipe-page/index.js';
import { storeStepPhoto } from './step-photos.js';

/** How many photos of a page download at the same time. */
const PARALLEL_DOWNLOADS = 4;

/**
 * The photos of a page's steps the agent chose (GLOSSARY: Снимка на стъпка), downloaded: the bytes by reference, or
 * `null` for one that did not download. A reference the page does not have is not in it.
 */
export type DownloadedStepPhotos = Map<string, Buffer | null>;

/**
 * Downloads each photo of `stepImages` that one of the agent's `steps` points at, once, by the rules of the page's own
 * fetch (`fetchImage`: public addresses only, 10 MB, 10 s), a few at a time; `signal` aborts them with the run.
 */
export async function downloadStepPhotos(
  stepImages: StepImages,
  steps: readonly NormalizedStep[],
  signal: AbortSignal,
): Promise<DownloadedStepPhotos> {
  const refs = [
    ...new Set(
      steps.flatMap((step) =>
        step.image !== null && Object.hasOwn(stepImages, step.image)
          ? [step.image]
          : [],
      ),
    ),
  ];
  const downloaded: DownloadedStepPhotos = new Map();
  for (let start = 0; start < refs.length; start += PARALLEL_DOWNLOADS) {
    await Promise.all(
      refs.slice(start, start + PARALLEL_DOWNLOADS).map(async (ref) => {
        const image = await fetchImage(stepImages[ref] as string, signal);
        downloaded.set(ref, image.ok ? image.bytes : null);
      }),
    );
  }
  return downloaded;
}

/**
 * The agent's steps as a suggestion stores them, each with the photo it chose stored like an upload
 * (`storeStepPhoto`), once per photo even when it is on several steps; and how many chosen photos were dropped, because
 * they did not download or are not pictures. A reference the page does not have leaves its step without a photo.
 */
export async function stepsWithPhotos(
  tx: DbExecutor,
  steps: readonly NormalizedStep[],
  downloaded: DownloadedStepPhotos | undefined,
): Promise<{ steps: RecipeStep[]; dropped: number }> {
  const stored = new Map<string, string | null>();
  for (const [ref, bytes] of downloaded ?? []) {
    stored.set(ref, bytes ? await storedOrNull(tx, bytes) : null);
  }
  return {
    steps: steps.map(({ text, image }) => {
      const photoId = image === null ? undefined : stored.get(image);
      return photoId ? { text, photoId } : { text };
    }),
    dropped: [...stored.values()].filter((id) => id === null).length,
  };
}

async function storedOrNull(
  tx: DbExecutor,
  bytes: Buffer,
): Promise<string | null> {
  try {
    return await storeStepPhoto(tx, bytes);
  } catch (error) {
    if (error instanceof UnsupportedPhotoError) {
      return null;
    }
    throw error;
  }
}

/** The agent's note, with how many photos of the steps were dropped at its end (in Bulgarian). */
export function withDroppedPhotos(
  assumptions: string,
  dropped: number,
): string {
  if (dropped === 0) {
    return assumptions;
  }
  const note =
    dropped === 1
      ? '1 снимка на стъпка не се свали.'
      : `${dropped} снимки на стъпки не се свалиха.`;
  return assumptions ? `${assumptions} ${note}` : note;
}
