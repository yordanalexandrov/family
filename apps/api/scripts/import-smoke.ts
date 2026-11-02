// Imports recipes through the real `family-import` agent, through the api's OpenClaw client, and prints them.
// Manual check against the gateway (docs/openclaw/README.md → "Smoke преди merge"); not part of `pnpm test`.
//   pnpm --filter api import:smoke -- [--case bg|en|beans|steak|fan|salad|risotto|pizza] [--repeat N] [--text-file <file or dir> ...] [--source-url <url>] [--url <link> ...] [--photo <file or dir> ...] [--save out.json]
// Without `--text-file`, `--url` or `--photo` it imports the built-in texts: a Bulgarian blog post („Продукти:“ /
// „Начин на приготвяне:“, a range of servings, cups and cloves), an English recipe with cups and ounces, four
// short Bulgarian recipes for the preparation (soaked beans, a marinated steak, chicken in a fan oven, a salad), and two
// for the components (GLOSSARY: Компонент, #325): a risotto for 1 with a pesto for 5 and a pizza whose dough is for
// two. Those two must give a component and the moussaka of „bg“ (a topping for the same servings) must not; a miss is
// ✗ and exit 1. `--repeat` runs every case that many times. `--url`
// fetches and reads the page the way the api does (services/recipe-page) before the agent; its `HowToStep.image`s go
// as references (`s1`, …), and after the answer the photos the agent chose are downloaded and made JPEGs as the api
// does (`prepareStepPhotos`: public addresses, 10 MB, 10 s, at most 50 megapixels), without storing them. `--photo` makes the picture
// smaller the way the screen does (`importPhotoLayout`: long side ≤ 2000 px, a long screenshot cut into up to 8 parts,
// JPEG) and checks it the way the api does (type by its bytes, ≤ 10 MB each, ≤ 20 MB together) before sending the
// parts as images next to `{ kind: 'photo' }`; the fixture is
// src/test/fixtures/recipe-photos/banitsa.jpg. The registry is the seed ingredients.
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { parseArgs } from 'node:util';
import {
  IMPORT_PHOTO_JPEG_QUALITY,
  IMPORT_PHOTO_MAX_BYTES,
  IMPORT_PHOTO_MAX_SIDE,
  IMPORT_PHOTOS_MAX_BYTES,
  importPhotoLayout,
  preparationKind,
  preparationLabel,
  type RecipeNormalizeInput,
  type RecipeNormalizeOutput,
  type RecipeNormalizeSource,
  recipeNormalize,
  UNIT_LABELS_BG,
} from '@family/shared';
import sharp from 'sharp';
import { loadOpenClawConfig } from '../src/config.js';
import seed from '../src/db/seed/ingredients.json' with { type: 'json' };
import {
  type ContractImage,
  createOpenClawClient,
} from '../src/openclaw/client.js';
import {
  type PreparedStepPhotos,
  prepareStepPhotos,
} from '../src/services/imported-step-photos.js';
import {
  readRecipePage,
  type StepImages,
} from '../src/services/recipe-page/index.js';
import { photoType } from '../src/services/recipe-photo.js';

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

const BEANS = `Боб яхния по селски

Порции: 6

Продукти:
- 500 г бял боб
- 2 глави лук
- 2 моркова
- 1 червена чушка
- 2 с.л. доматено пюре
- 1 с.л. червен пипер
- джоджен, сол
- 5 с.л. олио

Приготвяне:
Вечерта накиснете боба в студена вода. На следващия ден изхвърлете водата, залейте с прясна и варете 15 минути. Сменете водата и варете, докато омекне, около час.
Запържете нарязания лук, морковите и чушката в олиото. Добавете червения пипер и доматеното пюре и веднага изсипете в боба.
Подправете с джоджен и сол и варете още 15 минути.`;

