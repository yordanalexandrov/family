/** Съкращенията след число и как се казват: за 1 и за всичко друго. */
const UNITS: Record<string, readonly [one: string, many: string]> = {
  мин: ['минута', 'минути'],
  ч: ['час', 'часа'],
  г: ['грам', 'грама'],
  гр: ['грам', 'грама'],
};

/**
 * Число, после съкращение и точката му. Точката се маха, освен когато е краят на изречението (край на текста или
 * главна буква след нея). Съкращение, след което идва буква или „.буква“ („1 ч.л.“), не е мярка и остава.
 */
const UNIT =
  /(\d+(?:[.,]\d+)?)\s*(мин|гр|ч|г)(?:\.(?!\s*(?:$|\p{Lu})))?(?!\p{L}|\.\p{L})/gu;

/** Число и „°C“ (с латинско или кирилско „С“). */
const DEGREES = /(\d+(?:[.,]\d+)?)\s*°\s*[CС](?!\p{L})/gu;

function counted(number: string, [one, many]: readonly [string, string]) {
  return `${number} ${number === '1' ? one : many}`;
}

/**
 * Текстът, както се казва на глас (GLOSSARY: Четене на глас): съкращенията след число се разгъват — „15 мин“ →
 * „15 минути“, „2 ч“ → „2 часа“, „200 г“ → „200 грама“, „180°C“ → „180 градуса“ (за 1 — в единствено число).
 * Останалият текст не се пипа.
 */
export function spokenText(text: string): string {
  return text
    .replace(DEGREES, (_, number: string) =>
      counted(number, ['градус', 'градуса']),
    )
    .replace(UNIT, (_, number: string, unit: string) =>
      counted(number, UNITS[unit] ?? [unit, unit]),
    );
}
