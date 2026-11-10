import { and, inArray, lt, sql } from 'drizzle-orm';
import type { DbExecutor } from '../client.js';
import { sourcePhoto } from '../schema/source-photo.js';

/** Stores the photos of a source as they are (the service made them ready), one by one; returns their ids in order. */
export async function insertSourcePhotos(
  db: DbExecutor,
  photos: readonly Buffer[],
): Promise<string[]> {
  const ids: string[] = [];
  for (const data of photos) {
    const [row] = await db
      .insert(sourcePhoto)
      .values({ data })
      .returning({ id: sourcePhoto.id });
    if (!row) {
      throw new Error('insert into source_photo returned no row');
    }
    ids.push(row.id);
  }
  return ids;
}

/** The stored JPEGs of `ids`, in the order of `ids`; an id that is not stored is left out. */
export async function findSourcePhotosData(
  db: DbExecutor,
  ids: readonly string[],
): Promise<Buffer[]> {
  if (ids.length === 0) {
    return [];
  }
  const rows = await db
    .select({ id: sourcePhoto.id, data: sourcePhoto.data })
    .from(sourcePhoto)
    .where(inArray(sourcePhoto.id, [...ids]));
  const byId = new Map(rows.map((row) => [row.id, row.data]));
  return ids.flatMap((id) => byId.get(id) ?? []);
}

/**
 * Deletes every photo stored before `storedBefore` that neither a recipe (archived ones too) nor an import (rejected
 * ones too, as long as the import is in the database) points at. Answers how many it deleted.
 */
export async function deleteOrphanSourcePhotos(
  db: DbExecutor,
  storedBefore: Date,
): Promise<number> {
  const deleted = await db
    .delete(sourcePhoto)
    .where(
      and(
        lt(sourcePhoto.createdAt, storedBefore),
        sql`not exists (select 1 from recipe where ${sourcePhoto.id} = any(recipe.source_photos))`,
        sql`not exists (
          select 1 from recipe_import_request where ${sourcePhoto.id} = any(recipe_import_request.photos)
        )`,
      ),
    )
    .returning({ id: sourcePhoto.id });
  return deleted.length;
}