const STEAK = `Свински пържоли в марината на тиган

Продукти (за 4 порции):
4 свински пържоли от врат
4 с.л. олио
2 с.л. соев сос
1 с.л. горчица
3 скилидки чесън
1 ч.л. мащерка
черен пипер

Смесете олиото, соевия сос, горчицата, пресования чесън, мащерката и черния пипер. Намажете пържолите и ги оставете в хладилника да се мариноват поне 2 часа, а най-добре за една нощ.
Извадете ги от хладилника 30 минути преди печене.
Загрейте добре тежък тиган или грил тиган и печете пържолите по 4–5 минути от всяка страна. Оставете ги да починат 5 минути преди сервиране.`;

const FAN_CHICKEN = `Пиле с картофи на фурна

4 порции, 1 ч 20 мин

Продукти: 1 цяло пиле (около 1,5 кг), 1 кг картофи, 4 с.л. зехтин, 1 ч.л. червен пипер, 1 ч.л. сол, розмарин.

1. Загрейте фурната на 200 градуса с вентилатор.
2. Нарежете картофите на резени и ги разстелете в тава, намазана със зехтин. Посолете.
3. Намажете пилето със зехтин, червен пипер, сол и розмарин и го сложете върху картофите.
4. Печете на средна скара около час и 10 минути, докато пилето се зачерви и сокът му стане бистър. След 40 минути намалете на 180 градуса.`;

const RISOTTO = `Ризото с песто от босилек

Ризотото е за 1 порция, а пестото е за 5 порции: останалото се пази в буркан в хладилника до седмица или във фризера.

За ризотото (1 порция):
- 80 г ориз арборио
- 1/4 глава лук
- 1 с.л. зехтин
- 50 мл бяло вино
- 300 мл зеленчуков бульон
- 20 г пармезан
- 1 с.л. масло

За пестото (5 порции):
- 50 г пресен босилек
- 30 г кедрови ядки
- 40 г пармезан
- 1 скилидка чесън
- 100 мл зехтин
- сол на вкус

Приготвяне:
1. Пестото: запечете кедровите ядки на сух тиган 2–3 минути. Пасирайте босилека, ядките, пармезана, чесъна и солта, като наливате зехтина на тънка струя.
2. Ризотото: задушете ситно нарязания лук в зехтина 3 минути. Добавете ориза и го запържете минута, докато стане прозрачен по краищата.
3. Налейте виното и бъркайте, докато се изпари. Добавяйте горещия бульон черпак по черпак, като бъркате, около 18 минути.
4. Свалете от огъня, вмъкнете маслото и пармезана и сервирайте с 2 с.л. от пестото отгоре.`;

const PIZZA = `Пица Маргарита на тава

Тестото е за 2 пици: втората топка тесто се замразява. Плънката е за 1 пица (2 порции).

Тесто (за 2 пици):
- 500 г брашно тип 00
- 325 мл хладка вода
- 7 г суха мая
- 10 г сол
- 2 с.л. зехтин

Плънка (за 1 пица):
- 100 г доматено пюре
- 125 г моцарела
- няколко листа босилек
- 1 с.л. зехтин
- щипка сол

1. Разтворете маята във водата, добавете брашното, солта и зехтина и месете 10 минути до гладко тесто. Оставете да втаса покрито 2 часа.
2. Разделете тестото на две топки. Едната увийте във фолио и я замразете.
3. Загрейте фурната на 250 градуса без вентилатор. Разточете другата топка в намазнена тава.
4. Намажете с доматеното пюре, посолете, наредете моцарелата и полейте със зехтина.
5. Печете 10–12 минути на долна скара, докато краищата се зачервят. Поръсете с босилек.`;

const SALAD = `Шопска салата

Продукти за 2 порции: 3 домата, 1 краставица, 1 печена чушка, половин глава лук, 150 г сирене, 2 с.л. олио, сол, магданоз.

Нарежете доматите, краставицата и чушката на кубчета, а лука на полумесеци. Смесете ги, посолете и полейте с олиото. Настържете сиренето отгоре и поръсете с магданоз.`;

