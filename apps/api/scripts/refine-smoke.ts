// Refines recipes through the real `family-refine` agent, through the api's OpenClaw client, and prints them.
// Manual check against the gateway (docs/openclaw/README.md → "Smoke преди merge"); not part of `pnpm test`.
//   pnpm --filter api refine:smoke -- [--recipe <file.json> ...] [--url <link>] [--no-source] [--save out.json]
// Without `--recipe` it refines the fixture `recipe-refine.input.json` (terse steps, a photo of its own on step 2, a
// JSON-LD page with 3 step photos). `--recipe` is a recipe as `recipe` of the input (title, servings, prepMinutes,
// ingredients by name, steps with `image` `e1`, … or null), so a recipe of the registry can be pasted in. `--url` reads
// the page the way the api does (services/recipe-page) and sends it as the source; its photos go as references and
// after the answer the photos the agent chose are downloaded and made JPEGs as the api does, without storing them.
// `--no-source` sends `source: null`, as for a recipe without a link or one whose page did not open.
import { readFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { parseArgs } from 'node:util';
import {
  type RecipeRefineInput,
  type RecipeRefineOutput,
  recipeRefine,
} from '@family/shared';
import fixtureInput from '@family/shared/fixtures/recipe-refine.input.json' with {
  type: 'json',
};
import { z } from 'zod';
import { loadOpenClawConfig } from '../src/config.js';
import { createOpenClawClient } from '../src/openclaw/client.js';
import { prepareStepPhotos } from '../src/services/imported-step-photos.js';
import {
  readRecipePage,
  type StepImages,
} from '../src/services/recipe-page/index.js';

const USAGE = `Usage: pnpm --filter api refine:smoke -- [--recipe <file.json> ...] [--url <link>] [--no-source] [--save out.json]
  no options         the fixture recipe with the fixture page
  --recipe <file>    a recipe as \`recipe\` of the input (repeatable); replaces the fixture recipe
  --url <link>       the source page: read as the api does and sent with every recipe; replaces the fixture page
  --no-source        no source (a recipe without a link, or its page did not open)
  --save <file>      the validated outputs by case name, as JSON
`;

const { values } = parseArgs({
  // pnpm passes the `--` of `pnpm … refine:smoke -- --url …` through.
  args: process.argv.slice(2).filter((arg) => arg !== '--'),
  options: {
    recipe: { type: 'string', multiple: true },
    url: { type: 'string' },
    'no-source': { type: 'boolean' },
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
if (values.url && values['no-source']) {
  usage('--url and --no-source exclude each other.');
}

/** The source of every case and the URLs of its photos by reference; `null` without one. */
async function source(): Promise<{
  page: RecipeRefineInput['source'];
  stepImages: StepImages;
}> {
  if (values['no-source']) {
    return { page: null, stepImages: {} };
  }
  if (!values.url) {
    return { page: fixtureInput.source, stepImages: {} };
  }
  const page = await readRecipePage(values.url);
  if (!page.ok) {
    process.stderr.write(
      `✗ ${values.url}: ${page.failure} (${page.reason}); the api would refine without the page\n`,
    );
    return { page: null, stepImages: {} };
  }
  const stepImages = page.stepImages ?? {};
  process.stderr.write(
    `${page.url}: ${page.jsonLd ? 'JSON-LD' : 'текст'}, ${Object.keys(stepImages).length} снимки на стъпки\n`,
  );
  return {
    page: {
      url: page.url,
      ...(page.jsonLd ? { jsonLd: page.jsonLd } : { text: page.text }),
      photos: Object.keys(stepImages),
    },
    stepImages,
  };
}

const { page, stepImages } = await source();
const recipes: { name: string; recipe: unknown }[] = values.recipe
  ? await Promise.all(
      values.recipe.map(async (file) => ({
        name: basename(file, '.json'),
        recipe: JSON.parse(await readFile(file, 'utf8')),
      })),
    )
  : [{ name: 'fixture', recipe: fixtureInput.recipe }];

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

function summary(
  input: RecipeRefineInput,
  output: RecipeRefineOutput,
  seconds: string,
  photos: Map<string, Buffer | null>,
): string {
  const refined = output.recipe;
  if (!refined) {
    return `Нищо за подобряване (${seconds} s): ${output.noResults}\n`;
  }
  const photo = (image: string | null) => {
    if (image === null) {
      return '';
    }
    if (image.startsWith('e')) {
      return ` [своя ${image}]`;
    }
    const jpeg = photos.get(image);
    return jpeg === undefined
      ? ` [${image}]`
      : jpeg
        ? ` [${image} ✓ ${Math.round(jpeg.length / 1024)} KB]`
        : ` [${image} ✗ не се свали]`;
  };
  return [
    `${input.recipe.title}: ${input.recipe.steps.length} → ${refined.steps.length} стъпки, време ${input.recipe.prepMinutes ?? '—'} → ${refined.prepMinutes ?? '—'}`,
    `   Промени: ${refined.changes}`,
    '   Сега:',
    ...input.recipe.steps.map(
      (step, index) => `   ${index + 1}. ${step.text}${photo(step.image)}`,
    ),
    '   Предложение:',
    ...refined.steps.map(
      (step, index) => `   ${index + 1}. ${step.text}${photo(step.image)}`,
    ),
    `   за ${seconds} s`,
    '',
  ].join('\n');
}

const saved: Record<string, RecipeRefineOutput> = {};
let failed = false;
for (const { name, recipe } of recipes) {
  const parsed = recipeRefine.inputSchema.safeParse({ recipe, source: page });
  if (!parsed.success) {
    failed = true;
    process.stdout.write(
      `[${name}] ✗ невалиден вход:\n${z.prettifyError(parsed.error)}\n\n`,
    );
    continue;
  }
  const input = parsed.data;
  const leaked = Object.values(stepImages).filter((url) =>
    JSON.stringify(input).includes(url),
  );
  if (leaked.length > 0) {
    failed = true;
    process.stdout.write(
      `[${name}] ✗ URL на снимка е във входа на агента: ${leaked.join(', ')}\n\n`,
    );
    continue;
  }
  process.stderr.write(
    `→ ${config.url} openclaw/${config.refineAgent}, timeout ${config.timeoutMs} ms, ${name}: ${input.source ? input.source.url : 'без източник'}\n`,
  );
  const started = performance.now();
  try {
    const output = await client.complete(recipeRefine, input, {
      agent: config.refineAgent,
    });
    const seconds = ((performance.now() - started) / 1000).toFixed(1);
    const photos = output.recipe
      ? await prepareStepPhotos(
          stepImages,
          output.recipe.steps,
          AbortSignal.timeout(60_000),
        )
      : new Map<string, Buffer | null>();
    process.stdout.write(
      `[${name}] ${summary(input, output, seconds, photos)}\n`,
    );
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
