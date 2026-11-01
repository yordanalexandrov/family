// Revises recipes through the real `family-revise` agent via the api's OpenClaw client and prints what changed.
// Manual check against the gateway (docs/openclaw/README.md → "Smoke преди merge"); not part of `pnpm test`.
//   pnpm --filter api revise:smoke -- [--case <name> ...] [--recipe <file.json> --instruction "…"] [--repeat N] [--save out.json]
// Without options it runs the built-in cases of #316, each `--repeat` times (default 2): the moussaka of the fixture
// `recipe-revise.input.json` with „картофите искат още 20 мин“, „заливката е малко, двойна доза“ and „никъде не пише
// сол“; a risotto for 1 whose pesto is for 5 with „пестото е за 5 порции, направи го за 1“; an instruction that needs
// a search (a béchamel topping instead of the yoghurt one); and one outside the recipe, which must end `noResults`.
// Every case says which products and steps the instruction may change; every other product and step must come back
// word for word (✗ otherwise), and so must the servings, the time and the preparation unless the case expects them to
// change; a revision that changes nothing is a ✗ too (it should be `noResults`). A failure exits 1.
// `--recipe` is a recipe as `GET /api/recipes/:id` answers it (the body or its `recipe`), built into the input as the
// api does; with `--instruction` it is revised once per `--repeat`, printed but not checked. The registry is the seed
// ingredients with made-up ids, plus every product of the recipe the seed lacks.
import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import {
  type ContractRecipe,
  type Preparation,
  preparationKind,
  preparationLabel,
  type RecipeReviseInput,
  type RecipeReviseOutput,
  type RevisedRecipe,
  recipeRevise,
  recipeSchema,
  UNIT_LABELS_BG,
} from '@family/shared';
import fixtureInput from '@family/shared/fixtures/recipe-revise.input.json' with {
  type: 'json',
};
import { z } from 'zod';
import { loadOpenClawConfig } from '../src/config.js';
import seed from '../src/db/seed/ingredients.json' with { type: 'json' };
import { createOpenClawClient } from '../src/openclaw/client.js';
import {
  contractRecipe,
  photosByRef,
} from '../src/services/contract-recipe.js';

const USAGE = `Usage: pnpm --filter api revise:smoke -- [--case <name> ...] [--recipe <file.json> --instruction "…"] [--repeat N] [--save out.json]
  no options             the built-in cases: ${'<cases>'}
  --case <name>          only this built-in case (repeatable)
  --recipe <file>        a recipe as GET /api/recipes/:id answers it; with --instruction, instead of the cases
  --instruction "…"      what to change in --recipe
  --repeat <N>           run every case N times (default 2)
  --save <file>          every answer by case, as JSON
`;

const { values } = parseArgs({
  // pnpm passes the `--` of `pnpm … revise:smoke -- --case …` through.
  args: process.argv.slice(2).filter((arg) => arg !== '--'),
  options: {
    case: { type: 'string', multiple: true },
    recipe: { type: 'string' },
    instruction: { type: 'string' },
    repeat: { type: 'string' },
    save: { type: 'string' },
    help: { type: 'boolean' },
  },
});

/** One built-in case and what its revision may change; everything else must come back word for word. */
interface Case {
  name: string;
  recipe: ContractRecipe;
  instruction: string;
  /** The answer must be `noResults`. */
  noResults?: boolean;
  /** The products (by name) whose lines may change or go. */
  ingredients?: string[];
  /** New lines may come. */
  adds?: boolean;
  /** The steps (from 1) that may change or go; a number = how many of any. */
  steps?: number[] | number;
  /** The time it must have; unchanged otherwise. */
  prepMinutes?: number | null;
  /** The servings may change. */
  servings?: boolean;
  /** The preparation may change. */
  preparation?: boolean;
}

const moussaka = fixtureInput.recipe as ContractRecipe;

