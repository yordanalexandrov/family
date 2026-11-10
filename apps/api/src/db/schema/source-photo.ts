import { pgTable, uuid } from 'drizzle-orm/pg-core';
import { createdAt } from './columns.js';
import { bytea } from './step-photo.js';

/**
 * GLOSSARY: Източник на рецепта (ADR-0016). One photo of the source of an import, as the api wrote it: a JPEG, upright,
 * without EXIF, at most `SOURCE_PHOTO_MAX_SIDE` on the long side. Never changed. An import points at it from `photos`,
 * the recipe approved from it from `source_photos`, so there is no foreign key; a photo neither points at is an orphan,
 * removed at night once it is older than a day (`created_at`).
 */
export const sourcePhoto = pgTable('source_photo', {
  id: uuid('id').primaryKey().defaultRandom(),
  data: bytea('data').notNull(),
  createdAt: createdAt(),
});
