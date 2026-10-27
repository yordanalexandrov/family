// Imports recipes through the real `family-import` agent, through the api's OpenClaw client, and prints them.
// Manual check against the gateway (docs/openclaw/README.md → "Smoke преди merge"); not part of `pnpm test`.
//   pnpm --filter api import:smoke -- [--case bg|en] [--text-file <file or dir> ...] [--url <source url>] [--save out.json]
// Without `--text-file` it imports two built-in texts: a Bulgarian blog post („Продукти:“ / „Начин на приготвяне:“, a range
// of servings, cups and cloves) and an English recipe with cups and ounces. The registry is the seed ingredients.
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { parseArgs } from 'node:util';
import {
  type RecipeNormalizeInput,
  type RecipeNormalizeOutput,
  type RecipeNormalizeSource,
  recipeNormalize,
  UNIT_LABELS_BG,
} from '@family/shared';
import { loadOpenClawConfig } from '../src/config.js';
import seed from '../src/db/seed/ingredients.json' with { type: 'json' };
import { createOpenClawClient } from '../src/openclaw/client.js';

const BULGARIAN_BLOG = `Мусака с кайма и картофи — като на баба

Днес ви предлагам класическа мусака, която у нас се прави всяка неделя. Децата я обожават, а и се топли отлично на следващия ден!

Порции: 6–8
Време за приготвяне: 1 час и 20 минути

Продукти:
- 1 кг картофи
- 500 г смляно месо (свинско и телешко)
- 1 глава лук
- 2 скилидки чесън
- 1 консерва домати (400 г)
- 1 ч.ч. прясно мляко
- 3 яйца
- 2 с.л. брашно
- 1 кофичка кисело мляко
- 1 ч.л. червен пипер
- чубрица, сол и черен пипер на вкус
- 4 с.л. олио

Начин на приготвяне:
Обелете картофите и ги нарежете на кубчета. Запържете лука в олиото, добавете каймата и чесъна и задушете, докато месото побелее. Добавете доматите, червения пипер и чубрицата, посолете и оставете за 5 минути.
Смесете картофите с месото и ги изсипете в тава. Налейте 1 ч.ч. вода и печете 40 минути на 200 градуса.
За заливката разбийте яйцата с киселото мляко, прясното мляко и брашното. Залейте мусаката и печете още 15 минути, докато се зачерви.

Ако ви хареса рецептата, споделете я с приятели!`;

const ENGLISH_RECIPE = `Easy Banana Bread

Prep time: 15 minutes | Cook time: 60 minutes | Makes 1 loaf

Ingredients
3 ripe bananas, mashed
1/3 cup melted butter
3/4 cup sugar
1 egg, beaten
1 teaspoon vanilla extract
1 teaspoon baking soda
Pinch of salt
1 1/2 cups all-purpose flour
4 oz walnuts, chopped (optional)

Instructions
Preheat the oven to 350°F (175°C) and butter a 4x8 inch loaf pan.
In a mixing bowl, mash the ripe bananas with a fork until completely smooth. Stir the melted butter into the mashed bananas.
Mix in the baking soda and salt. Stir in the sugar, beaten egg, and vanilla extract. Mix in the flour, then the walnuts.
Pour the batter into the prepared loaf pan. Bake for 55 to 65 minutes, until a tester inserted into the center comes out clean.
Remove from oven and let cool in the pan for a few minutes. Then remove the banana bread from the pan and let cool completely before serving.`;

/** One thing to import: a name for the output and the source as the api would send it. */
interface SmokeCase {
  name: string;
  source: RecipeNormalizeSource;
}

const BUILT_IN: SmokeCase[] = [
  {
    name: 'bg',
    source: {
      kind: 'text',
      text: BULGARIAN_BLOG,
      url: 'https://blog.example/musaka-kato-na-baba',
    },
  },
  { name: 'en', source: { kind: 'text', text: ENGLISH_RECIPE } },
];

const USAGE = `Usage: pnpm --filter api import:smoke -- [--case bg|en] [--text-file <file or dir> ...] [--url <source url>] [--save out.json]
  no options       the built-in cases (${BUILT_IN.map((c) => c.name).join(', ')})
  --case <name>    only that built-in case (repeatable)
  --text-file <p>  pasted text from a file, or every *.txt in a directory (repeatable); replaces the built-in cases
  --url <url>      the source link sent with every --text-file
  --save <file>    the validated outputs by case name, as JSON
`;

const { values } = parseArgs({
  // pnpm passes the `--` of `pnpm … import:smoke -- --case bg` through.
  args: process.argv.slice(2).filter((arg) => arg !== '--'),
  options: {
    case: { type: 'string', multiple: true },
    'text-file': { type: 'string', multiple: true },
    url: { type: 'string' },
    save: { type: 'string' },
    help: { type: 'boolean' },
  },
});

