/**
 * Времената в текста на стъпка („пържи 15 мин до златисто“), от които Готвене предлага таймер. Стъпките са свободен
 * текст, затова разпознаването е тук, на екрана, а не в AI контрактите.
 */
export interface StepTime {
  /** Откъде докъде в текста е времето (`text.slice(start, end)`); бутонът стои на това място. */
  start: number;
  end: number;
  /** Надписът на таймера: времето, както е в текста, с „–“ за интервал („10–15 мин“). */
  label: string;
  /** До колко брои таймерът; за интервал — долната граница. */
  seconds: number;
  /** Горната граница на интервал („10–15 мин“ → 900); без интервал я няма. */
  maxSeconds?: number;
}

/** Над толкова (една нощ, „24 часа марината“) таймер не се предлага. */
const MAX_SECONDS = 12 * 60 * 60;

const NUMBER = String.raw`\d+(?:[.,]\d+)?`;

/** Единиците от най-дългото изписване към най-късото, за да не спре „мин“ преди „минути“. */
const UNITS: readonly { spellings: readonly string[]; seconds: number }[] = [
  { spellings: ['часове', 'часа', 'час', 'ч'], seconds: 3600 },
  { spellings: ['минути', 'минута', 'мин'], seconds: 60 },
  { spellings: ['секунди', 'секунда', 'сек'], seconds: 1 },
];

/**
 * Буква или цифра след единицата значи друга дума („мин“ в „минерална“, „ч“ в „чаши“), а буква с точка след
 * точката — съкращение („ч.л.“, „ч. л.“: чаена лъжица).
 */
const NOT_WORD = String.raw`(?![\p{L}\d])(?!\.\s?\p{L}\.)`;

/**
 * Едно количество: число или интервал от две числа с единица, или „половин час“. Отпред не стои буква, цифра,
 * запетая или точка, за да не се хване краят на друго число или дума.
 */
const QUANTITY = new RegExp(
  String.raw`(?<![\p{L}\d.,])(?:(?<half>половин\s+час)${NOT_WORD}|(?<from>${NUMBER})(?:\s*[–—-]\s*(?<to>${NUMBER}))?\s*(?<unit>${UNITS.flatMap((unit) => unit.spellings).join('|')})${NOT_WORD})`,
  'giu',
);

/** Между частите на едно време („1 ч и 30 мин“, „1 ч. 30 мин“): интервал, по желание точка и „и“. */
const JOINER = /^\.?\s+(?:и\s+)?$/u;

interface Quantity {
  start: number;
  end: number;
  seconds: number;
  maxSeconds?: number;
  /** Секундите на единицата; съчетанието върви от по-голяма към по-малка. */
  unit: number;
}

function toNumber(raw: string): number {
  return Number(raw.replace(',', '.'));
}

function unitSeconds(spelling: string): number {
  const lower = spelling.toLowerCase();
  return UNITS.find((unit) => unit.spellings.includes(lower))?.seconds ?? 0;
}

function quantities(text: string): Quantity[] {
  return [...text.matchAll(QUANTITY)].map((match) => {
    const start = match.index;
    const end = start + match[0].length;
    const { half, from = '', to, unit = '' } = match.groups ?? {};
    if (half) {
      return { start, end, seconds: 1800, unit: 3600 };
    }
    const size = unitSeconds(unit);
    const seconds = Math.round(toNumber(from) * size);
    return to === undefined
      ? { start, end, seconds, unit: size }
      : {
          start,
          end,
          seconds,
          maxSeconds: Math.round(toNumber(to) * size),
          unit: size,
        };
  });
}

/** Съседни части с по-малка единица и без интервал („1 ч и 30 мин“) стават едно време. */
function combine(text: string, parts: Quantity[]): Quantity[] {
  const result: Quantity[] = [];
  for (const part of parts) {
    const previous = result.at(-1);
    if (
      previous &&
      previous.maxSeconds === undefined &&
      part.maxSeconds === undefined &&
      part.unit < previous.unit &&
      JOINER.test(text.slice(previous.end, part.start))
    ) {
      result[result.length - 1] = {
        ...previous,
        end: part.end,
        seconds: previous.seconds + part.seconds,
        unit: part.unit,
      };
    } else {
      result.push(part);
    }
  }
  return result;
}

/** Всички времена в текста на стъпка, по реда им; без време — празен списък. */
export function findStepTimes(text: string): StepTime[] {
  return combine(text, quantities(text))
    .filter(
      (time) =>
        time.seconds > 0 && (time.maxSeconds ?? time.seconds) <= MAX_SECONDS,
    )
    .map(({ start, end, seconds, maxSeconds }) => ({
      start,
      end,
      label: text
        .slice(start, end)
        .replace(/\s*[–—-]\s*(?=\d)/u, '–')
        .replace(/\s+/gu, ' '),
      seconds,
      ...(maxSeconds === undefined ? {} : { maxSeconds }),
    }));
}