/**
 * One thing to import: a name for the output and the source as the api would send it; what reading the page gave or
 * the photo as sent (`page`); why it cannot go to the agent (`fetchFailure`: a page that does not open, a photo the api
 * would refuse; then there is no source and no agent call); the pictures sent next to a photo input (`images`: one
 * photo, or the parts of a long screenshot); the URLs of a page's step photos by their references (`stepImages`).
 */
interface SmokeCase {
  name: string;
  /** GLOSSARY: Компонент — whether the recipe must have a component (`true`) or must not (`false`); unchecked when absent. */
  component?: boolean;
  source?: RecipeNormalizeSource;
  page?: string;
  fetchFailure?: string;
  images?: ContractImage[];
  stepImages?: StepImages;
}

const BUILT_IN: SmokeCase[] = [
  {
    name: 'bg',
    // The moussaka's topping („За заливката“) is for the same servings: never a component.
    component: false,
    source: {
      kind: 'text',
      text: BULGARIAN_BLOG,
      url: 'https://blog.example/musaka-kato-na-baba',
    },
  },
  { name: 'en', source: { kind: 'text', text: ENGLISH_RECIPE } },
  // Preparation (#283): soaking from the evening, a marinade and the fridge without an oven, an oven with a fan and a
  // rack, and a dish with neither oven nor preparation; „bg“ is an oven at 200° without a mode, „en“ °F and °C.
  { name: 'beans', source: { kind: 'text', text: BEANS } },
  { name: 'steak', source: { kind: 'text', text: STEAK } },
  { name: 'fan', source: { kind: 'text', text: FAN_CHICKEN } },
  { name: 'salad', source: { kind: 'text', text: SALAD } },
  // Components (#325): a pesto for 5 next to a risotto for 1, a dough for two pizzas next to a topping for one.
  {
    name: 'risotto',
    component: true,
    source: { kind: 'text', text: RISOTTO },
  },
  { name: 'pizza', component: true, source: { kind: 'text', text: PIZZA } },
];

const USAGE = `Usage: pnpm --filter api import:smoke -- [--case <name>] [--repeat N] [--text-file <file or dir> ...] [--source-url <url>] [--url <link> ...] [--photo <file or dir> ...] [--save out.json]
  no options         the built-in cases (${BUILT_IN.map((c) => c.name).join(', ')})
  --case <name>      only that built-in case (repeatable)
  --repeat <N>       run every case N times (default 1)
  --text-file <p>    pasted text from a file, or every *.txt in a directory (repeatable); replaces the built-in cases
  --source-url <url> the source link sent with every --text-file
  --url <link>       a recipe page: fetched and read as the api does, then sent to the agent (repeatable);
                     replaces the built-in cases, goes with --text-file
  --photo <p>        a photo (jpeg, png, webp, heic), or every one in a directory (repeatable): made smaller like the
                     screen does (long side <= ${IMPORT_PHOTO_MAX_SIDE} px, a long screenshot in up to 8 parts, JPEG),
                     checked like the api does, sent as images; replaces the built-in cases, goes with --text-file
                     and --url
  --save <file>      the validated outputs by case name, as JSON
`;

