// Asks the real `family-recipe` agent for suggestions once, through the api's OpenClaw client, and prints a summary.
// Manual check against the gateway (README → "Smoke тест на recipe.suggest"); not part of `pnpm test`.
//   pnpm --filter api suggest:smoke -- --slot lunch [--max 30] [--tags batch,quick] [--hint "..."] [--save out.json]
import { writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import {
  RECIPE_SUGGEST_RESPONSE_JSON_SCHEMA,
  type RecipeSuggestInput,
  recipeSuggestOutputSchema,
  recipeSuggestParamsSchema,
} from '@family/shared';
import { z } from 'zod';
import { loadOpenClawConfig } from '../src/config.js';
import seed from '../src/db/seed/ingredients.json' with { type: 'json' };
import { createOpenClawClient } from '../src/openclaw/client.js';

const { values } = parseArgs({
  // pnpm passes the `--` of `pnpm … suggest:smoke -- --slot lunch` through.
  args: process.argv.slice(2).filter((arg) => arg !== '--'),
  options: {
    slot: { type: 'string' },
    max: { type: 'string' },
    tags: { type: 'string' },
    hint: { type: 'string' },
    save: { type: 'string' },
  },
});

const params = recipeSuggestParamsSchema.safeParse({
  slot: values.slot,
  maxMinutes: values.max === undefined ? undefined : Number(values.max),
  tags: values.tags?.split(',').map((tag) => tag.trim()),
  hint: values.hint,
});
if (!params.success) {
  process.stderr.write(
    `Invalid arguments:\n${z.prettifyError(params.error)}\n` +
      'Usage: pnpm --filter api suggest:smoke -- --slot breakfast|lunch|dinner [--max 30] [--tags batch,quick] [--hint "..."] [--save out.json]\n',
  );
  process.exit(2);
}

const config = loadOpenClawConfig();
// The client logs only agent, attempt, status, duration and usage; the password stays in the Authorization header.
const log = (level: string) => (details: object, message: string) =>
  process.stderr.write(`${level} ${message} ${JSON.stringify(details)}\n`);
const client = createOpenClawClient(config, {
  info: log('info'),
  warn: log('warn'),
});
if (!client) {
  process.stderr.write(
    'OPENCLAW_GATEWAY_PASSWORD is not set (in .env or the environment).\n',
  );
  process.exit(2);
}

// The registry context the api would add: the seed ingredients and an empty registry.
const input: RecipeSuggestInput = {
  ...params.data,
  existingRecipeTitles: [],
  ingredientNames: seed.ingredients.map((ingredient) => ingredient.name),
};

process.stderr.write(
  `→ ${config.url} openclaw/${config.recipeAgent}, timeout ${config.timeoutMs} ms, input ${JSON.stringify(params.data)}\n`,
);
const started = performance.now();
try {
  const output = await client.complete({
    agent: config.recipeAgent,
    input,
    outputSchema: recipeSuggestOutputSchema,
    jsonSchema: {
      name: 'recipe_suggest',
      schema: RECIPE_SUGGEST_RESPONSE_JSON_SCHEMA,
    },
  });
  const seconds = ((performance.now() - started) / 1000).toFixed(1);

  const lines = output.suggestions.flatMap((suggestion, index) => {
    const newOnes = suggestion.ingredients.filter((i) => i.isNew);
    return [
      `${index + 1}. ${suggestion.title} (${suggestion.prepMinutes} мин, ${suggestion.servings} порции, ${suggestion.tags.join(', ') || 'без тагове'})`,
      `   ${suggestion.sourceUrl}`,
      `   Защо: ${suggestion.why}`,
      `   Продукти: ${suggestion.ingredients.length}, нови: ${newOnes.length}${newOnes.length > 0 ? ` (${newOnes.map((i) => i.name).join(', ')})` : ''}`,
      `   Стъпки: ${suggestion.steps.length}`,
      '',
    ];
  });
  process.stdout.write(
    `${lines.join('\n')}${output.suggestions.length} предложения за ${seconds} s\n`,
  );

  if (values.save) {
    await writeFile(values.save, `${JSON.stringify(output, null, 2)}\n`);
    process.stdout.write(`Изходът е записан в ${values.save}\n`);
  }
} catch (error) {
  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  process.stderr.write(
    `✗ след ${seconds} s: ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}\n`,
  );
  process.exit(1);
}
