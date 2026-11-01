// Asks questions in Готвене through the real `family-cook` agent, through the api's OpenClaw client, and prints the answers.
// Manual check against the gateway (docs/openclaw/README.md → "Smoke преди merge"); not part of `pnpm test`.
//   pnpm --filter api ask:smoke -- [--recipe <file.json>] [--servings N] [--step N] [--question "…" ...] [--chain] [--repeat N] [--save out.json]
// Without `--question` it asks the built-in cases of #272 (substitution with pulp and with whole canned tomatoes, a sign
// of doneness, scaling the servings, a question that needs a search, one outside cooking), each at its own step, and the
// follow-up questions of #273 after some of them („а колко дълго да я варя тогава?“): a follow-up goes with the earlier
// questions of its chain and the answers the agent gave them in this run (`history`, as the api sends it).
// `--chain` asks the `--question`s as one chain, each following the one before.
// Cooking changes (#276): a built-in case says whether its answer must bring a `change` (the substitutions with pulp and
// whole tomatoes) or must not (doneness, servings, outside cooking); a mismatch is a failure. A change the agent brings
// is applied for the rest of its chain, as „Промени“ does, so the follow-ups see the recipe with it, marked `changed`.
// Without `--recipe` the recipe is the fixture `cooking-ask.input.json` (for 4, shown for 2). `--recipe` is a recipe as
// `GET /api/recipes/:id` answers it (the body or its `recipe`), built into the input as the api does (`cookingAskInput`)
// with the enabled appliances of the seed; `--servings` and `--step` (from 1) are then the screen's.
import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import {
  type AppliedCookingChange,
  applyCookingChanges,
  COOKING_ANSWER_MAX,
  COOKING_HISTORY_MAX,
  type CookingAskInput,
  type CookingChange,
  cookingAsk,
  recipeSchema,
  UNIT_LABELS_BG,
} from '@family/shared';
import fixtureInput from '@family/shared/fixtures/cooking-ask.input.json' with {
  type: 'json',
};
import { z } from 'zod';
import { loadOpenClawConfig } from '../src/config.js';
import { createOpenClawClient } from '../src/openclaw/client.js';
import { cookingAskInput } from '../src/services/cooking-questions.js';

const USAGE = `Usage: pnpm --filter api ask:smoke -- [--recipe <file.json>] [--servings N] [--step N] [--question "…" ...] [--chain] [--repeat N] [--save out.json]
  no options          the built-in cases on the fixture recipe
  --recipe <file>     a recipe as GET /api/recipes/:id answers it; replaces the fixture recipe
  --servings <N>      the servings on the screen (with --recipe; default: the recipe's)
  --step <N>          the step on the screen, from 1 (default: each case's own, or 1)
  --question "…"      ask this instead of the built-in cases (repeatable)
  --chain             the --question's are one chain: each follows the one before
  --repeat <N>        ask every chain N times (default 1)
  --save <file>       every answer by case, as JSON
`;

const { values } = parseArgs({
  // pnpm passes the `--` of `pnpm … ask:smoke -- --question …` through.
  args: process.argv.slice(2).filter((arg) => arg !== '--'),
  options: {
    recipe: { type: 'string' },
    servings: { type: 'string' },
    step: { type: 'string' },
    question: { type: 'string', multiple: true },
    chain: { type: 'boolean' },
    repeat: { type: 'string' },
    save: { type: 'string' },
    help: { type: 'boolean' },
  },
});

function usage(problem?: string): never {
  process.stderr.write(`${problem ? `${problem}\n` : ''}${USAGE}`);
  process.exit(problem ? 2 : 0);
}

if (values.help) {
  usage();
}

function positive(name: string, value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) {
    usage(`--${name} must be a whole number from 1.`);
  }
  return number;
}

const repeat = positive('repeat', values.repeat) ?? 1;
const servings = positive('servings', values.servings);
const step = positive('step', values.step);
if (servings !== undefined && !values.recipe) {
  usage('--servings needs --recipe: the fixture is already scaled.');
}
if (values.chain && !values.question) {
  usage('--chain needs --question.');
}

/** One question to ask, at its step (from 1); `change`: whether the answer must bring a change, unchecked if absent. */
interface Case {
  name: string;
  question: string;
  step: number;
  change?: boolean;
}

/** Questions asked one after another, each a follow-up of the ones before; a single question is a chain of one. */
type Chain = Case[];