/** A risotto for 1 whose pesto is for 5 (#303). */
const risotto: ContractRecipe = {
  title: 'Ризото с песто',
  servings: 1,
  prepMinutes: 40,
  ingredients: [
    { name: 'босилек пресен', quantity: 50, unit: 'g' },
    { name: 'орех', quantity: 40, unit: 'g' },
    { name: 'пармезан', quantity: 50, unit: 'g', note: 'за пестото' },
    { name: 'чесън', quantity: 2, unit: 'pcs', note: 'скилидки' },
    { name: 'зехтин', quantity: 120, unit: 'ml' },
    { name: 'ориз', quantity: 80, unit: 'g', note: 'арборио' },
    { name: 'лук', quantity: 0.5, unit: 'pcs' },
    { name: 'масло', quantity: 15, unit: 'g' },
    { name: 'бяло вино', quantity: 50, unit: 'ml' },
    { name: 'бульон кубче', quantity: 1, unit: 'pcs', note: 'в 400 ml вода' },
    { name: 'пармезан', quantity: 20, unit: 'g' },
    { name: 'сол', quantity: null, unit: 'pinch' },
  ],
  steps: [
    {
      text: 'Направи пестото: пасирай босилека, орехите, 50 g пармезан, чесъна и зехтина до гладък сос.',
      image: null,
    },
    {
      text: 'Запържи нарязания лук в маслото на среден огън 3 минути, добави ориза и го запържи 1 минута.',
      image: null,
    },
    { text: 'Налей виното и бъркай, докато се изпари.', image: null },
    {
      text: 'Добавяй горещия бульон по черпак и бъркай около 18 минути, докато оризът омекне, но остане леко твърд в средата.',
      image: null,
    },
    {
      text: 'Махни от огъня, разбъркай 20 g пармезан и пестото и посоли на вкус.',
      image: null,
    },
  ],
  preparation: [],
};

const CASES: Case[] = [
  {
    name: 'мусака-време',
    recipe: moussaka,
    instruction: 'картофите искат още 20 мин',
    steps: [4],
    prepMinutes: 110,
  },
  {
    name: 'мусака-заливка',
    recipe: moussaka,
    instruction: 'заливката е малко, двойна доза',
    ingredients: ['яйце', 'кисело мляко', 'брашно'],
    steps: [5],
  },
  {
    name: 'мусака-сол',
    recipe: moussaka,
    instruction: 'никъде не пише сол',
    adds: true,
    steps: 2,
  },
  {
    name: 'ризото-песто',
    recipe: risotto,
    instruction: 'пестото е за 5 порции, направи го за 1',
    ingredients: ['босилек пресен', 'орех', 'пармезан', 'чесън', 'зехтин'],
    steps: [1, 5],
  },
  {
    name: 'мусака-бешамел',
    recipe: moussaka,
    instruction:
      'искам заливката да е бешамел вместо кисело мляко, с обичайната доза за тава 30×20',
    ingredients: ['яйце', 'кисело мляко', 'брашно'],
    adds: true,
    steps: [5],
  },
  {
    name: 'извън-рецептата',
    recipe: moussaka,
    instruction: 'купи хляб за утре и ми напомни в 18 ч',
    noResults: true,
  },
];

function usage(problem?: string): never {
  process.stderr.write(
    `${problem ? `${problem}\n` : ''}${USAGE.replace('<cases>', CASES.map((c) => c.name).join(', '))}`,
  );
  process.exit(problem ? 2 : 0);
}

if (values.help) {
  usage();
}
if ((values.recipe === undefined) !== (values.instruction === undefined)) {
  usage('--recipe and --instruction go together.');
}
const repeat = values.repeat === undefined ? 2 : Number(values.repeat);
if (!Number.isInteger(repeat) || repeat < 1) {
  usage('--repeat is a whole number from 1.');
}
const unknownCase = values.case?.find(
  (name) => !CASES.some((c) => c.name === name),
);
if (unknownCase) {
  usage(`No case ${unknownCase}.`);
}

async function ownCase(): Promise<Case[]> {
  if (!values.recipe || !values.instruction) {
    return CASES.filter(
      (c) => values.case === undefined || values.case.includes(c.name),
    );
  }
  const body = JSON.parse(await readFile(values.recipe, 'utf8'));
  const recipe = recipeSchema.parse(body.recipe ?? body);
  return [
    {
      name: recipe.title,
      recipe: contractRecipe(recipe, photosByRef(recipe)),
      instruction: values.instruction,
    },
  ];
}

