import {
  type OvenFan,
  type OvenRack,
  type Preparation,
  type PreparationKind,
  preparationLabel,
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

/** Надписът на реда във формата, и с непопълнени полета: „?° · с вентилатор“, „Празно · от вечерта“. */
export function preparationValuesLabel(item: PreparationItemValues): string {
  if (item.kind === 'oven') {
    return preparationLabel({
      kind: 'oven',
      degrees: item.degrees.trim() || '?',
      fan: item.fan,
      ...(item.rack === '' ? {} : { rack: item.rack }),
    });
  }
  return preparationLabel({
    // Видът не влиза в надписа; елемент без избран вид се надписва като другите без фурна.
    kind: item.kind ?? 'other',
    text: item.text.trim() || 'Празно',
    ...(item.minutesBefore === null
      ? {}
      : { minutesBefore: item.minutesBefore }),
  });
}

/**
 * Изборът „Колко преди“, в минути. Надписът е от `formatMinutesBefore`: всичко от `FROM_THE_EVENING_MINUTES` (8 ч) нагоре
 * е „от вечерта“, затова изборът има само една такава стойност — 720 (12 ч), с която и AI записва „от вечерта“ без часове.
 */
export const MINUTES_BEFORE_CHOICES = [15, 30, 60, 120, 240, 720] as const;