/** The cases of #272 and the follow-ups of #273 on the fixture recipe (tomatoes on step 3, chicken and rice on step 4). */
const BUILT_IN: Chain[] = [
  [
    {
      name: 'pulp',
      question: 'Мога ли да заменя настърганите домати с консерва pulp и как?',
      step: 3,
      change: true,
    },
    {
      name: 'pulp → колко дълго',
      question: 'а колко дълго да я варя тогава?',
      step: 3,
    },
    {
      name: 'pulp → а ако е гъста',
      question: 'ами ако стане много гъсто да сложа ли вода и колко',
      step: 3,
    },
  ],
  [
    {
      name: 'цели доматки',
      question:
        'имам само цели белени доматки от консерва става ли с тях вместо пресните',
      step: 3,
      change: true,
    },
    {
      name: 'цели доматки → сокът',
      question: 'а сока от консервата и него ли да сложа',
      step: 3,
    },
  ],
  [
    {
      name: 'готовност',
      question: 'как да разбера че пилето и оризът са готови',
      step: 4,
      change: false,
    },
    {
      name: 'готовност → още твърд',
      question: 'оризът е още твърд а водата свърши какво да правя',
      step: 4,
      change: false,
    },
  ],
  [
    {
      name: 'порции',
      question: 'ако дойдат още 4 души колко ориз и вода да сложа',
      step: 4,
      change: false,
    },
  ],
  [
    {
      name: 'търсене',
      question:
        'колко грама нетно тегло е консервата цели белени домати на Mutti и колко от нея да сложа',
      step: 3,
    },
  ],
  [
    {
      name: 'извън готвенето',
      question: 'какво ще е времето утре в София',
      step: 2,
      change: false,
    },
  ],
];

const asked: Case[] =
  values.question?.map((question, index) => ({
    name: `въпрос ${index + 1}`,
    question,
    step: step ?? 1,
  })) ?? [];
const chains: Chain[] = values.question
  ? values.chain
    ? [asked]
    : asked.map((each) => [each])
  : BUILT_IN.map((chain) =>
      chain.map((each) => ({ ...each, step: step ?? each.step })),
    );

/** The appliances of the seed (`drizzle/0023_seed_appliances.sql`), all enabled, for a recipe from `--recipe`. */
const SEED_APPLIANCES = [
  'air fryer (Cosori CAF-R121-KEU)',
  'мултикукър (Ninja SmartLid OL750EU) — готвене под налягане, на пара, бавно готвене, air fryer',
  'sous vide',
  'вакуум машина — само за сухи продукти, не за течности и маринати с течност',
  'кухненски робот ×2 (Bosch MUM5, Philips 7778) — месене, разбиване, рендосване, нарязване',
  'пасатор',
];

type History = CookingAskInput['history'];

/** The fixture's lines, already for its shown servings, with the changes applied in this chain (as the api does). */
function fixtureIngredients(applied: AppliedCookingChange[]) {
  const { shownServings, ingredients } = fixtureInput.recipe;
  const lines = applyCookingChanges(
    ingredients.map(({ index: _, unit, ...line }) => ({
      ...line,
      unit: unit as CookingAskInput['recipe']['ingredients'][number]['unit'],
      servings: shownServings,
    })),
    applied,
  );
  return lines.map(({ servings: _, ...line }, index) => ({ index, ...line }));
}

/**
 * The input for one case after `history` (the answered questions before it in its chain) and with the changes applied
 * in its chain: from the recipe file as the api builds it, or the fixture with the case's question and step.
 */
async function inputFor(): Promise<
  (each: Case, history: History, applied: AppliedCookingChange[]) => unknown
> {
  if (!values.recipe) {
    return (each, history, applied) => ({
      ...fixtureInput,
      recipe: {
        ...fixtureInput.recipe,
        ingredients: fixtureIngredients(applied),
      },
      currentStep: each.step,
      history,
      question: each.question,
    });
  }
  const file: unknown = JSON.parse(await readFile(values.recipe, 'utf8'));
  const body = z.object({ recipe: z.unknown() }).safeParse(file);
  const recipe = recipeSchema.parse(body.success ? body.data.recipe : file);
  return (each, history, applied) =>
    cookingAskInput(
      recipe,
      {
        question: each.question,
        step: each.step - 1,
        servings: servings ?? recipe.servings,
      },
      SEED_APPLIANCES,
      history,
      applied,
    );
}

