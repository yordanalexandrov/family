import {
  formatMinutesBefore,
  OVEN_FAN_LABELS_BG,
  OVEN_RACK_LABELS_BG,
  type OvenFan,
  type OvenRack,
  type Preparation,
  type PreparationKind,
} from '@family/shared';

/**
 * Един елемент от подготовката във формата, като в полетата. Полетата на двата вида живеят заедно, за да не се губи
 * текстът при смяна между видове без фурна (и градусите при връщане към фурната); пращат се само тези на вида.
 * `kind: null` е току-що добавен елемент, чийто вид още не е избран.
 */
export interface PreparationItemValues {
  kind: PreparationKind | null;
  degrees: string;
  fan: OvenFan;
  /** `''` — нивото не е важно. */
  rack: OvenRack | '';
  text: string;
  /** Минути преди готвенето от избора; `null` — не е важно. */
  minutesBefore: number | null;
}

export function emptyPreparationItem(): PreparationItemValues {
  return {
    kind: null,
    degrees: '',
    fan: 'fan',
    rack: '',
    text: '',
    minutesBefore: null,
  };
}

/** Подготовката на рецепта (или на предложение) като стойности на формата. */
export function preparationToValues(
  preparation: Preparation,
): PreparationItemValues[] {
  return preparation.map((item) =>
    item.kind === 'oven'
      ? {
          ...emptyPreparationItem(),
          kind: 'oven',
          degrees: String(item.degrees),
          fan: item.fan,
          rack: item.rack ?? '',
        }
      : {
          ...emptyPreparationItem(),
          kind: item.kind,
          text: item.text,
          minutesBefore: item.minutesBefore ?? null,
        },
  );
}

/** Цяло число от поле; празно или нечисло е `NaN` и schema-та го спира. */
function parseDegrees(text: string): number {
  const trimmed = text.trim();
  return trimmed === '' ? Number.NaN : Number(trimmed);
}

/**
 * Стойностите → кандидат за `preparationSchema` (проверява го schema-та на рецептата). Елемент без вид се изпуска:
 * листът го маха, когато се затвори.
 */
export function valuesToPreparation(items: readonly PreparationItemValues[]) {
  return items.flatMap((item): object[] => {
    if (item.kind === null) {
      return [];
    }
    if (item.kind === 'oven') {
      return [
        {
          kind: item.kind,
          degrees: parseDegrees(item.degrees),
          fan: item.fan,
          ...(item.rack === '' ? {} : { rack: item.rack }),
        },
      ];
    }
    return [
      {
        kind: item.kind,
        text: item.text,
        ...(item.minutesBefore === null
          ? {}
          : { minutesBefore: item.minutesBefore }),
      },
    ];
  });
}

/** Надписът на реда във формата, и с непопълнени полета: „200° · с вентилатор“, „накисни боба · от вечерта“. */
export function preparationValuesLabel(item: PreparationItemValues): string {
  if (item.kind === 'oven') {
    return [
      `${item.degrees.trim() || '?'}°`,
      OVEN_FAN_LABELS_BG[item.fan],
      ...(item.rack === '' ? [] : [OVEN_RACK_LABELS_BG[item.rack]]),
    ].join(' · ');
  }
  return [
    item.text.trim() || 'Празно',
    ...(item.minutesBefore === null
      ? []
      : [formatMinutesBefore(item.minutesBefore)]),
  ].join(' · ');
}

/** Изборът „Колко преди“: минути с надписа си; 720 е „от вечерта“. */
export const MINUTES_BEFORE_CHOICES = [15, 30, 60, 120, 240, 720] as const;
