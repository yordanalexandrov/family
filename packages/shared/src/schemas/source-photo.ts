import { z } from 'zod';
import { STEP_PHOTO_MIN_WIDTH } from './step-photo.js';

/**
 * GLOSSARY: Източник на рецепта (ADR-0016). The api keeps every photo of a source at most this many pixels on the long
 * side: more than a step photo, so the text of a part of a long screenshot stays readable.
 */
export const SOURCE_PHOTO_MAX_SIDE = 2000;

/** `GET /api/source-photos/:id?w=<px>`: without `w` the stored photo, with it a thumbnail that wide, made on request. */
export const sourcePhotoQuerySchema = z.object({
  w: z.coerce
    .number()
    .int()
    .min(STEP_PHOTO_MIN_WIDTH)
    .max(SOURCE_PHOTO_MAX_SIDE)
    .optional(),
});

export type SourcePhotoQuery = z.infer<typeof sourcePhotoQuerySchema>;

/** The address of a source photo for `<img src>`: the stored photo, or with `width` a thumbnail that many pixels wide. */
export function sourcePhotoUrl(id: string, width?: number): string {
  return width === undefined
    ? `/api/source-photos/${id}`
    : `/api/source-photos/${id}?w=${width}`;
}
