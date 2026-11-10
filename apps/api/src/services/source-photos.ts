import { SOURCE_PHOTO_MAX_SIDE } from '@family/shared';
import type { DbExecutor } from '../db/client.js';
import {
  deleteOrphanSourcePhotos,
  findSourcePhotosData,
} from '../db/repositories/source-photos.js';
import { NotFoundError } from './errors.js';
import { jpegOfWidth, keptJpeg } from './photo-jpeg.js';
import { orphanPhotosBefore } from './photo-orphans.js';

/**
 * The cron's `source-photo-orphans` (`plugins/scheduler.ts`): at night in Sofia (`orphanPhotosBefore`) deletes every
 * source photo older than a day that neither an import nor a recipe (archived ones too) points at, and answers how
 * many; by day it does nothing and answers `null`. A rejected import keeps its photos as long as it is stored.
 */
export async function removeOrphanSourcePhotos(
  db: DbExecutor,
  now: Date,
): Promise<number | null> {
  const before = orphanPhotosBefore(now);
  return before === null ? null : deleteOrphanSourcePhotos(db, before);
}

/**
 * GLOSSARY: Източник на рецепта (ADR-0016). A photo of the source of an import as the api keeps it (`keptJpeg`):
 * upright, without EXIF, at most `SOURCE_PHOTO_MAX_SIDE` on the long side, so the text of a screenshot stays readable.
 * Slow (decoding): never inside a transaction.
 */
export function sourcePhotoJpeg(bytes: Buffer): Promise<Buffer> {
  return keptJpeg(bytes, SOURCE_PHOTO_MAX_SIDE);
}

/**
 * The stored photo, or with `width` a thumbnail that wide made now (never wider than the photo); an unknown id is a
 * `NotFoundError`. Always a JPEG.
 */
export async function sourcePhotoImage(
  db: DbExecutor,
  id: string,
  width?: number,
): Promise<Buffer> {
  const [data] = await findSourcePhotosData(db, [id]);
  if (!data) {
    throw new NotFoundError('Няма такава снимка');
  }
  return jpegOfWidth(data, width);
}
