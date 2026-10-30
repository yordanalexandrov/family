import { z } from 'zod';

/** GLOSSARY: Снимка на стъпка. The api keeps every step photo at most this many pixels on the long side (ADR-0008). */
export const STEP_PHOTO_MAX_SIDE = 1600;

/** Largest step photo the api takes, after the client has made it smaller (as one photo of an import). */
export const STEP_PHOTO_MAX_BYTES = 10 * 1024 * 1024;

/** Narrowest thumbnail `?w=` may ask for; the widest is `STEP_PHOTO_MAX_SIDE`, and wider than the stored photo gives the photo as it is. */
export const STEP_PHOTO_MIN_WIDTH = 16;

/** `POST /api/step-photos` → `201`: the id a step points at (`RecipeStep.photoId`) from „Запази“ on. */
export const stepPhotoResponseSchema = z.object({
  photo: z.object({ id: z.uuid() }),
});

export type StepPhotoResponse = z.infer<typeof stepPhotoResponseSchema>;

/** `GET /api/step-photos/:id?w=<px>`: without `w` the stored photo, with it a thumbnail that wide, made on request. */
export const stepPhotoQuerySchema = z.object({
  w: z.coerce
    .number()
    .int()
    .min(STEP_PHOTO_MIN_WIDTH)
    .max(STEP_PHOTO_MAX_SIDE)
    .optional(),
});

export type StepPhotoQuery = z.infer<typeof stepPhotoQuerySchema>;

/** The address of a step photo for `<img src>`: the stored photo, or with `width` a thumbnail that many pixels wide. */
export function stepPhotoUrl(id: string, width?: number): string {
  return width === undefined
    ? `/api/step-photos/${id}`
    : `/api/step-photos/${id}?w=${width}`;
}
