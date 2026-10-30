import { customType, pgTable, uuid } from 'drizzle-orm/pg-core';
import { createdAt } from './columns.js';

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => 'bytea',
});

/**
 * GLOSSARY: Снимка на стъпка (ADR-0008). The photo itself, as the api wrote it: a JPEG, upright, without EXIF, at most
 * `STEP_PHOTO_MAX_SIDE` on the long side. Never changed: another photo is another row. A step points at it from the
 * `steps` JSON of a recipe or of a suggestion's payload (`photoId`), so there is no foreign key; a photo nobody points
 * at is an orphan, removed at night, but only once it is older than an edit could take (`created_at`).
 */
export const stepPhoto = pgTable('step_photo', {
  id: uuid('id').primaryKey().defaultRandom(),
  data: bytea('data').notNull(),
  createdAt: createdAt(),
});
