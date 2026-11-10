import { z } from 'zod';
import { slotSchema } from '../food/tags.js';
import { dateKeySchema } from '../schemas/dates.js';
import { mealCommentKindSchema, weekStartSchema } from '../schemas/menu.js';
import { useUpSchema } from '../schemas/pantry.js';
import type { AiContract } from './contract.js';
import { hintSchema } from './hint.js';
import { menuProposeRecipeSchema } from './menu-propose.js';

/**
 * AI contract `menu.rework` (GLOSSARY: Преработка на менюто): the API assembles the week as `classifyRework` sees it
 * (past days, kept days, days to fill with their thread and note) and the registry without the kept and the vetoed
 * recipes; the agent answers one recipe from it for each day to fill, with one sentence "why", and a new summary of the
 * week. All in Bulgarian.
 */

/** What a past or a kept day is: its recipe (`recipeId`, `title`), its note, both or neither. */
const fixedDayFields = {
  date: dateKeySchema,
  slot: slotSchema,
  recipeId: z.string().optional(),
  title: z.string().optional(),
  note: z.string().optional(),
};

const reworkDaySchema = z.discriminatedUnion('status', [
  /** Before today: history the agent sees, for variety and recency; not changed. */
  z.strictObject({ ...fixedDayFields, status: z.literal('past') }),
  /** Agreed (at least one „за“ and no „против“, or only a note): stays as it is. */
  z.strictObject({ ...fixedDayFields, status: z.literal('keep') }),
  /**
   * To get a recipe: `reason` says why, the old recipe (absent for an empty day) and the note stay as context, the note
   * stays on the day. The thread is in the format of `meal.replace`, oldest first.
   */
  z.strictObject({
    ...fixedDayFields,
    status: z.literal('fill'),
    reason: z.enum(['vetoed', 'unvoted', 'empty']),
    thread: z.array(
      z.object({
        author: z.string(),
        body: z.string(),
        kind: mealCommentKindSchema,
      }),
    ),
  }),
]);

export type MenuReworkDay = z.infer<typeof reworkDaySchema>;

const menuReworkInputSchema = z.strictObject({
  weekStart: weekStartSchema,
  slots: z.array(slotSchema).min(1),
  /** Every day and slot of the week, Monday first. */
  days: z.array(reworkDaySchema),
  /** The dinner registry without the recipes of kept days and of vetoed ones. */
  recipes: z.array(menuProposeRecipeSchema),
  useUp: z.array(useUpSchema),
  hint: hintSchema.optional(),
});

export type MenuReworkInput = z.infer<typeof menuReworkInputSchema>;

const reworkedDaySchema = z.object({
  date: dateKeySchema,
  slot: slotSchema,
  recipeId: z.string().trim().min(1),
  why: z.string().trim().min(1),
});

export type ReworkedDay = z.infer<typeof reworkedDaySchema>;

const menuReworkOutputSchema = z.object({
  /** Exactly the days with status `fill`. */
  days: z.array(reworkedDaySchema),
  summary: z.string().trim().min(1),
});

export type MenuReworkOutput = z.infer<typeof menuReworkOutputSchema>;

/** JSON Schema of the output for strict structured outputs; every field is required. */
const MENU_REWORK_RESPONSE_JSON_SCHEMA = z.toJSONSchema(
  menuReworkOutputSchema,
  {
    io: 'output',
    unrepresentable: 'any',
  },
);

/**
 * What a schema cannot see, checked against the input after parsing: every day to fill exactly once and no other day,
 * only recipes from the input, none twice. The problems are in Bulgarian, for the retry message to the agent; an empty
 * list means the answer is valid.
 */
function validateRework(
  input: MenuReworkInput,
  output: MenuReworkOutput,
): string[] {
  const problems: string[] = [];
  const statusOf = new Map(
    input.days.map((day) => [`${day.date}/${day.slot}`, day.status]),
  );
  const recipeIds = new Set(input.recipes.map((recipe) => recipe.id));
  const seenDays = new Set<string>();
  const seenRecipes = new Set<string>();

  output.days.forEach((day, index) => {
    const at = `Ден ${index + 1} (${day.date}, ${day.slot})`;
    const dayKey = `${day.date}/${day.slot}`;
    const status = statusOf.get(dayKey);
    if (status !== 'fill') {
      problems.push(
        `${at}: денят не е за попълване (${status ? `status ${status}` : 'няма го в days'}); връщай само дните със status fill.`,
      );
    } else if (seenDays.has(dayKey)) {
      problems.push(`${at}: ${day.date} ${day.slot} се повтаря.`);
    }
    seenDays.add(dayKey);
    if (!recipeIds.has(day.recipeId)) {
      problems.push(
        `${at}: рецепта ${day.recipeId} не е от списъка recipes; избирай само от него.`,
      );
    } else if (seenRecipes.has(day.recipeId)) {
      problems.push(
        `${at}: рецепта ${day.recipeId} вече е в седмицата; без повторения.`,
      );
    }
    seenRecipes.add(day.recipeId);
  });

  for (const day of input.days) {
    if (day.status === 'fill' && !seenDays.has(`${day.date}/${day.slot}`)) {
      problems.push(`Липсва ${day.date} ${day.slot}.`);
    }
  }
  return problems;
}

/**
 * `menu.rework`. The output for an input is {@link menuReworkOutputSchema} with {@link validateRework} against that
 * input on top, so an answer that breaks the rules goes through the same single retry as a malformed one.
 */
export const menuRework: AiContract<MenuReworkInput, MenuReworkOutput> = {
  id: 'menu.rework',
  inputSchema: menuReworkInputSchema,
  outputSchema: (input) =>
    menuReworkOutputSchema.superRefine((output, ctx) => {
      for (const message of validateRework(input, output)) {
        ctx.addIssue({ code: 'custom', message });
      }
    }),
  responseFormat: {
    name: 'menu_rework',
    schema: MENU_REWORK_RESPONSE_JSON_SCHEMA,
  },
};
