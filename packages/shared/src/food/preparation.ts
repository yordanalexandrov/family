import { z } from 'zod';

/**
 * The kinds of a preparation item (GLOSSARY: Подготовка), in the order a form offers them, each with its icon and its
 * name. A fixed list: web shows the icon and the name, the AI contracts name the kind by its key.
 */
export const PREPARATION_KINDS = [
  { key: 'oven', labelBg: 'Фурна', icon: '🔥' },
  { key: 'fridge', labelBg: 'Извади от хладилника', icon: '🧊' },
  { key: 'soak', labelBg: 'Накисни', icon: '💧' },
  { key: 'marinate', labelBg: 'Мариновай', icon: '🧂' },
  { key: 'boil', labelBg: 'Вода да заври', icon: '♨️' },
  { key: 'pan', labelBg: 'Тава или форма', icon: '🥘' },
  { key: 'rest', labelBg: 'Почивка или втасване', icon: '⏳' },
  { key: 'other', labelBg: 'Друго', icon: '📝' },
] as const satisfies readonly { key: string; labelBg: string; icon: string }[];

export type PreparationKind = (typeof PREPARATION_KINDS)[number]['key'];

export const preparationKindSchema = z.enum(
  PREPARATION_KINDS.map((kind) => kind.key) as [
    PreparationKind,
    ...PreparationKind[],
  ],
);

/** The kind's icon and Bulgarian name. */
export function preparationKind(kind: PreparationKind): {
  labelBg: string;
  icon: string;
} {
  const found = PREPARATION_KINDS.find((item) => item.key === kind);
  if (!found) {
    throw new Error(`unknown preparation kind: ${kind}`);
  }
  return found;
}

/** `fan` — с вентилатор; `conventional` — горен и долен реотан, без вентилатор. */
export const ovenFanSchema = z.enum(['fan', 'conventional']);

export type OvenFan = z.infer<typeof ovenFanSchema>;

export const OVEN_FAN_LABELS_BG: Record<OvenFan, string> = {
  fan: 'с вентилатор',
  conventional: 'без вентилатор',
};

/** The rack level in the oven. */
export const ovenRackSchema = z.enum(['low', 'middle', 'high']);

export type OvenRack = z.infer<typeof ovenRackSchema>;

export const OVEN_RACK_LABELS_BG: Record<OvenRack, string> = {
  low: 'долна скара',
  middle: 'средна скара',
  high: 'горна скара',
};

export const PREPARATION_MAX = 8;
export const OVEN_DEGREES_MIN = 30;
export const OVEN_DEGREES_MAX = 300;
export const PREPARATION_TEXT_MAX = 60;
/** Two days. */
export const MINUTES_BEFORE_MAX = 2880;
/** From 8 hours before cooking on, the time reads „от вечерта“. */
export const FROM_THE_EVENING_MINUTES = 8 * 60;

const OTHER_KINDS = preparationKindSchema.exclude(['oven']);

/** Preheating the oven: only the first temperature of the recipe; a later change stays in the text of its step. */
export const ovenPreparationSchema = z.object({
  kind: z.literal('oven'),
  degrees: z.int().min(OVEN_DEGREES_MIN).max(OVEN_DEGREES_MAX),
  fan: ovenFanSchema,
  rack: ovenRackSchema.optional(),
});

export type OvenPreparation = z.infer<typeof ovenPreparationSchema>;

/** Any other kind: what to do and, optionally, how many minutes before cooking. */
export const textPreparationSchema = z.object({
  kind: OTHER_KINDS,
  text: z.string().trim().min(1).max(PREPARATION_TEXT_MAX),
  minutesBefore: z.int().min(1).max(MINUTES_BEFORE_MAX).optional(),
});

export type TextPreparation = z.infer<typeof textPreparationSchema>;

/** One item of a recipe's preparation. */
export const preparationItemSchema = z.discriminatedUnion('kind', [
  ovenPreparationSchema,
  textPreparationSchema,
]);

export type PreparationItem = z.infer<typeof preparationItemSchema>;

/** Marks the issue of a second oven among the issues of the item's `kind`. */
const SECOND_OVEN = 'secondOven';

/** The issue {@link preparationSchema} gives a second oven (on its `kind`), not any other problem of the kind. */
export function isSecondOvenIssue(issue: z.core.$ZodIssue): boolean {
  return issue.code === 'custom' && issue.params?.[SECOND_OVEN] === true;
}

/**
 * GLOSSARY: Подготовка. The ordered things to do before the first step (or alongside it): 0–8 items, at most one oven.
 * The steps stay as they are; the preparation does not replace them.
 */
export const preparationSchema = z
  .array(preparationItemSchema)
  .max(PREPARATION_MAX)
  .superRefine((items, ctx) => {
    let ovens = 0;
    items.forEach((item, index) => {
      if (item.kind === 'oven' && ++ovens === 2) {
        ctx.addIssue({
          code: 'custom',
          message: 'at most one oven',
          path: [index, 'kind'],
          params: { [SECOND_OVEN]: true },
        });
      }
    });
  });

export type Preparation = z.infer<typeof preparationSchema>;

/** „30 мин преди“, „2 ч преди“, „1 ч 30 мин преди“; from 8 hours on „от вечерта“. */
export function formatMinutesBefore(minutes: number): string {
  if (minutes >= FROM_THE_EVENING_MINUTES) {
    return 'от вечерта';
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const parts = [
    ...(hours > 0 ? [`${hours} ч`] : []),
    ...(rest > 0 || hours === 0 ? [`${rest} мин`] : []),
  ];
  return `${parts.join(' ')} преди`;
}

/**
 * An item as {@link preparationLabel} reads it: a {@link PreparationItem}, or one still being filled in a form, whose
 * degrees may be text (a placeholder for an empty field).
 */
export type PreparationLabelItem =
  | PreparationItem
  | (Omit<OvenPreparation, 'degrees'> & { degrees: number | string });

/** The short label of an item, without its icon: „200° · с вентилатор · средна скара“, „накисни боба · от вечерта“. */
export function preparationLabel(item: PreparationLabelItem): string {
  if (item.kind === 'oven') {
    return [
      `${item.degrees}°`,
      OVEN_FAN_LABELS_BG[item.fan],
      ...(item.rack ? [OVEN_RACK_LABELS_BG[item.rack]] : []),
    ].join(' · ');
  }
  return [
    item.text,
    ...(item.minutesBefore === undefined
      ? []
      : [formatMinutesBefore(item.minutesBefore)]),
  ].join(' · ');
}
