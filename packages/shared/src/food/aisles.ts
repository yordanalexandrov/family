import { z } from 'zod';

/**
 * Store aisles (GLOSSARY: Щанд) in walking order. Keys and labels come from the seed research
 * (docs/research/seed-ingredients.md); `apps/api/src/db/seed/ingredients.json` must use the same list.
 */
export const AISLES = [
  { key: 'produce', labelBg: 'Плод и зеленчук', order: 1 },
  { key: 'bakery', labelBg: 'Хляб и тестени', order: 2 },
  { key: 'meat', labelBg: 'Месо и колбаси', order: 3 },
  { key: 'fish', labelBg: 'Риба и морски дарове', order: 4 },
  { key: 'dairy', labelBg: 'Млечни и яйца', order: 5 },
  { key: 'grains', labelBg: 'Зърнени, варива и паста', order: 6 },
  { key: 'canned', labelBg: 'Консерви и буркани', order: 7 },
  { key: 'spices', labelBg: 'Подправки, сосове и бакалия', order: 8 },
  { key: 'frozen', labelBg: 'Замразени', order: 9 },
  { key: 'drinks', labelBg: 'Напитки', order: 10 },
  { key: 'other', labelBg: 'Друго', order: 11 },
] as const satisfies readonly { key: string; labelBg: string; order: number }[];

export type Aisle = (typeof AISLES)[number]['key'];

export const aisleSchema = z.enum(
  AISLES.map((aisle) => aisle.key) as [Aisle, ...Aisle[]],
);
