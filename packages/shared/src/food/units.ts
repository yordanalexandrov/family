import { z } from 'zod';

/** A unit of quantity (GLOSSARY: Единица). `pinch` is "по вкус" and never carries a quantity. */
export const unitSchema = z.enum([
  'g',
  'kg',
  'ml',
  'l',
  'pcs',
  'tbsp',
  'tsp',
  'pinch',
]);

export type Unit = z.infer<typeof unitSchema>;

/** The unit an ingredient is summed in on the shopping list (GLOSSARY: Основна единица). */
export const baseUnitSchema = z.enum(['g', 'ml', 'pcs']);

export type BaseUnit = z.infer<typeof baseUnitSchema>;

export const UNIT_LABELS_BG: Record<Unit, string> = {
  g: 'г',
  kg: 'кг',
  ml: 'мл',
  l: 'л',
  pcs: 'бр.',
  tbsp: 'с.л.',
  tsp: 'ч.л.',
  pinch: 'по вкус',
};

/** Units converted within their own measure; nothing else is converted (no spoons → grams). */
const CONVERSIONS: Partial<Record<Unit, { unit: Unit; factor: number }>> = {
  kg: { unit: 'g', factor: 1000 },
  l: { unit: 'ml', factor: 1000 },
};

/** kg → g and l → ml (×1000); every other unit, and a missing quantity, is returned unchanged. */
export function normalizeQuantity(
  quantity: number | null,
  unit: Unit,
): { quantity: number | null; unit: Unit } {
  const conversion = CONVERSIONS[unit];
  if (!conversion) {
    return { quantity, unit };
  }
  return {
    quantity:
      quantity === null ? null : roundMilli(quantity * conversion.factor),
    unit: conversion.unit,
  };
}

/** Drops binary floating-point noise (2.01 × 1000 = 2009.9999999999998) at a thousandth of the target unit. */
export function roundMilli(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** An amount in its unit; `null` when there is none (always for `pinch`, see {@link checkPinchQuantity}). */
export const quantitySchema = z.number().positive().nullable();

/** Object-level rule for a quantity next to its unit: a pinch ("по вкус") has no quantity. Use with `.superRefine(checkPinchQuantity)`. */
export function checkPinchQuantity(
  value: { quantity: number | null; unit: Unit },
  ctx: z.RefinementCtx,
): void {
  if (value.unit === 'pinch' && value.quantity !== null) {
    ctx.addIssue({
      code: 'custom',
      path: ['quantity'],
      message: 'A pinch has no quantity',
    });
  }
}