/** A change as one line: „замени 1 → консерва pulp 200 г; махни 5; добави захар 1 ч.л.“. */
function changeLine(change: CookingChange | undefined): string {
  if (!change) {
    return 'няма';
  }
  const product = ({
    name,
    quantity,
    unit,
  }: {
    name: string;
    quantity: number | null;
    unit: keyof typeof UNIT_LABELS_BG;
  }) =>
    [name, quantity, UNIT_LABELS_BG[unit]]
      .filter((part) => part !== null)
      .join(' ');
  return change.ingredients
    .map((entry) =>
      entry.kind === 'replace'
        ? `замени ${entry.index} → ${product(entry.ingredient)}`
        : entry.kind === 'remove'
          ? `махни ${entry.index}`
          : `добави ${product(entry.ingredient)}`,
    )
    .join('; ');
}

const build = await inputFor();
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

const saved: Record<
  string,
  { seconds: number; answer: string; change: CookingChange | null }[]
> = {};
let failed = false;
for (let attempt = 1; attempt <= repeat; attempt++) {
  for (const chain of chains) {
    // The api sends the last COOKING_HISTORY_MAX answered questions of the chain; a failed one is passed over.
    let history: History = [];
    // The changes of the chain applied so far, as „Промени“ does after each answer with one.
    let applied: AppliedCookingChange[] = [];
    for (const each of chain) {
      const label = repeat > 1 ? `${each.name} #${attempt}` : each.name;
      const parsed = cookingAsk.inputSchema.safeParse(
        build(each, history, applied),
      );
      if (!parsed.success) {
        failed = true;
        process.stdout.write(
          `[${label}] ✗ невалиден вход:\n${z.prettifyError(parsed.error)}\n\n`,
        );
        continue;
      }
      const input: CookingAskInput = parsed.data;
      process.stderr.write(
        `→ ${config.url} openclaw/${config.cookAgent}, timeout ${config.cookTimeoutMs} ms, ${label}\n`,
      );
      const started = performance.now();
      try {
        const output = await client.complete(cookingAsk, input, {
          agent: config.cookAgent,
          timeoutMs: config.cookTimeoutMs,
        });
        const seconds = Number(
          ((performance.now() - started) / 1000).toFixed(1),
        );
        const brought = output.change !== undefined;
        const expected =
          each.change === undefined
            ? ''
            : each.change === brought
              ? ' ✓'
              : ` ✗ очаквана ${each.change ? 'промяна' : 'без промяна'}`;
        if (each.change !== undefined && each.change !== brought) {
          failed = true;
        }
        process.stdout.write(
          [
            `[${label}] ${input.recipe.title}, ${input.recipe.shownServings} порции, стъпка ${input.currentStep} от ${input.recipe.steps.length}`,
            ...input.history.map(
              (before, index) =>
                `   Преди ${index + 1}: ${before.question} → ${before.answer}`,
            ),
            ...input.recipe.ingredients
              .filter((line) => line.changed || line.removed)
              .map(
                (line) =>
                  `   Приложено: ${line.index} ${line.name}${line.removed ? ' (махнат)' : ''}`,
              ),
            `   Въпрос: ${input.question}`,
            `   Отговор (${output.answer.length}/${COOKING_ANSWER_MAX} знака, ${seconds} s): ${output.answer}`,
            `   Промяна: ${changeLine(output.change)}${expected}`,
            '',
            '',
          ].join('\n'),
        );
        saved[each.name] = [
          ...(saved[each.name] ?? []),
          { seconds, answer: output.answer, change: output.change ?? null },
        ];
        if (output.change) {
          applied = [
            ...applied,
            { change: output.change, servings: input.recipe.shownServings },
          ];
        }
        history = [
          ...history,
          { question: input.question, answer: output.answer },
        ].slice(-COOKING_HISTORY_MAX);
      } catch (error) {
        const seconds = ((performance.now() - started) / 1000).toFixed(1);
        failed = true;
        process.stderr.write(
          `✗ [${label}] след ${seconds} s: ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}\n`,
        );
      }
    }
  }
}

if (values.save) {
  await writeFile(values.save, `${JSON.stringify(saved, null, 2)}\n`);
  process.stdout.write(`Изходът е записан в ${values.save}\n`);
}
process.exit(failed ? 1 : 0);
