// Asks the real `family-menu-rework` agent to rework a week's menu, through the api's OpenClaw client, and prints and
// checks the answer. Manual check against the gateway (docs/openclaw/README.md → "Smoke преди merge"); not part of
// `pnpm test`.
//   pnpm --filter api rework:smoke -- [--case <name>] [--repeat N] [--hint "..." | --no-hint] [--save out.json]
//   pnpm --filter api rework:smoke -- --week 2026-11-09 [--today 2026-11-11] [--hint "..."]   (a real week: DATABASE_URL)
//   pnpm --filter api rework:smoke -- --input input.json                                        (a saved input)
// The built-in cases (all by default) are made from the fixture `menu-rework.input.json`: `fixture` (a veto with a
// thread, a day without votes with a note, an empty day, kept days, a hint), `без-подсказка`, `празна-седмица` (7 empty
// days from Monday), `вета` (two vetoes with threads, a day without votes, one empty) and `бележки` (notes to follow).
// `--week` builds the input exactly as the api does (`createMenuReworkStore().buildInput`) from the database at
// DATABASE_URL, read only, as of `--today` (default now); nothing is written.
// Besides the contract (checked by the client), a note or thread that says „без лук“ or „без месо“ must be followed:
// a recipe with onion or meat for such a day is ✗ and the exit code is 1.
import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import {
  type MenuReworkInput,
  type MenuReworkOutput,
  type MenuReworkRequest,
  menuRework,
} from '@family/shared';
import proposeInput from '@family/shared/fixtures/menu-propose.input.json' with {
  type: 'json',
};
import fixtureInput from '@family/shared/fixtures/menu-rework.input.json' with {
  type: 'json',
};
import { z } from 'zod';
import { loadOpenClawConfig } from '../src/config.js';
import { closeDb, createDb } from '../src/db/client.js';
import { createOpenClawClient } from '../src/openclaw/client.js';
import { createEventBus } from '../src/services/events.js';
import { createMenuReworkStore } from '../src/services/menu-reworks.js';

const USAGE =
  'Usage: pnpm --filter api rework:smoke -- [--case <name>] [--repeat N] [--hint "..." | --no-hint] [--save out.json]\n' +
  '       pnpm --filter api rework:smoke -- --week YYYY-MM-DD [--today YYYY-MM-DD] [--hint "..."]\n' +
  '       pnpm --filter api rework:smoke -- --input input.json\n';

const { values } = parseArgs({
  // pnpm passes the `--` of `pnpm … rework:smoke -- --case …` through.
  args: process.argv.slice(2).filter((arg) => arg !== '--'),
  options: {
    case: { type: 'string' },
    repeat: { type: 'string', default: '1' },
    hint: { type: 'string' },
    'no-hint': { type: 'boolean', default: false },
    week: { type: 'string' },
    today: { type: 'string' },
    input: { type: 'string' },
    save: { type: 'string' },
  },
});

function fail(message: string): never {
  process.stderr.write(`${message}\n${USAGE}`);
  process.exit(2);
}

