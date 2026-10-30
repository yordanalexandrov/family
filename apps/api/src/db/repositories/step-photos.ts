import { and, eq, inArray, lt, sql } from 'drizzle-orm';
import type { DbExecutor } from '../client.js';
import { stepPhoto } from '../schema/step-photo.js';

/** Stores a photo as it is (the service made it ready); returns its id. */
export async function insertStepPhoto(
  db: DbExecutor,
  data: Buffer,
): Promise<string> {
  const [row] = await db
    .insert(stepPhoto)
    .values({ data })
    .returning({ id: stepPhoto.id });
  if (!row) {
    throw new Error('insert into step_photo returned no row');
  }
  return row.id;
}

/** The stored JPEG of a photo, or `undefined` for an unknown id. */
export async function findStepPhotoData(
  db: DbExecutor,
  id: string,
): Promise<Buffer | undefined> {
  const [row] = await db
    .select({ data: stepPhoto.data })
    .from(stepPhoto)
    .where(eq(stepPhoto.id, id))
    .limit(1);
  return row?.data;
}

/** Which of `ids` are stored photos. */
export async function existingStepPhotoIds(
  db: DbExecutor,
  ids: string[],
): Promise<Set<string>> {
  if (ids.length === 0) {
    return new Set();
  }
  const rows = await db
    .select({ id: stepPhoto.id })
    .from(stepPhoto)
    .where(inArray(stepPhoto.id, ids));
  return new Set(rows.map((row) => row.id));
}

/**
 * Deletes every photo uploaded before `uploadedBefore` that no step points at: neither of a recipe (archived ones too)
 * nor of a proposed suggestion's payload. Answers how many it deleted.
 */
export async function deleteOrphanStepPhotos(
  db: DbExecutor,
  uploadedBefore: Date,
): Promise<number> {
  const used = sql`(
    select (s->>'photoId')::uuid from recipe, jsonb_array_elements(recipe.steps) s
      where s ? 'photoId'
    union
    select (s->>'photoId')::uuid from recipe_suggestion, jsonb_array_elements(recipe_suggestion.payload->'steps') s
      where recipe_suggestion.status = 'proposed' and s ? 'photoId'
  )`;
  const deleted = await db
    .delete(stepPhoto)
    .where(
      and(
        lt(stepPhoto.createdAt, uploadedBefore),
        sql`${stepPhoto.id} not in ${used}`,
      ),
    )
    .returning({ id: stepPhoto.id });
  return deleted.length;
}
