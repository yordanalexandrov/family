// Asks the real `family-recipe` agent for suggestions once, through the api's OpenClaw client, and prints a summary.
// Manual check against the gateway (README → "Smoke тест на recipe.suggest"); not part of `pnpm test`. Each suggestion
// shows its preparation (#284) and the steps with a temperature, to compare the degrees with the step and the source.
//   pnpm --filter api suggest:smoke -- --slots lunch,dinner [--times 0-15,15-30] [--tags batch,quick] [--hint "..."] [--save out.json]
import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import {
  preparationKind,
  preparationLabel,
  type RecipeSuggestInput,
  recipeSuggest,
  recipeSuggestParamsSchema,
} from '@family/shared';
import { z } from 'zod';
import { loadOpenClawConfig } from '../src/config.js';
import seed from '../src/db/seed/ingredients.json' with { type: 'json' };
import { migrationPath } from '../src/db/seed/migrations.js';
import { createOpenClawClient } from '../src/openclaw/client.js';

const { values } = parseArgs({
  // pnpm passes the `--` of `pnpm … suggest:smoke -- --slots lunch` through.
  args: process.argv.slice(2).filter((arg) => arg !== '--'),
  options: {
    slots: { type: 'string' },
    times: { type: 'string' },
    tags: { type: 'string' },
    hint: { type: 'string' },
    save: { type: 'string' },
  },
});

const params = recipeSuggestParamsSchema.safeParse({
  slots: values.slots?.split(',').map((slot) => slot.trim()),
  times: values.times?.split(',').map((time) => time.trim()),
  tags: values.tags?.split(',').map((tag) => tag.trim()),
  hint: values.hint,
});
if (!params.success) {
  process.stderr.write(
    `Invalid arguments:\n${z.prettifyError(params.error)}\n` +
      'Usage: pnpm --filter api suggest:smoke -- --slots lunch,dinner [--times 0-15,15-30] [--tags batch,quick] [--hint "..."] [--save out.json]\n',
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

// The household appliances of the data migration (GLOSSARY: Уред), the enabled ones: the second string of each row.
// Every row has to match: a changed row format stops the smoke instead of asking with fewer appliances.
const seedRows = (
  await readFile(migrationPath('0023_seed_appliances'), 'utf8')
).match(/^\s*\('.*$/gm);
const parsedRows = (seedRows ?? []).map((row) =>
  /^\s*\('[^']+', '([^']+)', (true|false),/.exec(row),
);
if (parsedRows.length === 0 || parsedRows.some((row) => row === null)) {
  process.stderr.write(
    `Cannot read the appliances of 0023_seed_appliances.sql (${parsedRows.length} rows); update the parser in suggest-smoke.ts.\n`,
  );
  process.exit(2);
}
const appliances = parsedRows
  .filter((row) => row?.[2] === 'true')
  .map((row) => row?.[1] as string);

// The context the api would add: the seed ingredients, an empty registry and the household appliances.
const input: RecipeSuggestInput = {
  ...params.data,
  existingRecipeTitles: [],
  ingredientNames: seed.ingredients.map((ingredient) => ingredient.name),
  appliances,
};

/** A step that names a temperature: its degrees are compared with the oven of the preparation. */
const TEMPERATURE = /°|градус|фурна/i;

process.stderr.write(
  `→ ${config.url} openclaw/${config.recipeAgent}, timeout ${config.timeoutMs} ms, input ${JSON.stringify(params.data)}\n`,
);
const started = performance.now();
try {
  const output = await client.complete(recipeSuggest, input, {
    agent: config.recipeAgent,
  });
  const seconds = ((performance.now() - started) / 1000).toFixed(1);

  const lines = output.suggestions.flatMap((suggestion, index) => {
    const newOnes = suggestion.ingredients.filter((i) => i.isNew);
    return [
      `${index + 1}. ${suggestion.title} (${suggestion.prepMinutes} мин, ${suggestion.servings} порции, ${suggestion.tags.join(', ') || 'без тагове'})`,
      `   ${suggestion.sourceUrl}`,
      `   Защо: ${suggestion.why}`,
      `   Уред: ${suggestion.appliance ?? '—'}`,
      `   Продукти: ${suggestion.ingredients.length}, нови: ${newOnes.length}${newOnes.length > 0 ? ` (${newOnes.map((i) => i.name).join(', ')})` : ''}`,
      `   Стъпки: ${suggestion.steps.length}`,
      ...suggestion.steps.flatMap((step, stepIndex) =>
        TEMPERATURE.test(step) ? [`   ${stepIndex + 1}. ${step}`] : [],
      ),
      `   Подготовка: ${suggestion.preparation.length === 0 ? 'няма' : suggestion.preparation.length}`,
      ...suggestion.preparation.map(
        (item) =>
          `   - ${preparationKind(item.kind).labelBg}: ${preparationLabel(item)}`,
      ),
      '',
    ];
  });
  process.stdout.write(
    `${lines.join('\n')}${output.suggestions.length} предложения за ${seconds} s\n`,
  );
  if (output.noResults !== null) {
    process.stdout.write(`Няма резултати: ${output.noResults}\n`);
  }

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
