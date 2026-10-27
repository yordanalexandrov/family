// Asks the real `family-menu` agent for one weekly menu, through the api's OpenClaw client, and prints it.
// Manual check against the gateway (README → "Smoke тест на menu.propose"); not part of `pnpm test`.
//   pnpm --filter api menu:smoke -- [--hint "..."] [--save out.json]
// The input is the registry of the fixture `menu-propose.input.json` (10 dinners, some rated or served, 2 use-up
// products in the pantry), so a saved answer
// can replace `menu-propose.valid.json` as it is.
import { writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { menuPropose } from '@family/shared';
import fixtureInput from '@family/shared/fixtures/menu-propose.input.json' with {
  type: 'json',
};
import { z } from 'zod';
import { loadOpenClawConfig } from '../src/config.js';
import { createOpenClawClient } from '../src/openclaw/client.js';

const { values } = parseArgs({
  // pnpm passes the `--` of `pnpm … menu:smoke -- --hint …` through.
  args: process.argv.slice(2).filter((arg) => arg !== '--'),
  options: {
    hint: { type: 'string' },
    save: { type: 'string' },
  },
});

const parsed = menuPropose.inputSchema.safeParse({
  ...fixtureInput,
  hint: values.hint ?? fixtureInput.hint,
});
if (!parsed.success) {
  process.stderr.write(
    `Invalid arguments:\n${z.prettifyError(parsed.error)}\n` +
      'Usage: pnpm --filter api menu:smoke -- [--hint "..."] [--save out.json]\n',
  );
  process.exit(2);
}
const input = parsed.data;

/** Rating, last serving and the use-up products the "why" names (by stem, Bulgarian inflects), for a smoke line. */
function marks(
  recipe: { rating?: number; lastServedOn?: string } | undefined,
  why: string,
  useUp: { name: string }[],
): string {
  const named = useUp.filter(({ name }) =>
    why
      .toLowerCase()
      .includes(name.toLowerCase().slice(0, Math.max(4, name.length - 2))),
  );
  return [
    recipe?.rating ? ` [★${recipe.rating}]` : ' [без оценка]',
    recipe?.lastServedOn ? ` [последно ${recipe.lastServedOn}]` : '',
    named.length ? ` [килер: ${named.map(({ name }) => name).join(', ')}]` : '',
  ].join('');
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

process.stderr.write(
  `→ ${config.url} openclaw/${config.menuAgent}, timeout ${config.timeoutMs} ms, week ${input.weekStart}, ${input.recipes.length} recipes, hint ${JSON.stringify(input.hint ?? null)}, килер ${JSON.stringify(input.useUp)}\n`,
);
const started = performance.now();
try {
  const output = await client.complete(menuPropose, input, {
    agent: config.menuAgent,
  });
  const seconds = ((performance.now() - started) / 1000).toFixed(1);

  const recipes = new Map(input.recipes.map((recipe) => [recipe.id, recipe]));
  const lines = output.days.flatMap((day) => {
    const recipe = recipes.get(day.recipeId);
    return [
      `${day.date} ${day.slot}: ${recipe?.title} (${recipe?.prepMinutes ?? '?'} мин, ${recipe?.tags.join(', ')})${marks(recipe, day.why, input.useUp)}`,
      `   Защо: ${day.why}`,
    ];
  });
  process.stdout.write(
    `${lines.join('\n')}\n\nОбобщение: ${output.summary}\nМеню за ${seconds} s\n`,
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