/** Id of recipe `n` of the fixture registry. */
const recipeId = (n: number) =>
  `a0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const title = (n: number) =>
  proposeInput.recipes.find((recipe) => recipe.id === recipeId(n))?.title ?? '';
/** The fixture registry without `barred` recipes, each last served as in `menu-rework.input.json` (or never). */
function registry(...barred: number[]) {
  const served = new Map(
    fixtureInput.recipes.map((recipe) => [recipe.id, recipe.lastServedOn]),
  );
  return proposeInput.recipes
    .filter((recipe) => !barred.map(recipeId).includes(recipe.id))
    .map(({ lastServedOn: _, ...recipe }) => {
      const last = served.get(recipe.id);
      return last ? { ...recipe, lastServedOn: last } : recipe;
    });
}
const days = (start: number) =>
  Array.from(
    { length: 7 },
    (_, i) => `2026-11-${String(start + i).padStart(2, '0')}`,
  );
const [mon, tue, wed, thu, fri, sat, sun] = days(2) as [
  string,
  string,
  string,
  string,
  string,
  string,
  string,
];
const slot = 'dinner' as const;

const CASES: Record<string, unknown> = {
  fixture: fixtureInput,
  'без-подсказка': { ...fixtureInput, hint: undefined },
  'празна-седмица': {
    ...fixtureInput,
    days: days(2).map((date) => ({
      date,
      slot,
      status: 'fill',
      reason: 'empty',
      thread: [],
    })),
    recipes: registry(),
    hint: undefined,
  },
  вета: {
    ...fixtureInput,
    days: [
      {
        date: mon,
        slot,
        status: 'past',
        recipeId: recipeId(4),
        title: title(4),
      },
      {
        date: tue,
        slot,
        status: 'past',
        recipeId: recipeId(2),
        title: title(2),
      },
      {
        date: wed,
        slot,
        status: 'fill',
        reason: 'vetoed',
        recipeId: recipeId(9),
        title: title(9),
        thread: [
          { author: 'Дани', kind: 'system', body: `избра „${title(9)}“` },
          {
            author: 'Поли',
            kind: 'comment',
            body: 'Твърде тежко за сряда, нещо бързо.',
          },
        ],
      },
      {
        date: thu,
        slot,
        status: 'fill',
        reason: 'vetoed',
        recipeId: recipeId(3),
        title: title(3),
        thread: [
          { author: 'Дани', kind: 'system', body: `избра „${title(3)}“` },
          {
            author: 'Дани',
            kind: 'comment',
            body: 'Сьомга не тази седмица, скъпа е.',
          },
        ],
      },
      {
        date: fri,
        slot,
        status: 'keep',
        recipeId: recipeId(5),
        title: title(5),
      },
      {
        date: sat,
        slot,
        status: 'fill',
        reason: 'unvoted',
        recipeId: recipeId(6),
        title: title(6),
        thread: [
          { author: 'Поли', kind: 'system', body: `избра „${title(6)}“` },
        ],
      },
      { date: sun, slot, status: 'fill', reason: 'empty', thread: [] },
    ],
    recipes: registry(9, 3, 5),
    hint: 'повече риба',
  },
  бележки: {
    ...fixtureInput,
    days: [
      {
        date: mon,
        slot,
        status: 'past',
        recipeId: recipeId(1),
        title: title(1),
      },
      {
        date: tue,
        slot,
        status: 'fill',
        reason: 'unvoted',
        recipeId: recipeId(5),
        title: title(5),
        note: 'без месо',
        thread: [],
      },
      { date: wed, slot, status: 'keep', note: 'остатъци' },
      {
        date: thu,
        slot,
        status: 'fill',
        reason: 'empty',
        note: 'без лук за Поли',
        thread: [],
      },
      {
        date: fri,
        slot,
        status: 'keep',
        recipeId: recipeId(8),
        title: title(8),
      },
      { date: sat, slot, status: 'keep', note: 'ядем навън' },
      {
        date: sun,
        slot,
        status: 'fill',
        reason: 'vetoed',
        recipeId: recipeId(4),
        title: title(4),
        thread: [
          {
            author: 'Поли',
            kind: 'comment',
            body: 'Паста пак? Нещо за цялата неделя.',
          },
        ],
      },
    ],
    recipes: registry(4, 8),
    hint: undefined,
  },
};

/** The inputs to run, by name. */
async function inputs(): Promise<[string, unknown][]> {
  if (values.input) {
    return [[values.input, JSON.parse(await readFile(values.input, 'utf8'))]];
  }
  if (values.week) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      fail('DATABASE_URL is not set (in .env or the environment).');
    }
    const today = values.today
      ? new Date(`${values.today}T10:00:00+02:00`)
      : new Date();
    const db = createDb(databaseUrl);
    try {
      // Only `buildInput` runs: nothing is written, so nobody is notified.
      const store = createMenuReworkStore(
        createEventBus(),
        { reworked: async () => {} },
        () => today,
      );
      const request: MenuReworkRequest = {
        id: '00000000-0000-4000-8000-000000000000',
        weekStart: values.week,
        planId: '00000000-0000-4000-8000-000000000000',
        status: 'pending',
        requestedBy: '00000000-0000-4000-8000-000000000000',
        createdAt: today.toISOString(),
        ...(values.hint ? { hint: values.hint } : {}),
      };
      return [
        [
          `седмица ${values.week}`,
          await store.buildInput(db, request, undefined),
        ],
      ];
    } finally {
      await closeDb(db);
    }
  }
  if (values.case && !(values.case in CASES)) {
    fail(
      `Unknown case ${values.case}; one of ${Object.keys(CASES).join(', ')}.`,
    );
  }
  return Object.entries(CASES).filter(
    ([name]) => !values.case || name === values.case,
  );
}

const repeat = Number(values.repeat);
if (!Number.isInteger(repeat) || repeat < 1) {
  fail('--repeat is a whole number from 1.');
}

const MEAT = [
  'месо',
  'кайма',
  'пилешк',
  'свинск',
  'телешк',
  'бутче',
  'бекон',
  'наденица',
];

/** What a note or a thread of a day forbids, read from „без лук“ and „без месо“: words no product may contain. */
function forbidden(day: MenuReworkInput['days'][number]): string[] {
  const text = [
    day.note ?? '',
    ...(day.status === 'fill' ? day.thread.map((line) => line.body) : []),
  ]
    .join(' ')
    .toLowerCase();
  return [
    ...(text.includes('без лук') ? ['лук'] : []),
    ...(text.includes('без месо') ? MEAT : []),
  ];
}

/** Prints one answer and returns the failed checks. */
function report(input: MenuReworkInput, output: MenuReworkOutput): string[] {
  const recipes = new Map(input.recipes.map((recipe) => [recipe.id, recipe]));
  const answers = new Map(
    output.days.map((day) => [`${day.date}/${day.slot}`, day]),
  );
  const failures: string[] = [];
  for (const day of input.days) {
    const old = day.title ?? day.note ?? '—';
    if (day.status !== 'fill') {
      process.stdout.write(`  ${day.date} ${day.status.padEnd(5)} ${old}\n`);
      continue;
    }
    const answer = answers.get(`${day.date}/${day.slot}`);
    const recipe = answer && recipes.get(answer.recipeId);
    const bad = forbidden(day).filter((word) =>
      recipe?.ingredientNames.some((name) => name.toLowerCase().includes(word)),
    );
    const same =
      answer?.recipeId === day.recipeId ? ' [същата рецепта: остава]' : '';
    const mark = bad.length > 0 ? ` ✗ (${bad.join(', ')})` : '';
    process.stdout.write(
      `  ${day.date} fill  ${day.reason}${day.note ? ` „${day.note}“` : ''}: ${old} → ${recipe?.title} (${recipe?.prepMinutes ?? '?'} мин${recipe?.rating ? `, ★${recipe.rating}` : ''})${same}${mark}\n     Защо: ${answer?.why}\n`,
    );
    if (bad.length > 0) {
      failures.push(`${day.date}: ${recipe?.title} съдържа ${bad.join(', ')}`);
    }
  }
  process.stdout.write(`  Обобщение: ${output.summary}\n`);
  return failures;
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

const saved: {
  name: string;
  input: MenuReworkInput;
  output?: MenuReworkOutput;
  error?: string;
}[] = [];
let failed = 0;
const runs = await inputs().catch((error: unknown) =>
  fail(
    `Could not build the input: ${error instanceof Error ? error.message : String(error)}`,
  ),
);
for (const [name, raw] of runs) {
  const withHint = values['no-hint']
    ? { ...(raw as object), hint: undefined }
    : values.hint && !values.week
      ? { ...(raw as object), hint: values.hint }
      : raw;
  const parsed = menuRework.inputSchema.safeParse(withHint);
  if (!parsed.success) {
    fail(`Invalid input ${name}:\n${z.prettifyError(parsed.error)}`);
  }
  const input = parsed.data;
  const fill = input.days.filter((day) => day.status === 'fill').length;
  for (let run = 1; run <= repeat; run += 1) {
    process.stdout.write(
      `\n▶ ${name}${repeat > 1 ? ` #${run}` : ''}: ${fill} дни за попълване, ${input.recipes.length} рецепти${input.hint ? `, подсказка „${input.hint}“` : ', без подсказка'}\n`,
    );
    process.stderr.write(
      `→ ${config.url} openclaw/${config.menuReworkAgent}, timeout ${config.timeoutMs} ms\n`,
    );
    const started = performance.now();
    try {
      const output = await client.complete(menuRework, input, {
        agent: config.menuReworkAgent,
      });
      const seconds = ((performance.now() - started) / 1000).toFixed(1);
      const failures = report(input, output);
      process.stdout.write(
        `  ${failures.length > 0 ? '✗' : '✓'} за ${seconds} s\n`,
      );
      failed += failures.length > 0 ? 1 : 0;
      saved.push({ name, input, output });
    } catch (error) {
      const seconds = ((performance.now() - started) / 1000).toFixed(1);
      const message =
        error instanceof Error
          ? `${error.name}: ${error.message}`
          : String(error);
      process.stdout.write(`  ✗ след ${seconds} s: ${message}\n`);
      failed += 1;
      saved.push({ name, input, error: message });
    }
  }
}

if (values.save) {
  await writeFile(values.save, `${JSON.stringify(saved, null, 2)}\n`);
  process.stdout.write(`Отговорите са записани в ${values.save}\n`);
}
process.stdout.write(
  `\n${failed === 0 ? '✓ всичко мина' : `✗ ${failed} неуспешни`}\n`,
);
process.exit(failed > 0 ? 1 : 0);
