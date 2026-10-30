import type { NormalizedStep, RecipeStep } from '@family/shared';
import type { DbExecutor } from '../db/client.js';
import { insertStepPhoto } from '../db/repositories/step-photos.js';
import { UnsupportedPhotoError } from './errors.js';
import { fetchImage, type StepImages } from './recipe-page/index.js';
import { stepPhotoJpeg } from './step-photos.js';

/**
 * How many photos of a page download and decode at the same time: at most this many downloads (10 MB each) are in
 * memory at once, the rest of a page's photos (at most `STEP_IMAGES_MAX`) only as the JPEGs made of them.
 */
const PARALLEL_DOWNLOADS = 4;

/**
 * The photos of a page's steps the agent chose (GLOSSARY: Снимка на стъпка), made ready to store: the JPEG by
 * reference, or `null` for one that did not download or is not a picture. A reference the page does not have is not
 * in it.
 */
export type PreparedStepPhotos = Map<string, Buffer | null>;

/**
 * Downloads each photo of `stepImages` that one of the agent's `steps` points at, once, by the rules of the page's own
 * fetch (`fetchImage`: public addresses only, 10 MB, 10 s), and makes it a JPEG as an upload is (`stepPhotoJpeg`), a
 * few at a time; `signal` aborts them with the run. Slow: never inside a transaction.
 */
export async function prepareStepPhotos(
  stepImages: StepImages,
  steps: readonly NormalizedStep[],
  signal: AbortSignal,
): Promise<PreparedStepPhotos> {
  const refs = [
    ...new Set(
      steps.flatMap((step) =>
        step.image !== null && Object.hasOwn(stepImages, step.image)
          ? [step.image]
          : [],
      ),
    ),
  ];
  const prepared: PreparedStepPhotos = new Map();
  for (let start = 0; start < refs.length; start += PARALLEL_DOWNLOADS) {
    await Promise.all(
      refs.slice(start, start + PARALLEL_DOWNLOADS).map(async (ref) => {
        const image = await fetchImage(stepImages[ref] as string, signal);
        prepared.set(ref, image.ok ? await jpegOrNull(image.bytes) : null);
      }),
    );
  }
  return prepared;
}

async function jpegOrNull(bytes: Buffer): Promise<Buffer | null> {
  try {
    return await stepPhotoJpeg(bytes);
  } catch (error) {
    if (error instanceof UnsupportedPhotoError) {
      return null;
    }
    throw error;
  }
}

/**
 * The agent's steps as a suggestion stores them, each with the photo it chose stored, once per photo even when it is
 * on several steps; and how many chosen photos were dropped, because they did not download or are not pictures. A
 * reference the page does not have leaves its step without a photo. Only inserts: the photos are ready already.
 */
export async function stepsWithPhotos(
  tx: DbExecutor,
  steps: readonly NormalizedStep[],
  prepared: PreparedStepPhotos | undefined,
): Promise<{ steps: RecipeStep[]; dropped: number }> {
  const stored = new Map<string, string | null>();
  for (const [ref, jpeg] of prepared ?? []) {
    stored.set(ref, jpeg ? await insertStepPhoto(tx, jpeg) : null);
  }
  return {
    steps: steps.map(({ text, image }) => {
      const photoId = image === null ? undefined : stored.get(image);
      return photoId ? { text, photoId } : { text };
    }),
    dropped: [...stored.values()].filter((id) => id === null).length,
  };
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