const { values } = parseArgs({
  // pnpm passes the `--` of `pnpm … import:smoke -- --case bg` through.
  args: process.argv.slice(2).filter((arg) => arg !== '--'),
  options: {
    case: { type: 'string', multiple: true },
    repeat: { type: 'string' },
    'text-file': { type: 'string', multiple: true },
    'source-url': { type: 'string' },
    url: { type: 'string', multiple: true },
    photo: { type: 'string', multiple: true },
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

/** `--url`: each link is fetched and read like the api does it (final URL, JSON-LD or text), one case per link. */
async function pageCases(links: string[]): Promise<SmokeCase[]> {
  const cases: SmokeCase[] = [];
  for (const link of links) {
    const started = performance.now();
    const page = await readRecipePage(link);
    const seconds = ((performance.now() - started) / 1000).toFixed(1);
    if (!page.ok) {
      cases.push({
        name: link,
        fetchFailure: `страницата не се прочете: ${page.failure} (${page.reason}), краен URL ${page.url}, ${seconds} s`,
      });
      continue;
    }
    const refs = Object.keys(page.stepImages ?? {});
    const photos = `снимки на стъпки: ${refs.length === 0 ? 'няма' : `${refs.length} (${refs[0]}…${refs.at(-1)})`}`;
    const sent = page.jsonLd
      ? `jsonLd ${JSON.stringify(page.jsonLd).length} знака, ${photos}`
      : `text ${page.text?.length ?? 0} знака, ${photos}`;
    cases.push({
      name: link,
      page: `краен URL ${page.url}, ${sent}, свалено за ${seconds} s`,
      source: page.jsonLd
        ? { kind: 'page', url: page.url, jsonLd: page.jsonLd }
        : { kind: 'page', url: page.url, text: page.text ?? '' },
      ...(page.stepImages ? { stepImages: page.stepImages } : {}),
    });
  }
  return cases;
}

const PHOTO_FILE = /\.(jpe?g|png|webp|heic|heif)$/i;

function sizeOf(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.round(bytes / 1024)} KB`;
}

/**
 * `--photo`: each picture as the screen sends it, then as the api takes it. The screen (`resize-photo.ts` in web)
 * draws it upright by its EXIF orientation by `importPhotoLayout` (at most 2000 px on the long side; a long screenshot
 * at most 1200 px wide in up to 8 overlapping parts), as JPEG; a picture the browser cannot decode (HEIC outside
 * Safari) goes as it is, and so here a picture sharp cannot decode. The api reads the type from the bytes and refuses
 * over 10 MB a part or 20 MB together (413) or not a picture (415): such a case fails here without an agent call.
 */
async function photoCases(paths: string[]): Promise<SmokeCase[]> {
  const files: string[] = [];
  for (const path of paths) {
    if ((await stat(path)).isDirectory()) {
      const names = (await readdir(path)).filter((n) => PHOTO_FILE.test(n));
      files.push(...names.sort().map((n) => join(path, n)));
    } else {
      files.push(path);
    }
  }
  const cases: SmokeCase[] = [];
  for (const file of files) {
    const name = basename(file);
    const original = await readFile(file);
    let sent: Buffer[];
    let how: string;
    try {
      const upright = await sharp(original).rotate().toBuffer();
      const meta = await sharp(upright).metadata();
      const layout = importPhotoLayout(meta.width, meta.height);
      sent = await Promise.all(
        layout.tiles.map((tile) =>
          sharp(upright)
            .resize(layout.width, layout.height)
            .extract({
              left: 0,
              top: tile.top,
              width: layout.width,
              height: tile.height,
            })
            .jpeg({ quality: Math.round(IMPORT_PHOTO_JPEG_QUALITY * 100) })
            .toBuffer(),
        ),
      );
      how = `${meta.width}×${meta.height} → ${layout.width}×${layout.height} JPEG, ${layout.tiles.length} ${layout.tiles.length === 1 ? 'част' : 'части'}`;
    } catch (error) {
      sent = [original];
      how = `не се декодира (${error instanceof Error ? error.message : String(error)}), праща се както е`;
    }
    const types = sent.map((part) => photoType(part));
    const total = sent.reduce((sum, part) => sum + part.length, 0);
    const size = `снимка ${sizeOf(original.length)} → изпратена ${sizeOf(total)} ${types[0] ?? '?'}, ${how}`;
    if (types.some((type) => !type)) {
      cases.push({
        name,
        fetchFailure: `${size}: api-то ще върне 415 unsupported_photo`,
      });
    } else if (
      sent.some((part) => part.length > IMPORT_PHOTO_MAX_BYTES) ||
      total > IMPORT_PHOTOS_MAX_BYTES
    ) {
      cases.push({
        name,
        fetchFailure: `${size}: api-то ще върне 413 photo_too_large`,
      });
    } else {
      cases.push({
        name,
        page: size,
        source: { kind: 'photo' },
        images: sent.map((data, index) => ({
          mediaType: types[index] ?? 'image/jpeg',
          data,
        })),
      });
    }
  }
  return cases;
}

/**
 * The cases to run. Each kind of source adds its own option and builder here (`--url` a page by link, `--photo` a
 * picture); the loop below runs whatever cases there are.
 */
async function selectCases(): Promise<SmokeCase[]> {
  if (values.help) {
    usage();
  }
  if (values['text-file'] || values.url || values.photo) {
    const cases = [
      ...(values['text-file']
        ? await textFileCases(values['text-file'], values['source-url'])
        : []),
      ...(values.url ? await pageCases(values.url) : []),
      ...(values.photo ? await photoCases(values.photo) : []),
    ];
    if (cases.length === 0) {
      usage('No *.txt files or photos found.');
    }
    return cases;
  }
  if (values['source-url']) {
    usage('--source-url goes with --text-file.');
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
const repeat = values.repeat === undefined ? 1 : Number(values.repeat);
if (!Number.isInteger(repeat) || repeat < 1) {
  usage('--repeat is a whole number from 1.');
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

// The registry the api would send: the seed ingredients, with made-up ids.
const ingredients = seed.ingredients.map((ingredient, index) => ({
  id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
  name: ingredient.name,
  unit: ingredient.unit as 'g' | 'ml' | 'pcs',
}));
const names = new Map(ingredients.map((i) => [i.id, i.name]));

/** What a step's photo became: the reference and its download, as the api would store it or drop it. */
function stepPhoto(
  image: string | null,
  stepImages: StepImages | undefined,
  photos: Map<string, string>,
): string {
  if (image === null) {
    return '';
  }
  if (!stepImages || !Object.hasOwn(stepImages, image)) {
    return ` [${image}: няма я във входа, api-то я пренебрегва]`;
  }
  return ` [снимка ${image}: ${photos.get(image) ?? '?'}]`;
}

/** The prepared photos as the api would store them: the JPEG made of a picture, or dropped. */
async function checkedPhotos(
  prepared: PreparedStepPhotos,
  stepImages: StepImages,
): Promise<{ photos: Map<string, string>; dropped: number }> {
  const photos = new Map<string, string>();
  let dropped = 0;
  for (const [ref, jpeg] of prepared) {
    const url = stepImages[ref];
    if (!jpeg) {
      dropped++;
      photos.set(
        ref,
        `✗ не се свали, не е снимка или не се декодира, изпуска се (${url})`,
      );
      continue;
    }
    const meta = await sharp(jpeg).metadata();
    photos.set(
      ref,
      `✓ JPEG ${sizeOf(jpeg.length)} ${meta.width}×${meta.height} (${url})`,
    );
  }
  return { photos, dropped };
}

function summary(
  output: RecipeNormalizeOutput,
  seconds: string,
  stepImages?: StepImages,
  photos: Map<string, string> = new Map(),
  dropped = 0,
): string {
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
    const component =
      line.component === null
        ? ''
        : ` [${recipe.components[line.component]?.name ?? `компонент ${line.component}`}]`;
    return `   - ${product}: ${amount}${line.note ? ` (${line.note})` : ''}${component}`;
  });
  const newCount = recipe.ingredients.filter((line) => line.newProduct).length;
  return [
    `${recipe.title} (${recipe.servings} порции, ${recipe.prepMinutes ?? '?'} мин, ${recipe.tags.join(', ') || 'без тагове'})`,
    `   Допускания: ${recipe.assumptions || '—'}`,
    `   Компоненти: ${recipe.components.length === 0 ? 'няма' : recipe.components.map((c) => `${c.name} · за ${c.servings} порции (${recipe.ingredients.filter((line) => line.component === recipe.components.indexOf(c)).length} реда)`).join('; ')}`,
    `   Продукти: ${recipe.ingredients.length}, нови: ${newCount}`,
    ...lines,
    `   Стъпки: ${recipe.steps.length}, със снимка: ${recipe.steps.filter((step) => step.image !== null).length} (на страницата ${Object.keys(stepImages ?? {}).length}, изпуснати ${dropped})`,
    ...recipe.steps.map(
      (step, index) =>
        `   ${index + 1}. ${step.text}${stepPhoto(step.image, stepImages, photos)}`,
    ),
    `   Подготовка: ${recipe.preparation.length === 0 ? 'няма' : recipe.preparation.length}`,
    ...recipe.preparation.map(
      (item) =>
        `   - ${preparationKind(item.kind).labelBg}: ${preparationLabel(item)}`,
    ),
    `   Хранителна стойност на 100 г: ${recipe.nutritionPer100g ? JSON.stringify(recipe.nutritionPer100g) : 'няма'}`,
    `   за ${seconds} s`,
    '',
  ].join('\n');
}

const saved: Record<string, RecipeNormalizeOutput> = {};
let failed = false;
/** What the agent gets, in short: the size of the text or JSON-LD and the link, or the parts of the photo. */
function described(
  source: RecipeNormalizeSource,
  images: ContractImage[] | undefined,
): string {
  if (source.kind === 'photo') {
    return `снимка ${images ? images.map((image) => sizeOf(image.data.length)).join(' + ') : '—'}`;
  }
  const size =
    source.kind === 'page' && source.jsonLd !== undefined
      ? `jsonLd ${JSON.stringify(source.jsonLd).length} знака`
      : `${source.text?.length ?? 0} знака`;
  return `${size}${source.url ? `, ${source.url}` : ''}`;
}

/** `✓`/`✗` for the expected component of a case (GLOSSARY: Компонент), or nothing when it has none. */
function componentCheck(
  expected: boolean | undefined,
  output: RecipeNormalizeOutput,
): { line: string; ok: boolean } {
  if (expected === undefined) {
    return { line: '', ok: true };
  }
  const has = (output.recipe?.components.length ?? 0) > 0;
  const ok = has === expected && output.recipe !== null;
  const want = expected ? 'трябва компонент' : 'не трябва компонент';
  return {
    line: `   Компонент: ${ok ? '✓' : '✗'} ${want}, ${has ? 'има' : 'няма'}\n`,
    ok,
  };
}

const runs = cases.flatMap((c) =>
  Array.from({ length: repeat }, (_, run) =>
    repeat === 1 ? c : { ...c, name: `${c.name} #${run + 1}` },
  ),
);

for (const {
  name,
  component,
  source,
  page,
  fetchFailure,
  images,
  stepImages,
} of runs) {
  if (fetchFailure !== undefined || !source) {
    failed = true;
    process.stdout.write(`[${name}] ✗ ${fetchFailure}\n\n`);
    continue;
  }
  if (page) {
    process.stdout.write(`[${name}] ${page}\n`);
  }
  const input: RecipeNormalizeInput = { source, ingredients };
  const leaked = Object.values(stepImages ?? {}).filter((url) =>
    JSON.stringify(input).includes(url),
  );
  if (leaked.length > 0) {
    failed = true;
    process.stdout.write(
      `[${name}] ✗ URL на снимка на стъпка е във входа на агента: ${leaked.join(', ')}\n\n`,
    );
    continue;
  }
  process.stderr.write(
    `→ ${config.url} openclaw/${config.importAgent}, timeout ${config.timeoutMs} ms, ${name}: ${described(source, images)}, ${ingredients.length} продукта в регистъра\n`,
  );
  const started = performance.now();
  try {
    const output = await client.complete(recipeNormalize, input, {
      agent: config.importAgent,
      ...(images ? { images } : {}),
    });
    const seconds = ((performance.now() - started) / 1000).toFixed(1);
    const checked =
      stepImages && output.recipe
        ? await checkedPhotos(
            await prepareStepPhotos(
              stepImages,
              output.recipe.steps,
              AbortSignal.timeout(60_000),
            ),
            stepImages,
          )
        : { photos: new Map<string, string>(), dropped: 0 };
    const expected = componentCheck(component, output);
    if (!expected.ok) {
      failed = true;
    }
    process.stdout.write(
      `[${name}] ${summary(output, seconds, stepImages, checked.photos, checked.dropped)}${expected.line}\n`,
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
