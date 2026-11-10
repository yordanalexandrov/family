import { type RecipeStep, STEP_PHOTO_MAX_SIDE } from '@family/shared';
import type { DbExecutor } from '../db/client.js';
import {
  deleteOrphanStepPhotos,
  findStepPhotoData,
  insertStepPhoto,
} from '../db/repositories/step-photos.js';
import { foundJpegOfWidth, keptJpeg } from './photo-jpeg.js';
import { orphanPhotosBefore } from './photo-orphans.js';

/**
 * The cron's `step-photo-orphans` (`plugins/scheduler.ts`): at night in Sofia (`orphanPhotosBefore`) deletes every step
 * photo older than a day that no recipe and no proposed suggestion points at, and answers how many; by day it does
 * nothing and answers `null`. Running it again the same night deletes nothing more.
 */
export async function removeOrphanStepPhotos(
  db: DbExecutor,
  now: Date,
): Promise<number | null> {
  const before = orphanPhotosBefore(now);
  return before === null ? null : deleteOrphanStepPhotos(db, before);
}

/** The photos `steps` point at, each once, in the order of the steps. */
export function stepPhotoIds(steps: readonly RecipeStep[]): string[] {
  return [...new Set(steps.flatMap((step) => step.photoId ?? []))];
}

/**
 * GLOSSARY: Снимка на стъпка (ADR-0008). Stores a photo of a step uploaded by the recipe form and returns its id; the
 * photo is made ready by {@link stepPhotoJpeg} first.
 */
export async function storeStepPhoto(
  db: DbExecutor,
  bytes: Buffer,
): Promise<string> {
  return insertStepPhoto(db, await stepPhotoJpeg(bytes));
}

/**
 * A photo of a step from any source (the recipe form, a recipe page) as the api keeps it (`keptJpeg`): upright, without
 * EXIF, at most `STEP_PHOTO_MAX_SIDE` on the long side. Slow (decoding): never inside a transaction.
 */
export function stepPhotoJpeg(bytes: Buffer): Promise<Buffer> {
  return keptJpeg(bytes, STEP_PHOTO_MAX_SIDE);
}

/**
 * The stored photo, or with `width` a thumbnail that wide made now (never wider than the photo); an unknown id is a
 * `NotFoundError`. Always a JPEG.
 */
export async function stepPhotoImage(
  db: DbExecutor,
  id: string,
  width?: number,
): Promise<Buffer> {
  return foundJpegOfWidth(await findStepPhotoData(db, id), width);
}
