import { z } from 'zod';

/** A meal of the day (GLOSSARY: Слот); every slot is also a tag. */
export const slotSchema = z.enum(['breakfast', 'lunch', 'dinner']);

export type Slot = z.infer<typeof slotSchema>;

/** A recipe tag from the fixed list (GLOSSARY: Таг); no free-form tags. */
export const tagSchema = z.enum([
  ...slotSchema.options,
  'quick',
  'batch',
  'kid_friendly',
]);

export type Tag = z.infer<typeof tagSchema>;

export const TAG_LABELS_BG: Record<Tag, string> = {
  breakfast: 'закуска',
  lunch: 'обяд',
  dinner: 'вечеря',
  quick: 'бързо',
  batch: 'за готвене в количество',
  kid_friendly: 'подходящо за дете',
};
