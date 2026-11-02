import {
  applyCookingChanges,
  applyStepChanges,
  type CookingChange,
  type CookingLine,
  type Recipe,
  recipeCookingLines,
  withoutCookingChange,
} from '@family/shared';
import { type AppliedChange, useAppliedChanges } from './cooking-memory';

/** Индексите на редовете, които не са същите в `after` (сменени, махнати, добавени или изчезнали). */
function differing(
  before: readonly CookingLine[],
  after: readonly CookingLine[],
): number[] {
  const length = Math.max(before.length, after.length);
  return Array.from({ length }, (_, index) => index).filter(
    (index) => JSON.stringify(before[index]) !== JSON.stringify(after[index]),
  );
}

/**
 * Промените за готвенето на рецептата (GLOSSARY: Промяна за готвенето), приложени на това устройство: продуктите с
 * тях (`lines`), стъпките с новия им текст (`steps`, толкова, колкото са в рецептата), прилагането („Промени“) и
 * връщането („Върни“, с по-късните промени, които зависят от нея). Последната приложена промяна по ред печели. Редът,
 * който прилагането или връщането сменя, губи отметката си (`onLinesChanged`). Рецептата, менюто и списъкът за
 * пазаруване не се пипат.
 */
export function useCookingChanges(
  recipe: Recipe,
  onLinesChanged: (indices: number[]) => void,
) {
  const { changes: appliedChanges, update } = useAppliedChanges(recipe.id);
  const base = recipeCookingLines(recipe);
  const linesOf = (changes: readonly AppliedChange[]) =>
    applyCookingChanges(base, changes);
  const lines = linesOf(appliedChanges);
  const change = (
    next: (current: readonly AppliedChange[]) => readonly AppliedChange[],
  ) => {
    const after = next(appliedChanges);
    update(next);
    onLinesChanged(differing(lines, linesOf(after)));
  };
  return {
    lines,
    steps: applyStepChanges(recipe.steps, appliedChanges),
    /** `applied` на поправка и на въпрос: id-тата на въпросите с приложени промени, по реда на прилагане. */
    applied: appliedChanges.map(({ id }) => id),
    isApplied: (id: string) => appliedChanges.some((other) => other.id === id),
    /** Редовете, към които сочи промяната на въпроса `id`: без нея самата, както при въпроса. */
    linesBefore: (id: string) =>
      linesOf(appliedChanges.filter((other) => other.id !== id)),
    apply(question: { id: string; servings: number; change: CookingChange }) {
      const { id, servings } = question;
      change((current) => [
        ...current.filter((other) => other.id !== id),
        { id, servings, change: question.change },
      ]);
    },
    /** Връща промяната `id` и по-късните, които сочат ред, добавен само от нея (`withoutCookingChange`). */
    revert(id: string) {
      change((current) => withoutCookingChange(base, current, id));
    },
  };
}

export type CookingChanges = ReturnType<typeof useCookingChanges>;
