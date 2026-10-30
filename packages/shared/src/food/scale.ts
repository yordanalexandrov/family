import { normalizeQuantity, type Unit } from './units.js';

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
 * An amount of a recipe written for `from` servings, scaled to `to` servings as the shopping list scales a meal
 * (kg → g and l → ml first, then × to/from, without float noise), and then read in the unit a cook reads it in:
 * 1000 g and more in kg, 1000 ml and more in l. A pinch keeps no quantity.
 */
export function scaleQuantity(
  amount: Amount,
  from: number,
  to: number,
): Amount {
  const { quantity, unit } = normalizeQuantity(amount.quantity, amount.unit);
  if (quantity === null) {
    return { quantity, unit };
  }
  const scaled = roundMilli((quantity * to) / from);
  const larger = LARGER[unit];
  if (larger && scaled >= larger.factor) {
    return { quantity: roundMilli(scaled / larger.factor), unit: larger.unit };
  }
  return { quantity: scaled, unit };
}

function roundMilli(value: number): number {
  return Math.round(value * 1000) / 1000;
}