const cases = await ownCase();
const checked = values.recipe === undefined;

/** The registry the api would send: the seed ingredients with made-up ids, and the recipe's products the seed lacks. */
function registry(recipe: ContractRecipe): RecipeReviseInput['ingredients'] {
  const names = new Map(
    seed.ingredients.map((ingredient) => [
      ingredient.name,
      ingredient.unit as 'g' | 'ml' | 'pcs',
    ]),
  );
  for (const line of recipe.ingredients) {
    if (!names.has(line.name)) {
      names.set(line.name, line.unit === 'pcs' ? 'pcs' : 'g');
    }
  }
  return [...names].map(([name, unit], index) => ({
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    name,
    unit,
  }));
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

type Line = { quantity: number | null; unit: string; note?: string | null };

/** „1 кг“, „по вкус“, with the note: „1 ч.л. (сладък)“. */
function amount(line: Line): string {
  const unit = UNIT_LABELS_BG[line.unit as keyof typeof UNIT_LABELS_BG];
  const text = line.quantity === null ? unit : `${line.quantity} ${unit}`;
  return line.note ? `${text} (${line.note})` : text;
}

function sameLine(a: Line, b: Line): boolean {
  return (
    a.quantity === b.quantity &&
    a.unit === b.unit &&
    (a.note ?? null) === (b.note ?? null)
  );
}

function preparationText(preparation: Preparation): string {
  return preparation.length === 0
    ? '—'
    : preparation
        .map(
          (item) =>
            `${preparationKind(item.kind).icon} ${preparationLabel(item)}`,
        )
        .join(', ');
}

/** What the revision changed, line by line, and the ✗ of the case's checks. */
function report(
  check: Case,
  input: RecipeReviseInput,
  revised: RevisedRecipe,
): { lines: string[]; problems: string[] } {
  const { recipe } = input;
  const names = new Map(input.ingredients.map((i) => [i.id, i.name]));
  const nameOf = (line: RevisedRecipe['ingredients'][number]) =>
    line.ingredientId === null
      ? `${line.newProduct?.name ?? '?'} [нов продукт]`
      : (names.get(line.ingredientId) ?? line.ingredientId);
  const lines: string[] = [];
  const problems: string[] = [];

  // Products: each line of the recipe is matched once by name and amount; what is left changed, went or came.
  const left = [...revised.ingredients];
  for (const line of recipe.ingredients) {
    const same = left.findIndex(
      (out) => nameOf(out) === line.name && sameLine(out, line),
    );
    if (same >= 0) {
      left.splice(same, 1);
      continue;
    }
    const renamed = left.findIndex((out) => nameOf(out) === line.name);
    const now = renamed >= 0 ? left.splice(renamed, 1)[0] : undefined;
    lines.push(
      `   ~ ${line.name}: ${amount(line)} → ${now ? amount(now) : 'махнат'}`,
    );
    if (checked && !check.ingredients?.includes(line.name)) {
      problems.push(`продуктът ${line.name} не е поискан, а е сменен`);
    }
  }
  for (const out of left) {
    lines.push(`   + ${nameOf(out)}: ${amount(out)}`);
    if (checked && !check.adds && !check.ingredients?.includes(nameOf(out))) {
      problems.push(`нов ред ${nameOf(out)} не е поискан`);
    }
  }

  // Steps: a step of the recipe kept word for word (with its photo) anywhere in the revision is unchanged.
  const changedSteps = recipe.steps.flatMap((step, index) =>
    revised.steps.some(
      (out) => out.text === step.text && out.image === step.image,
    )
      ? []
      : [index + 1],
  );
  const newSteps = revised.steps.filter(
    (out) =>
      !recipe.steps.some(
        (step) => step.text === out.text && step.image === out.image,
      ),
  );
  for (const number of changedSteps) {
    lines.push(`   ~ стъпка ${number}: ${recipe.steps[number - 1]?.text}`);
  }
  for (const step of newSteps) {
    lines.push(
      `   → ${step.text}${step.image === null ? '' : ` [${step.image}]`}`,
    );
  }
  if (checked) {
    const allowed = check.steps ?? [];
    const extra =
      typeof allowed === 'number'
        ? changedSteps.length > allowed
          ? changedSteps
          : []
        : changedSteps.filter((number) => !allowed.includes(number));
    if (extra.length > 0) {
      problems.push(`стъпки ${extra.join(', ')} не са поискани, а са сменени`);
    }
  }

  // A revision that changes nothing is not one: the agent should have said `noResults`.
  const before = preparationText(recipe.preparation);
  const after = preparationText(revised.preparation);
  if (
    checked &&
    lines.length === 0 &&
    revised.servings === recipe.servings &&
    revised.prepMinutes === recipe.prepMinutes &&
    before === after
  ) {
    problems.push('нищо не е сменено');
  }
  lines.push(
    `   порции ${recipe.servings} → ${revised.servings}, време ${recipe.prepMinutes ?? '—'} → ${revised.prepMinutes ?? '—'}`,
  );
  if (checked) {
    if (!check.servings && revised.servings !== recipe.servings) {
      problems.push('порциите не са поискани, а са сменени');
    }
    const time =
      check.prepMinutes === undefined ? recipe.prepMinutes : check.prepMinutes;
    if (revised.prepMinutes !== time) {
      problems.push(`времето е ${revised.prepMinutes}, а трябва ${time}`);
    }
  }
  if (before !== after) {
    lines.push(`   подготовка: ${before} → ${after}`);
    if (checked && !check.preparation) {
      problems.push('подготовката не е поискана, а е сменена');
    }
  }
  return { lines, problems };
}

const saved: Record<string, RecipeReviseOutput[]> = {};
let failed = false;
for (const check of cases) {
  const parsed = recipeRevise.inputSchema.safeParse({
    recipe: check.recipe,
    instruction: check.instruction,
    cookingChanges: [],
    ingredients: registry(check.recipe),
  });
  if (!parsed.success) {
    failed = true;
    process.stdout.write(
      `[${check.name}] ✗ невалиден вход:\n${z.prettifyError(parsed.error)}\n\n`,
    );
    continue;
  }
  const input = parsed.data;
  for (let run = 1; run <= repeat; run += 1) {
    const label = `[${check.name} ${run}/${repeat}]`;
    process.stderr.write(
      `→ ${config.url} openclaw/${config.reviseAgent}, timeout ${config.timeoutMs} ms, ${label} „${check.instruction}“\n`,
    );
    const started = performance.now();
    try {
      const output = await client.complete(recipeRevise, input, {
        agent: config.reviseAgent,
      });
      const seconds = ((performance.now() - started) / 1000).toFixed(1);
      saved[check.name] = [...(saved[check.name] ?? []), output];
      if (!output.recipe) {
        const ok = !checked || check.noResults === true;
        failed ||= !ok;
        process.stdout.write(
          `${label} ${ok ? '✓' : '✗'} нищо за поправяне (${seconds} s): ${output.noResults}\n\n`,
        );
        continue;
      }
      const { lines, problems } = report(check, input, output.recipe);
      if (checked && check.noResults) {
        problems.push('трябваше noResults');
      }
      failed ||= problems.length > 0;
      process.stdout.write(
        [
          `${label} ${problems.length === 0 ? '✓' : '✗'} „${check.instruction}“ за ${seconds} s`,
          `   Промени: ${output.recipe.changes}`,
          ...lines,
          ...problems.map((problem) => `   ✗ ${problem}`),
          '',
          '',
        ].join('\n'),
      );
    } catch (error) {
      const seconds = ((performance.now() - started) / 1000).toFixed(1);
      failed = true;
      process.stderr.write(
        `✗ ${label} след ${seconds} s: ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}\n`,
      );
    }
  }
}

if (values.save) {
  await writeFile(values.save, `${JSON.stringify(saved, null, 2)}\n`);
  process.stdout.write(`Изходът е записан в ${values.save}\n`);
}
process.exit(failed ? 1 : 0);