function usage(problem?: string): never {
  process.stderr.write(`${problem ? `${problem}\n` : ''}${USAGE}`);
  process.exit(problem ? 2 : 0);
}

/** `--text-file`: a file is one case; a directory is one case per `*.txt` in it, by name. */
async function textFileCases(paths: string[], url: string | undefined) {
  const files: string[] = [];
  for (const path of paths) {
    if ((await stat(path)).isDirectory()) {
      const names = (await readdir(path)).filter((n) => n.endsWith('.txt'));
      files.push(...names.sort().map((n) => join(path, n)));
    } else {
      files.push(path);
    }
  }
  return Promise.all(
    files.map(
      async (file): Promise<SmokeCase> => ({
        name: basename(file),
        source: {
          kind: 'text',
          text: (await readFile(file, 'utf8')).trim(),
          ...(url ? { url } : {}),
        },
      }),
    ),
  );
}

/**
 * The cases to run. Each kind of source adds its own option and builder here (#103 a page by link, #105 `--photo`);
 * the loop below runs whatever cases there are.
 */
async function selectCases(): Promise<SmokeCase[]> {
  if (values.help) {
    usage();
  }
  if (values['text-file']) {
    const cases = await textFileCases(values['text-file'], values.url);
    if (cases.length === 0) {
      usage('No *.txt files found.');
    }
    return cases;
  }
  if (values.url) {
    usage('--url goes with --text-file.');
  }
  if (!values.case) {
    return BUILT_IN;
  }
  return values.case.map(
    (name) =>
      BUILT_IN.find((c) => c.name === name) ?? usage(`Unknown case ${name}.`),
  );
}

const cases = await selectCases();

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

// The registry the api would send: the seed ingredients, with made-up ids.
const ingredients = seed.ingredients.map((ingredient, index) => ({
  id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
  name: ingredient.name,
  unit: ingredient.unit as 'g' | 'ml' | 'pcs',
}));
const names = new Map(ingredients.map((i) => [i.id, i.name]));

function summary(output: RecipeNormalizeOutput, seconds: string): string {
  const { recipe } = output;
  if (!recipe) {
    return `Няма рецепта (${seconds} s): ${output.noResults}\n`;
  }
  const lines = recipe.ingredients.map((line) => {
    const amount =
      line.quantity === null
        ? UNIT_LABELS_BG[line.unit]
        : `${line.quantity} ${UNIT_LABELS_BG[line.unit]}`;
    const product = line.newProduct
      ? `НОВ „${line.newProduct.name}“ (${line.newProduct.unit}, ${line.newProduct.aisle})`
      : `„${names.get(line.ingredientId ?? '')}“ [${line.ingredientId}]`;
    return `   - ${product}: ${amount}${line.note ? ` (${line.note})` : ''}`;
  });
  const newCount = recipe.ingredients.filter((line) => line.newProduct).length;
  return [
    `${recipe.title} (${recipe.servings} порции, ${recipe.prepMinutes ?? '?'} мин, ${recipe.tags.join(', ') || 'без тагове'})`,
    `   Допускания: ${recipe.assumptions || '—'}`,
    `   Продукти: ${recipe.ingredients.length}, нови: ${newCount}`,
    ...lines,
    `   Стъпки: ${recipe.steps.length}`,
    ...recipe.steps.map((step, index) => `   ${index + 1}. ${step}`),
    `   Хранителна стойност на 100 г: ${recipe.nutritionPer100g ? JSON.stringify(recipe.nutritionPer100g) : 'няма'}`,
    `   за ${seconds} s`,
    '',
  ].join('\n');
}

const saved: Record<string, RecipeNormalizeOutput> = {};
let failed = false;
for (const { name, source } of cases) {
  const input: RecipeNormalizeInput = { source, ingredients };
  process.stderr.write(
    `→ ${config.url} openclaw/${config.importAgent}, timeout ${config.timeoutMs} ms, ${name}: ${source.text.length} знака${source.url ? `, ${source.url}` : ''}, ${ingredients.length} продукта в регистъра\n`,
  );
  const started = performance.now();
  try {
    const output = await client.complete(recipeNormalize, input, {
      agent: config.importAgent,
    });
    const seconds = ((performance.now() - started) / 1000).toFixed(1);
    process.stdout.write(`[${name}] ${summary(output, seconds)}\n`);
    saved[name] = output;
  } catch (error) {
    const seconds = ((performance.now() - started) / 1000).toFixed(1);
    failed = true;
    process.stderr.write(
      `✗ [${name}] след ${seconds} s: ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}\n`,
    );
  }
}

if (values.save) {
  await writeFile(values.save, `${JSON.stringify(saved, null, 2)}\n`);
  process.stdout.write(`Изходът е записан в ${values.save}\n`);
}
process.exit(failed ? 1 : 0);
