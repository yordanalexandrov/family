import { z } from 'zod';
import { slotSchema, tagSchema } from '../food/tags.js';
import { daysOfWeek } from '../menu/week.js';
import { dateKeySchema } from '../schemas/dates.js';
import { weekStartSchema } from '../schemas/menu.js';
import type { AiContract } from './contract.js';
import { hintSchema } from './hint.js';

/**
 * AI contract `menu.propose` (GLOSSARY: AI контракт, Предложение за меню): the API assembles the week and the
 * registry, the agent answers one recipe from it per day and slot, each with one sentence "why". All in Bulgarian.
 */

/** A registry recipe as the agent sees it: only what it needs to choose and vary. */
const menuProposeRecipeSchema = z.object({
  id: z.string(),
  title: z.string(),
  prepMinutes: z.int().positive().optional(),
  tags: z.array(tagSchema),
  ingredientNames: z.array(z.string()),
});

export type MenuProposeRecipe = z.infer<typeof menuProposeRecipeSchema>;

/** The contract input: the week, its slots, the recipes to choose from, the last 2 weeks and the hint. */
const menuProposeInputSchema = z.object({
  weekStart: weekStartSchema,
  slots: z.array(slotSchema).min(1),
  recipes: z.array(menuProposeRecipeSchema),
  /** Recipes of the meals of the 2 previous weeks, to avoid when the choice allows. */
  recentRecipeIds: z.array(z.string()),
  hint: hintSchema.optional(),
});

export type MenuProposeInput = z.infer<typeof menuProposeInputSchema>;

/** One proposed meal: a day and slot of the week with a recipe from the input. */
const proposedDaySchema = z.object({
  date: dateKeySchema,
  slot: slotSchema,
  recipeId: z.string().trim().min(1),
  why: z.string().trim().min(1),
});

export type ProposedDay = z.infer<typeof proposedDaySchema>;

/** Days of a proposal: one dinner for each day of the week (phase 1 plans dinner only). */
const MENU_PROPOSE_DAYS = 7;

const menuProposeOutputSchema = z.object({
  days: z.array(proposedDaySchema).length(MENU_PROPOSE_DAYS),
  summary: z.string().trim().min(1),
});

export type MenuProposeOutput = z.infer<typeof menuProposeOutputSchema>;

/**
 * JSON Schema of the output for `response_format: { type: 'json_schema', strict: true }`. Every field is required,
 * so the contract schema itself is strict-compatible.
 */
const MENU_PROPOSE_RESPONSE_JSON_SCHEMA = z.toJSONSchema(
  menuProposeOutputSchema,
  { io: 'output', unrepresentable: 'any' },
);

/**
 * What a schema cannot see, checked against the input after parsing: every day and slot of the week exactly once,
 * only recipes from the input, none twice. The problems are in Bulgarian, for the retry message to the agent;
 * an empty list means the proposal is valid.
 */
function validateProposal(
  input: MenuProposeInput,
  output: MenuProposeOutput,
): string[] {
  const problems: string[] = [];
  const week = daysOfWeek(input.weekStart);
  const recipeIds = new Set(input.recipes.map((recipe) => recipe.id));
  const seenDays = new Set<string>();
  const seenRecipes = new Set<string>();

  output.days.forEach((day, index) => {
    const at = `Ден ${index + 1} (${day.date}, ${day.slot})`;
    if (!week.includes(day.date)) {
      problems.push(
        `${at}: датата ${day.date} е извън седмицата ${week[0]} – ${week[6]}.`,
      );
    }
    if (!input.slots.includes(day.slot)) {
      problems.push(
        `${at}: слотът ${day.slot} не е поискан; позволени са ${input.slots.join(', ')}.`,
      );
    }
    const dayKey = `${day.date}/${day.slot}`;
    if (seenDays.has(dayKey)) {
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

  for (const date of week) {
    for (const slot of input.slots) {
      if (!seenDays.has(`${date}/${slot}`)) {
        problems.push(`Липсва ${date} ${slot}.`);
      }
    }
  }
  return problems;
}

/**
 * `menu.propose`. The output for an input is {@link menuProposeOutputSchema} with {@link validateProposal} against that
 * input on top, so an answer that breaks the rules fails parsing like a malformed one and goes through the same single
 * retry with its problems.
 */
export const menuPropose: AiContract<MenuProposeInput, MenuProposeOutput> = {
  id: 'menu.propose',
  inputSchema: menuProposeInputSchema,
  outputSchema: (input) =>
    menuProposeOutputSchema.superRefine((output, ctx) => {
      for (const message of validateProposal(input, output)) {
        ctx.addIssue({ code: 'custom', message });
      }
    }),
  responseFormat: {
    name: 'menu_propose',
    schema: MENU_PROPOSE_RESPONSE_JSON_SCHEMA,
  },
};
