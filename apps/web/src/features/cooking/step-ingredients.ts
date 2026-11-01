/**
 * Продуктите на стъпката (GLOSSARY): кои редове продукти назовава текстът на стъпка. Връзката не е в рецептата, а се
 * разпознава тук, на екрана, от показания текст, както времената за таймерите (`findStepTimes`).
 */

/**
 * Буква преди или след думата значи друга дума („лук“ в „Пролука“); цифра е граница („2яйца“). По образеца на
 * `NOT_WORD` във `features/timers/step-times.ts`, но там и цифрата е част от числото.
 */
const NOT_WORD_BEFORE = String.raw`(?<!\p{L})`;
const NOT_WORD_AFTER = String.raw`(?!\p{L})`;

/** Гласните, които падат пред окончанието („яйце“ → „яйцата“, „чушка“ → „чушките“). */
const FINAL_VOWEL = /[аяоеиъ]$/u;

/** Окончанията за членуване и множествено число (и на прилагателно: „черния“) след основата. */
const ENDINGS = [
  '',
  'а',
  'я',
  'о',
  'е',
  'и',
  'ът',
  'ят',
  'та',
  'то',
  'те',
  'ите',
  'ата',
  'ята',
  'ето',
  'ото',
  'ове',
  'овете',
  'ия',
  'ият',
].join('|');

/** Окончанията, които започват с гласна: само те следват основа с изпаднала гласна („черн-ия“, не „черн-та“). */
const VOWEL_ENDINGS = ENDINGS.split('|')
  .filter((ending) => /^[аяоеи]/u.test(ending))
  .join('|');

/** Изпадащо „е“ или „ъ“ пред последната съгласна („черен“ → „черния“, „пресен“ → „пресните“). */
const FLEETING_VOWEL = /[еъ](?=[бвгджзклмнпрстфхцчшщ]$)/u;

/**
 * Една дума от името във всичките ѝ форми: основата („домат“, „яйц“) с окончание. Думите са само букви, затова в
 * шаблона няма какво да се екранира.
 */
function wordPattern(word: string): string {
  const stem = word.replace(FINAL_VOWEL, '');
  // Без основа (дума от една гласна) се приема само самата дума.
  if (stem.length === 0) {
    return word;
  }
  const short = stem.replace(FLEETING_VOWEL, '');
  return short === stem || short.length < 3
    ? `${stem}(?:${ENDINGS})`
    : `(?:${stem}(?:${ENDINGS})|${short}(?:${VOWEL_ENDINGS}))`;
}

/** Думите на името, малки букви; цифри и знаци не са думи. */
function words(name: string): string[] {
  return name.toLocaleLowerCase('bg').match(/\p{L}+/gu) ?? [];
}

/** Краищата на всички места, където `wordsOfName` стоят една след друга в текста (във всякаква форма). */
function occurrences(text: string, wordsOfName: readonly string[]): number[] {
  const pattern = new RegExp(
    `${NOT_WORD_BEFORE}${wordsOfName.map(wordPattern).join(String.raw`\s+`)}${NOT_WORD_AFTER}`,
    'giu',
  );
  return [...text.matchAll(pattern)].map(
    (match) => match.index + match[0].length,
  );
}

/**
 * Индексите (в `names`) на редовете, които текстът на стъпката назовава, по реда им. Всяко име се търси по
 * последната си дума в каквато и да е членувана или множествена форма („пилешко филе“ ← „филето“). Когато няколко
 * реда имат една последна дума („черен пипер“, „червен пипер“), на всяко място в текста печели редът с най-дълго
 * пълно име там; без пълно име („пипер“) се подчертават всички.
 */
export function findStepIngredients(
  text: string,
  names: readonly string[],
): number[] {
  const lines = names.map((name, index) => ({ index, words: words(name) }));
  const found = new Set<number>();
  const byLast = new Map<string, typeof lines>();
  for (const line of lines) {
    const last = line.words.at(-1);
    if (last !== undefined) {
      byLast.set(last, [...(byLast.get(last) ?? []), line]);
    }
  }
  for (const [last, group] of byLast) {
    // Където в текста свършва пълното име на всеки ред от групата.
    const full = group.map((line) => ({
      line,
      ends: new Set(occurrences(text, line.words)),
    }));
    for (const end of occurrences(text, [last])) {
      const here = full.filter(({ ends }) => ends.has(end));
      const longest = Math.max(0, ...here.map(({ line }) => line.words.length));
      const winners =
        here.length === 0
          ? group
          : here
              .filter(({ line }) => line.words.length === longest)
              .map(({ line }) => line);
      for (const line of winners) {
        found.add(line.index);
      }
    }
  }
  return [...found].sort((a, b) => a - b);
}
