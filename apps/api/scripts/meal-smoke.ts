// Asks the real `family-meal` agent for other dinners for one meal, through the api's OpenClaw client, and prints them.
// Manual check against the gateway (docs/openclaw/README.md → "Smoke преди merge"); not part of `pnpm test`.
//   pnpm --filter api meal:smoke -- [--comment "..."] [--save out.json]
// The input is the fixture `meal-replace.input.json` (Wednesday's chicken talked over, 9 other dinners, 2 recent
// ones), so a saved answer can replace `meal-replace.valid.json` as it is. `--comment` adds a line of Поли to the
// thread, to see the candidates follow it.
import { writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { mealReplace } from '@family/shared';
import fixtureInput from '@family/shared/fixtures/meal-replace.input.json' with {
  type: 'json',
};
import { z } from 'zod';
import { loadOpenClawConfig } from '../src/config.js';
import { createOpenClawClient } from '../src/openclaw/client.js';

const { values } = parseArgs({
  // pnpm passes the `--` of `pnpm … meal:smoke -- --comment …` through.
  args: process.argv.slice(2).filter((arg) => arg !== '--'),
  options: {
    comment: { type: 'string' },
    save: { type: 'string' },
  },
});

const parsed = mealReplace.inputSchema.safeParse({
  ...fixtureInput,
  thread: values.comment
    ? [
        ...fixtureInput.thread,
        { author: 'Поли', kind: 'comment', body: values.comment },
      ]
    : fixtureInput.thread,
});
if (!parsed.success) {
  process.stderr.write(
    `Invalid arguments:\n${z.prettifyError(parsed.error)}\n` +
      'Usage: pnpm --filter api meal:smoke -- [--comment "..."] [--save out.json]\n',
  );
  process.exit(2);
}
const input = parsed.data;

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

process.stderr.write(
  `→ ${config.url} openclaw/${config.mealAgent}, timeout ${config.timeoutMs} ms, ${input.date} ${input.slot} „${input.current.title ?? input.current.note ?? ''}“, ${input.thread.length} thread lines, ${input.recipes.length} recipes\n`,
);
const started = performance.now();
try {
  const output = await client.complete(mealReplace, input, {
    agent: config.mealAgent,
  });
  const seconds = ((performance.now() - started) / 1000).toFixed(1);

  const recipes = new Map(input.recipes.map((recipe) => [recipe.id, recipe]));
  const recent = new Set(input.recentRecipeIds);
  const inWeek = new Set(input.week.map((meal) => meal.title));
  const lines = output.candidates.flatMap((candidate) => {
    const recipe = recipes.get(candidate.recipeId);
    const marks = [
      recent.has(candidate.recipeId) ? ' [от последните 2 седмици]' : '',
      recipe && inWeek.has(recipe.title) ? ' [вече е в седмицата]' : '',
    ].join('');
    return [
      `${recipe?.title} (${recipe?.prepMinutes ?? '?'} мин, ${recipe?.tags.join(', ')})${marks}`,
      `   Защо: ${candidate.why}`,
    ];
  });
  process.stdout.write(`${lines.join('\n')}\n\nКандидати за ${seconds} s\n`);

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
