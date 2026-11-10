import { describe, expect, it } from 'vitest';
import inputFixture from './fixtures/menu-rework.input.json' with {
  type: 'json',
};
import fixture from './fixtures/menu-rework.valid.json' with { type: 'json' };
import { menuRework } from './menu-rework.js';

/** No DOM or Node types in `shared`, so no `structuredClone`. */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** A hand-written answer of `family-menu-rework` for the input fixture; tests clone it before changing it. */
function validOutput() {
  // biome-ignore lint/suspicious/noExplicitAny: tests break the fixture on purpose
  return clone(fixture) as any;
}

function validInput() {
  return menuRework.inputSchema.parse(clone(inputFixture));
}

/** The rule problems of an answer, in Bulgarian, as the retry message carries them. */
function problems(output: unknown, input = validInput()): string[] {
  const result = menuRework.outputSchema(input).safeParse(output);
  return result.success
    ? []
    : result.error.issues.map((issue) => issue.message);
}

/** Id of recipe `n` of the fixture registry. */
function recipeId(n: number) {
  return `a0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

describe('menuRework.inputSchema', () => {
  it('takes past, kept and filled days, the registry, the use-up products and the hint', () => {
    expect(validInput()).toEqual(inputFixture);
  });

  it('refuses a filled day without its reason or thread, and a field it does not know', () => {
    for (const change of [
      // biome-ignore lint/suspicious/noExplicitAny: breaking the input on purpose
      (input: any) => delete input.days[2].reason,
      // biome-ignore lint/suspicious/noExplicitAny: breaking the input on purpose
      (input: any) => delete input.days[2].thread,
      // biome-ignore lint/suspicious/noExplicitAny: breaking the input on purpose
      (input: any) => (input.days[2].status = 'replace'),
      // biome-ignore lint/suspicious/noExplicitAny: breaking the input on purpose
      (input: any) => (input.recentRecipeIds = []),
    ]) {
      const input = clone(inputFixture);
      change(input);
      expect(menuRework.inputSchema.safeParse(input).success).toBe(false);
    }
  });
});

describe('menuRework.outputSchema', () => {
  it('accepts a recipe and a why for each filled day, and a summary', () => {
    const output = validOutput();

    expect(menuRework.outputSchema(validInput()).parse(output)).toEqual(output);
  });

  it('rejects an answer without a summary or a why', () => {
    const noSummary = validOutput();
    delete noSummary.summary;
    const blankWhy = validOutput();
    blankWhy.days[0].why = ' ';

    expect(problems(noSummary)).not.toEqual([]);
    expect(problems(blankWhy)).not.toEqual([]);
  });

  it('wants every filled day exactly once', () => {
    const missing = validOutput();
    missing.days = missing.days.slice(1);
    const twice = validOutput();
    twice.days[1] = { ...twice.days[0], recipeId: recipeId(10) };

    expect(problems(missing)).toEqual(['Липсва 2026-11-04 dinner.']);
    expect(problems(twice)).toEqual([
      'Ден 2 (2026-11-04, dinner): 2026-11-04 dinner се повтаря.',
      'Липсва 2026-11-06 dinner.',
    ]);
  });

  it('refuses a past or a kept day, and a date outside the week', () => {
    const output = validOutput();
    output.days.push(
      { ...output.days[0], date: '2026-11-03', recipeId: recipeId(9) },
      { ...output.days[0], date: '2026-11-05', recipeId: recipeId(4) },
      { ...output.days[0], date: '2026-11-09', recipeId: recipeId(3) },
    );

    expect(problems(output)).toEqual([
      'Ден 4 (2026-11-03, dinner): денят не е за попълване (status past); връщай само дните със status fill.',
      'Ден 5 (2026-11-05, dinner): денят не е за попълване (status keep); връщай само дните със status fill.',
      'Ден 6 (2026-11-09, dinner): денят не е за попълване (няма го в days); връщай само дните със status fill.',
    ]);
  });

  it('takes only recipes from the input: not a kept one, a vetoed one or an unknown one', () => {
    const output = validOutput();
    output.days[0].recipeId = recipeId(8);
    output.days[1].recipeId = recipeId(1);
    output.days[2].recipeId = recipeId(99);

    expect(problems(output)).toEqual([
      `Ден 1 (2026-11-04, dinner): рецепта ${recipeId(8)} не е от списъка recipes; избирай само от него.`,
      `Ден 2 (2026-11-06, dinner): рецепта ${recipeId(1)} не е от списъка recipes; избирай само от него.`,
      `Ден 3 (2026-11-07, dinner): рецепта ${recipeId(99)} не е от списъка recipes; избирай само от него.`,
    ]);
  });

  it('refuses the same recipe on two filled days', () => {
    const output = validOutput();
    output.days[2].recipeId = output.days[0].recipeId;

    expect(problems(output)).toEqual([
      `Ден 3 (2026-11-07, dinner): рецепта ${recipeId(7)} вече е в седмицата; без повторения.`,
    ]);
  });

  it('lets an unvoted day keep its own recipe', () => {
    const output = validOutput();
    output.days[1].recipeId = recipeId(6);

    expect(problems(output)).toEqual([]);
  });
});
