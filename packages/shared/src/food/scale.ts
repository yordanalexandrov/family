import { normalizeQuantity, roundMilli, type Unit } from './units.js';

/** An amount in its unit; `null` quantity for a pinch ("по вкус"). */
export interface Amount {
  quantity: number | null;
  unit: Unit;
}

/** From this much of the small unit an amount reads in the large one: 1500 g → 1,5 kg. */
const LARGER: Partial<Record<Unit, { unit: Unit; factor: number }>> = {
  g: { unit: 'kg', factor: 1000 },
  ml: { unit: 'l', factor: 1000 },
};

/**
 * An amount of a recipe written for `from` servings, scaled to `to` servings in the small unit (kg → g and l → ml
 * first, then × to/from), unrounded so a sum of them carries no rounding: the shopping list adds these up per meal and
 * per week. A pinch keeps no quantity.
 */
export function scaleToServings(
  amount: Amount,
  from: number,
  to: number,
): Amount {
  const { quantity, unit } = normalizeQuantity(amount.quantity, amount.unit);
  return { quantity: quantity === null ? null : quantity * (to / from), unit };
}

/**
 * One amount scaled as {@link scaleToServings}, without float noise, and read in the unit a cook reads it in:
 * 1000 g and more in kg, 1000 ml and more in l. A pinch keeps no quantity.
 */
export function scaleQuantity(
  amount: Amount,
  from: number,
  to: number,
): Amount {
  const { quantity, unit } = scaleToServings(amount, from, to);
  if (quantity === null) {
    return { quantity, unit };
  }
  const scaled = roundMilli(quantity);
  const larger = LARGER[unit];
  if (larger && scaled >= larger.factor) {
    return { quantity: roundMilli(scaled / larger.factor), unit: larger.unit };
  }
  return { quantity: scaled, unit };
}
