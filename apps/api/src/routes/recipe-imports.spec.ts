import { readFileSync } from 'node:fs';
import {
  approvedSuggestionResponseSchema,
  type ImportedSuggestion,
  type RecipeImportDetail,
  type RecipeImportRequest,
  type RecipeInput,
  type RecipeNormalizeInput,
  recipeImportDetailSchema,
  recipeImportRequestSchema,
  STEP_PHOTO_MAX_BYTES,
} from '@family/shared';
import normalizeFixture from '@family/shared/fixtures/recipe-normalize.valid.json' with {
  type: 'json',
};
import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { HttpResponse, http } from 'msw';
import sharp from 'sharp';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp } from '../test/app.js';
import {
  CHAT_COMPLETIONS_URL,
  completion,
  normalizeAnswer,
  openclaw,
} from '../test/openclaw.js';
import { hugePng } from '../test/photos.js';
import { DANI, POLI } from '../test/users.js';

let app: FastifyInstance;

beforeAll(async () => {
  openclaw.listen({ onUnhandledFrame: 'error' });
  app = buildTestApp();
  await app.ready();
});

afterEach(() => openclaw.resetHandlers());

afterAll(async () => {
  await app.close();
  openclaw.close();
});

const headers = { 'x-acting-user': DANI.id };

const BLOG_TEXT = `Пилешки гърди с ориз на фурна

Продукти:
- 600 г пилешки гърди
- 1 чаша ориз
- 1 ч.л. смлян сумак

Начин на приготвяне:
Нарежете пилето. Добавете ориза и печете 30 минути.`;

function postImport(payload: object) {
  return app.inject({
    method: 'POST',
    url: '/api/recipe-imports',
    headers,
    payload,
  });
}

function getImport(id: string) {
  return app.inject({
    method: 'GET',
    url: `/api/recipe-imports/${id}`,
    headers,
  });
}

async function imported(payload: object): Promise<RecipeImportRequest> {
  const response = await postImport(payload);
  expect(response.statusCode).toBe(202);
  return recipeImportRequestSchema.parse(response.json().request);
}

/** Polls `GET /api/recipe-imports/:id` until the background run has finished. */
async function finished(
  request: RecipeImportRequest,
  timeoutMs = 5_000,
): Promise<RecipeImportDetail> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const response = await getImport(request.id);
    expect(response.statusCode).toBe(200);
    const body = recipeImportDetailSchema.parse(response.json());
    if (body.request.status !== 'pending') {
      return body;
    }
    if (Date.now() > deadline) {
      throw new Error(`import ${request.id} still pending`);
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

interface ChatBody {
  model: string;
  messages: { role: string; content: string | ContentPart[] }[];
  response_format: { json_schema: { name: string } };
}

/** The text of a message: its content, or its text part when it has images too. */
function textOf(message: ChatBody['messages'][number] | undefined): string {
  const content = message?.content ?? '';
  if (typeof content === 'string') {
    return content;
  }
  return content.find((part) => part.type === 'text')?.text ?? '';
}

/** The `image_url` parts of a message. */
function imagesOf(message: ChatBody['messages'][number] | undefined) {
  const content = message?.content ?? '';
  return typeof content === 'string'
    ? []
    : content.flatMap((part) =>
        part.type === 'image_url' ? [part.image_url.url] : [],
      );
}

/** Answers the chat completions in turn, each built from the contract input; returns the request bodies it got. */
function answerInTurn(
  ...answers: ((input: RecipeNormalizeInput) => unknown)[]
) {
  const bodies: ChatBody[] = [];
  openclaw.use(
    http.post(CHAT_COMPLETIONS_URL, async ({ request }) => {
      const body = (await request.json()) as ChatBody;
      bodies.push(body);
      const input = JSON.parse(textOf(body.messages[0]));
      const answer = answers[bodies.length - 1] ?? answers.at(-1);
      return HttpResponse.json(
        completion(JSON.stringify(answer?.(input) ?? '')),
      );
    }),
  );
  return { bodies };
}

/** The recorded answer with a line linked to an id the registry does not have. */
function withForeignId(input: RecipeNormalizeInput) {
  const answer = normalizeAnswer(input);
  const line = answer.recipe?.ingredients[1];
  if (line) {
    line.ingredientId = 'f0000000-0000-4000-8000-000000000099';
  }
  return answer;
}

describe('POST /api/recipe-imports', () => {
  it('answers 202 with a pending text import, then the run stores one suggestion linked to the registry', async () => {
    const calls = answerInTurn(normalizeAnswer);

    const request = await imported({
      kind: 'text',
      text: BLOG_TEXT,
      url: 'https://blog.example/pile-s-oriz',
    });

    expect(request).toMatchObject({
      status: 'pending',
      source: 'text',
      url: 'https://blog.example/pile-s-oriz',
      requestedBy: DANI.id,
    });
    expect(request).not.toHaveProperty('suggestionId');

    const body = await finished(request);

    // The source is kept for „Опитай пак“; the list does not carry it.
    expect(body.text).toBe(BLOG_TEXT);

    expect(body.request).toMatchObject({
      id: request.id,
      status: 'done',
      title: 'Пилешко филе с ориз на фурна',
    });
    expect(body.request.finishedAt).toEqual(expect.any(String));
    const suggestion = body.suggestion as ImportedSuggestion;
    expect(suggestion).toMatchObject({
      origin: 'import',
      importRequestId: request.id,
      status: 'proposed',
      payload: { title: 'Пилешко филе с ориз на фурна', servings: 4 },
    });
    // The contract's steps of text are stored as step objects, in order and without photos.
    expect(suggestion.payload.steps).toEqual([
      { text: 'Нарежете пилето на хапки и го овкусете със сол и сумак.' },
      { text: 'Запечете го за 10 минути.' },
      {
        text: 'Добавете ориза и чесъна, залейте с 2 чаши вода и печете още 30 минути на 200 градуса.',
      },
    ]);
    expect(body.request.suggestionId).toBe(suggestion.id);
    expect(suggestion.payload).not.toHaveProperty('nutritionPer100g');
    // The registry ingredients the lines are linked to, for the review; the new product is not among them.
    const linked = suggestion.payload.ingredients.flatMap((line) =>
      line.ingredientId ? [line.ingredientId] : [],
    );
    expect(body.ingredients.map((i) => i.id).sort()).toEqual(
      [...new Set(linked)].sort(),
    );
    expect(body.ingredients.map((i) => i.name)).toEqual(
      expect.arrayContaining(['пилешко филе', 'ориз', 'сол']),
    );
    expect(
      suggestion.payload.ingredients.find((line) => line.newProduct),
    ).toMatchObject({
      ingredientId: null,
      newProduct: { name: 'сумак', unit: 'g', aisle: 'spices' },
    });

    // The family-import agent with the recipe.normalize contract: the text and the whole registry.
    expect(calls.bodies).toHaveLength(1);
    const [call] = calls.bodies;
    expect(call?.model).toBe('openclaw/family-import');
    expect(call?.response_format.json_schema.name).toBe('recipe_normalize');
    const input = JSON.parse(textOf(call?.messages[0]));
    expect(input.source).toEqual({
      kind: 'text',
      text: BLOG_TEXT,
      url: 'https://blog.example/pile-s-oriz',
    });
    expect(input.ingredients).toContainEqual({
      id: expect.any(String),
      name: 'сол',
      unit: 'g',
    });
    expect(input.ingredients.length).toBeGreaterThan(100);
  });

  it('refuses empty text, text over 20 000 characters and an unknown kind of source', async () => {
    expect((await postImport({ kind: 'text', text: '  ' })).statusCode).toBe(
      400,
    );
    expect(
      (await postImport({ kind: 'text', text: 'а'.repeat(20_001) })).statusCode,
    ).toBe(400);
    expect(
      (await postImport({ kind: 'video', url: 'https://example.com' }))
        .statusCode,
    ).toBe(400);
  });
});

/** A saved page from `src/test/fixtures/recipe-pages/`. */
function savedPage(name: string): string {
  return readFileSync(
    new URL(`../test/fixtures/recipe-pages/${name}`, import.meta.url),
    'utf8',
  );
}

const SHORT_LINK = 'https://short.example/kebap';
const KEBAP_URL = 'https://kuhnia.example/recipes/knizhen-kebap/';
const BLOG_URL = 'https://gladni.example/2024/07/tavche-gravche.html';
/** {@link KEBAP_URL} as the import keeps it: without the trailing `/`. */
const KEBAP_SOURCE = 'https://kuhnia.example/recipes/knizhen-kebap';
const CYRILLIC_URL = 'https://recepti.example/r-1-Баница';

/** The recipe sites, at HTTP level: a short link redirecting to a JSON-LD page, a blog without one, a blocking site. */
function serveSites() {
  const fetched: string[] = [];
  const page = (body: string) => () =>
    new HttpResponse(body, {
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  openclaw.use(
    http.all('*', ({ request }) => {
      if (request.url !== CHAT_COMPLETIONS_URL) {
        fetched.push(request.url);
      }
    }),
    http.get(SHORT_LINK, () => HttpResponse.redirect(KEBAP_URL, 301)),
    http.get(KEBAP_URL, page(savedPage('jsonld-graph.html'))),
    http.get(BLOG_URL, page(savedPage('bg-blog.html'))),
    http.get(
      'https://recepti.example/r-1-%D0%91%D0%B0%D0%BD%D0%B8%D1%86%D0%B0',
      page(savedPage('jsonld-graph.html')),
    ),
    http.get(
      'https://blocked.example/recipe',
      () =>
        new HttpResponse('<title>Just a moment...</title>', {
          status: 403,
          headers: { 'content-type': 'text/html', 'cf-mitigated': 'challenge' },
        }),
    ),
    http.get(
      'https://gone.example/recipe',
      () => new HttpResponse('Not found', { status: 404 }),
    ),
  );
  return { fetched };
}

describe('an import by link', () => {
  it('fetches the page, follows the redirect and sends the agent its JSON-LD recipe; the final URL is the source', async () => {
    serveSites();
    const calls = answerInTurn(normalizeAnswer);

    const request = await imported({ kind: 'url', url: SHORT_LINK });

    expect(request).toMatchObject({
      status: 'pending',
      source: 'url',
      url: SHORT_LINK,
    });
    const body = await finished(request);
    expect(body.request).toMatchObject({ status: 'done', url: KEBAP_SOURCE });
    expect(body.text).toBeUndefined();
    expect(body.suggestion).toMatchObject({ status: 'proposed' });

    expect(calls.bodies).toHaveLength(1);
    const input = JSON.parse(textOf(calls.bodies[0]?.messages[0]));
    expect(input.source).toEqual({
      kind: 'page',
      url: KEBAP_SOURCE,
      jsonLd: expect.objectContaining({
        '@type': 'Recipe',
        name: 'Книжен кебап с гъби',
        recipeIngredient: expect.arrayContaining(['300 gram гъби']),
      }),
    });
    expect(input.ingredients.length).toBeGreaterThan(100);
  });

  it('keeps the final URL without utm, # and trailing /, its Cyrillic escaped once', async () => {
    serveSites();
    answerInTurn(normalizeAnswer);

    const body = await finished(
      await imported({
        kind: 'url',
        url: `${CYRILLIC_URL}/?utm_source=viber#comments`,
      }),
    );

    expect(body.request).toMatchObject({
      status: 'done',
      url: 'https://recepti.example/r-1-%D0%91%D0%B0%D0%BD%D0%B8%D1%86%D0%B0',
    });
  });

  it('keeps the link that came with pasted text without utm and #', async () => {
    answerInTurn(normalizeAnswer);

    const request = await imported({
      kind: 'text',
      text: BLOG_TEXT,
      url: `${KEBAP_URL}?utm_source=facebook#comments`,
    });

    expect(request.url).toBe(KEBAP_SOURCE);
    await finished(request);
  });

  it('sends the main text of a page without a JSON-LD recipe', async () => {
    serveSites();
    const calls = answerInTurn(normalizeAnswer);

    const body = await finished(await imported({ kind: 'url', url: BLOG_URL }));

    expect(body.request.status).toBe('done');
    const { source } = JSON.parse(textOf(calls.bodies[0]?.messages[0]));
    expect(source).toMatchObject({ kind: 'page', url: BLOG_URL });
    expect(source).not.toHaveProperty('jsonLd');
    expect(source.text).toContain('Необходими продукти (за 4 порции):');
    expect(source.text).not.toContain('Архив на блога');
  });

  it('fails fetch_blocked for a site that refuses, and fetch_failed for a page that does not open, without asking OpenClaw', async () => {
    serveSites();
    const calls = answerInTurn(normalizeAnswer);

    const blocked = await finished(
      await imported({ kind: 'url', url: 'https://blocked.example/recipe' }),
    );
    const gone = await finished(
      await imported({ kind: 'url', url: 'https://gone.example/recipe' }),
    );

    expect(blocked.request).toMatchObject({
      status: 'failed',
      error: 'fetch_blocked',
      url: 'https://blocked.example/recipe',
    });
    expect(gone.request).toMatchObject({
      status: 'failed',
      error: 'fetch_failed',
    });
    expect(calls.bodies).toHaveLength(0);
  });

  it('refuses a link that is not http(s)', async () => {
    expect(
      (await postImport({ kind: 'url', url: 'file:///etc/passwd' })).statusCode,
    ).toBe(400);
  });
});

/** The photo fixture: a cookbook page, made for the purpose (`src/test/fixtures/recipe-photos/`). */
const PHOTO = readFileSync(
  new URL('../test/fixtures/recipe-photos/banitsa.jpg', import.meta.url),
);

/** `POST /api/recipe-imports` as the screen sends a photo: multipart with one file in the field `photo`. */
function postPhoto(bytes: Uint8Array, type = 'image/jpeg', field = 'photo') {
  const form = new FormData();
  form.append(field, new Blob([bytes], { type }), 'photo.jpg');
  return postForm(form);
}

/** The parts of a long screenshot: one file each, all in the field `photo`, top to bottom. */
function postPhotos(parts: Uint8Array[]) {
  const form = new FormData();
  parts.forEach((bytes, index) => {
    form.append(
      'photo',
      new Blob([bytes], { type: 'image/jpeg' }),
      `part-${index + 1}.jpg`,
    );
  });
  return postForm(form);
}

/** A JPEG of `size` bytes: the fixture's start, then zeros. */
function jpegOf(size: number): Buffer {
  const bytes = Buffer.alloc(size);
  PHOTO.copy(bytes);
  return bytes;
}

function postForm(form: FormData) {
  return app.inject({
    method: 'POST',
    url: '/api/recipe-imports',
    headers,
    payload: form,
  });
}

async function importedPhoto(): Promise<RecipeImportRequest> {
  const response = await postPhoto(PHOTO);
  expect(response.statusCode).toBe(202);
  return recipeImportRequestSchema.parse(response.json().request);
}

describe('an import by photo', () => {
  it('sends the photo as an image_url part of the last message, next to the input with a photo source', async () => {
    const calls = answerInTurn(normalizeAnswer);

    const request = await importedPhoto();

    expect(request).toMatchObject({ status: 'pending', source: 'photo' });
    expect(request).not.toHaveProperty('url');
    const body = await finished(request);
    expect(body.request.status).toBe('done');
    expect(body).not.toHaveProperty('text');
    expect(body.suggestion?.payload.title).toBe('Пилешко филе с ориз на фурна');

    expect(calls.bodies).toHaveLength(1);
    const messages = calls.bodies[0]?.messages ?? [];
    expect(messages).toHaveLength(1);
    const input = JSON.parse(textOf(messages[0]));
    expect(input.source).toEqual({ kind: 'photo' });
    expect(input.ingredients.length).toBeGreaterThan(100);
    expect(imagesOf(messages[0])).toEqual([
      `data:image/jpeg;base64,${PHOTO.toString('base64')}`,
    ]);
  });

  it('sends the parts of a long screenshot as image_url parts in their order, and again with the retry', async () => {
    const calls = answerInTurn(withForeignId, normalizeAnswer);
    const parts = [jpegOf(PHOTO.length + 1), PHOTO, jpegOf(PHOTO.length + 2)];

    const response = await postPhotos(parts);

    expect(response.statusCode).toBe(202);
    const body = await finished(response.json().request);
    expect(body.request.status).toBe('done');
    const sent = parts.map(
      (part) => `data:image/jpeg;base64,${part.toString('base64')}`,
    );
    expect(imagesOf(calls.bodies[0]?.messages[0])).toEqual(sent);
    expect(calls.bodies).toHaveLength(2);
    const retry = calls.bodies[1]?.messages ?? [];
    expect(imagesOf(retry.at(-1))).toEqual(sent);
  });

  it('answers 400 for more than 8 parts, without a request', async () => {
    const calls = answerInTurn(normalizeAnswer);

    const response = await postPhotos(Array.from({ length: 9 }, () => PHOTO));

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: 'validation_error' });
    expect(calls.bodies).toHaveLength(0);
  });

  it('answers 413 photo_too_large for parts over 20 MB together, without a request', async () => {
    const calls = answerInTurn(normalizeAnswer);
    const part = jpegOf(7 * 1024 * 1024);

    const response = await postPhotos([part, part, part]);

    expect(response.statusCode).toBe(413);
    expect(response.json()).toEqual({
      error: 'photo_too_large',
      message: 'Снимките са над 20 MB общо. Опитай с по-малка.',
    });
    expect(calls.bodies).toHaveLength(0);
  });

  it('takes the type from the picture itself, not from what the phone says', async () => {
    const calls = answerInTurn(normalizeAnswer);
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    );

    const response = await postPhoto(png, 'application/octet-stream');

    expect(response.statusCode).toBe(202);
    await finished(recipeImportRequestSchema.parse(response.json().request));
    expect(imagesOf(calls.bodies[0]?.messages[0])).toEqual([
      `data:image/png;base64,${png.toString('base64')}`,
    ]);
  });

  it('keeps nothing of the photo: no column holds its bytes', async () => {
    answerInTurn(normalizeAnswer);

    const request = await importedPhoto();
    await finished(request);

    const result = await app.db.execute(
      sql`select row_to_json(r)::text as row from recipe_import_request r where id = ${request.id}`,
    );
    const row = String(result.rows[0]?.row);
    expect(row).toContain('"source":"photo"');
    expect(row).toContain('"text":null');
    expect(row).toContain('"url":null');
    expect(row).not.toContain(PHOTO.subarray(0, 64).toString('base64'));
  });

  it('answers 413 photo_too_large for a photo over 10 MB, without a request', async () => {
    const calls = answerInTurn(normalizeAnswer);
    const big = Buffer.alloc(10 * 1024 * 1024 + 1);
    PHOTO.copy(big);

    const response = await postPhoto(big);

    expect(response.statusCode).toBe(413);
    expect(response.json()).toEqual({
      error: 'photo_too_large',
      message: 'Снимката е над 10 MB. Опитай с по-малка.',
    });
    expect(calls.bodies).toHaveLength(0);
    const list = await app.inject({
      method: 'GET',
      url: '/api/recipe-imports',
      headers,
    });
    expect(list.json().requests).toEqual([]);
  });

  it('answers 415 unsupported_photo for a file that is not a JPEG, PNG, WebP or HEIC picture', async () => {
    const gif = Buffer.from('GIF89a\x01\x00\x01\x00\x00\x00\x00;', 'latin1');
    const pdf = Buffer.from('%PDF-1.7\n%…', 'utf8');

    for (const [bytes, type] of [
      [gif, 'image/gif'],
      [pdf, 'image/jpeg'],
    ] as const) {
      const response = await postPhoto(bytes, type);
      expect(response.statusCode).toBe(415);
      expect(response.json()).toMatchObject({ error: 'unsupported_photo' });
    }
  });

  it('answers 400 for a form without the photo', async () => {
    const response = await postPhoto(PHOTO, 'image/jpeg', 'picture');

    expect(response.statusCode).toBe(400);
  });
});

const SHAKSHUKA_URL = 'https://panandplate.example/shakshuka/';
const STEP_PHOTO = {
  s1: 'https://panandplate.example/wp-content/uploads/shakshuka-step-1.jpg',
  s2: 'https://panandplate.example/wp-content/uploads/shakshuka-step-3.jpg',
  s3: 'https://cdn.panandplate.example/shakshuka-step-4.webp',
};

/** A picture `width` pixels wide, so a stored photo tells which one of the page it is. */
function pictureOf(width: number, format: 'jpeg' | 'webp' = 'jpeg') {
  return sharp({
    create: { width, height: 300, channels: 3, background: '#c63' },
  })
    .toFormat(format)
    .toBuffer();
}

/**
 * The page with photos of its steps (`jsonld-step-images.html`), the photos at their URLs as `photos` answers them,
 * and the URLs fetched besides the agent.
 */
function serveShakshuka(
  photos: Record<string, () => Response | Promise<Response>>,
  html = savedPage('jsonld-step-images.html'),
) {
  const fetched: string[] = [];
  openclaw.use(
    http.all('*', ({ request }) => {
      if (request.url !== CHAT_COMPLETIONS_URL) {
        fetched.push(request.url);
      }
    }),
    http.get(
      SHAKSHUKA_URL,
      () =>
        new HttpResponse(html, {
          headers: { 'content-type': 'text/html; charset=utf-8' },
        }),
    ),
    ...Object.entries(photos).map(([url, answer]) => http.get(url, answer)),
  );
  return { fetched };
}

async function imageResponse(width: number, format: 'jpeg' | 'webp' = 'jpeg') {
  return new HttpResponse(await pictureOf(width, format), {
    headers: { 'content-type': `image/${format}` },
  });
}

/** The recorded answer with `steps`: the agent's own, each with the page's photo reference it chose, or null. */
function withSteps(steps: { text: string; image: string | null }[]) {
  return (input: RecipeNormalizeInput) => {
    const answer = normalizeAnswer(input) as ReturnType<
      typeof normalizeAnswer
    > & { recipe: { steps: unknown; assumptions: string } };
    answer.recipe.steps = steps;
    return answer;
  };
}

/** How wide the stored step photo is (each photo of the page has its own width). */
async function storedWidth(photoId: string | undefined): Promise<number> {
  const response = await app.inject({
    method: 'GET',
    url: `/api/step-photos/${photoId}`,
  });
  expect(response.statusCode).toBe(200);
  return (await sharp(response.rawPayload).metadata()).width;
}

describe('an import by link with photos of its steps', () => {
  it('stores the photos the agent chose at its own steps, also merged and split, and never sends it a photo URL', async () => {
    const site = serveShakshuka({
      [STEP_PHOTO.s1]: () => imageResponse(410),
      [STEP_PHOTO.s2]: () => imageResponse(420),
      [STEP_PHOTO.s3]: () => imageResponse(430, 'webp'),
    });
    const calls = answerInTurn(
      withSteps([
        {
          text: 'Загрейте зехтина, задушете лука и пипера 5 минути, после добавете чесъна и кимиона за 1 минута.',
          image: 's1',
        },
        { text: 'Добавете доматите и варете 10 минути.', image: 's2' },
        { text: 'Направете 4 гнезда в соса.', image: 's3' },
        {
          text: 'Счупете по едно яйце във всяко, покрийте и гответе 6 минути.',
          image: 's3',
        },
        { text: 'Поръсете с фетата и сервирайте.', image: null },
      ]),
    );

    const body = await finished(
      await imported({ kind: 'url', url: SHAKSHUKA_URL }),
    );

    expect(body.request.status).toBe('done');
    const steps = body.suggestion?.payload.steps ?? [];
    expect(steps.map((step) => step.text)).toHaveLength(5);
    expect(await storedWidth(steps[0]?.photoId)).toBe(410);
    expect(await storedWidth(steps[1]?.photoId)).toBe(420);
    expect(await storedWidth(steps[2]?.photoId)).toBe(430);
    expect(steps[3]?.photoId).toBe(steps[2]?.photoId);
    expect(steps[4]).not.toHaveProperty('photoId');
    expect(body.suggestion?.payload.assumptions).toBe(
      normalizeFixture.recipe.assumptions,
    );

    const sent = textOf(calls.bodies[0]?.messages[0]);
    expect(sent).not.toContain('shakshuka-step');
    expect(sent).not.toContain('wp-content');
    expect(
      JSON.parse(sent).source.jsonLd.recipeInstructions[0].steps[0],
    ).toEqual({
      text: 'Heat the olive oil in a skillet and cook the onion and the pepper for 5 minutes.',
      image: 's1',
    });
    expect(site.fetched).toEqual([SHAKSHUKA_URL, ...Object.values(STEP_PHOTO)]);
  });

  it('fetches only the photos the agent chose and ignores a reference the page does not have', async () => {
    const site = serveShakshuka({
      [STEP_PHOTO.s1]: () => imageResponse(410),
      [STEP_PHOTO.s2]: () => imageResponse(420),
      [STEP_PHOTO.s3]: () => imageResponse(430, 'webp'),
    });
    answerInTurn(
      withSteps([
        { text: 'Задушете лука и пипера.', image: 's9' },
        { text: 'Добавете доматите.', image: 's2' },
      ]),
    );

    const body = await finished(
      await imported({ kind: 'url', url: SHAKSHUKA_URL }),
    );

    const steps = body.suggestion?.payload.steps ?? [];
    expect(steps[0]).toEqual({ text: 'Задушете лука и пипера.' });
    expect(await storedWidth(steps[1]?.photoId)).toBe(420);
    expect(site.fetched).toEqual([SHAKSHUKA_URL, STEP_PHOTO.s2]);
    expect(body.suggestion?.payload.assumptions).not.toContain('сним');
  });

  it('leaves a step without its photo when it is 404, not a picture or too large, and says how many in the note', async () => {
    serveShakshuka({
      [STEP_PHOTO.s1]: () => new HttpResponse('Not found', { status: 404 }),
      [STEP_PHOTO.s2]: () =>
        new HttpResponse('<html>not a photo</html>', {
          headers: { 'content-type': 'image/jpeg' },
        }),
      [STEP_PHOTO.s3]: () =>
        new HttpResponse(Buffer.alloc(STEP_PHOTO_MAX_BYTES + 1), {
          headers: { 'content-type': 'image/webp' },
        }),
    });
    answerInTurn(
      withSteps([
        { text: 'Задушете лука и пипера.', image: 's1' },
        { text: 'Добавете доматите.', image: 's2' },
        { text: 'Счупете яйцата.', image: 's3' },
      ]),
    );

    const body = await finished(
      await imported({ kind: 'url', url: SHAKSHUKA_URL }),
    );

    expect(body.request.status).toBe('done');
    const payload = body.suggestion?.payload;
    expect(payload?.steps).toEqual([
      { text: 'Задушете лука и пипера.' },
      { text: 'Добавете доматите.' },
      { text: 'Счупете яйцата.' },
    ]);
    expect(payload?.assumptions).toMatch(
      / 3 снимки на стъпки не се свалиха\.$/,
    );
  });

  it('drops a photo of more than 50 megapixels in a small file, as one that did not download', async () => {
    const huge = await hugePng();
    serveShakshuka({
      [STEP_PHOTO.s1]: () =>
        new HttpResponse(huge, { headers: { 'content-type': 'image/png' } }),
      [STEP_PHOTO.s2]: () => imageResponse(420),
    });
    answerInTurn(
      withSteps([
        { text: 'Задушете лука и пипера.', image: 's1' },
        { text: 'Добавете доматите.', image: 's2' },
      ]),
    );

    const body = await finished(
      await imported({ kind: 'url', url: SHAKSHUKA_URL }),
    );

    const steps = body.suggestion?.payload.steps ?? [];
    expect(steps[0]).toEqual({ text: 'Задушете лука и пипера.' });
    expect(await storedWidth(steps[1]?.photoId)).toBe(420);
    expect(body.suggestion?.payload.assumptions).toMatch(
      / 1 снимка на стъпка не се свали\.$/,
    );
  });

  it('never fetches a photo at a private address: the step is without it, and the note says so', async () => {
    const site = serveShakshuka(
      {},
      savedPage('jsonld-step-images.html').replace(
        STEP_PHOTO.s1,
        'http://192.168.1.10/step-1.jpg',
      ),
    );
    answerInTurn(withSteps([{ text: 'Задушете лука и пипера.', image: 's1' }]));

    const body = await finished(
      await imported({ kind: 'url', url: SHAKSHUKA_URL }),
    );

    expect(body.suggestion?.payload.steps).toEqual([
      { text: 'Задушете лука и пипера.' },
    ]);
    expect(body.suggestion?.payload.assumptions).toMatch(
      / 1 снимка на стъпка не се свали\.$/,
    );
    expect(site.fetched).toEqual([SHAKSHUKA_URL]);
  });

  it('sends a page without JSON-LD with its photos as markers in the text, and stores the ones the agent chose', async () => {
    const story = 'https://panandplate.example/uploads/story.jpg';
    const onion = 'https://panandplate.example/uploads/onion.jpg';
    const eggs = 'https://cdn.panandplate.example/eggs.webp';
    const site = serveShakshuka(
      {
        [story]: () => imageResponse(400),
        [onion]: () => imageResponse(410),
        [eggs]: () => imageResponse(420, 'webp'),
      },
      `<html><head><title>Шакшука</title></head><body><article>
        <p>Шакшуката е закуска от Магреб.</p><img src="/uploads/story.jpg" width="800" height="600">
        <h2>Продукти</h2><ul><li>4 яйца</li><li>1 глава лук</li></ul>
        <h2>Начин на приготвяне</h2>
        <p>Задушете лука.</p><img data-src="/uploads/onion.jpg" src="data:image/gif;base64,R0lGOD">
        <p>Счупете яйцата.</p><img srcset="${eggs} 1024w, /eggs-300.webp 300w">
      </article></body></html>`,
    );
    const calls = answerInTurn(
      withSteps([
        { text: 'Задушете лука.', image: 's2' },
        { text: 'Счупете яйцата.', image: 's3' },
      ]),
    );

    const body = await finished(
      await imported({ kind: 'url', url: SHAKSHUKA_URL }),
    );

    expect(body.request.status).toBe('done');
    const steps = body.suggestion?.payload.steps ?? [];
    expect(await storedWidth(steps[0]?.photoId)).toBe(410);
    expect(await storedWidth(steps[1]?.photoId)).toBe(420);
    const { source } = JSON.parse(textOf(calls.bodies[0]?.messages[0]));
    expect(source).not.toHaveProperty('jsonLd');
    expect(source.text).toContain(
      'Шакшуката е закуска от Магреб.\n[снимка s1]\nПродукти',
    );
    expect(source.text).toContain(
      'Задушете лука.\n[снимка s2]\nСчупете яйцата.\n[снимка s3]',
    );
    expect(source.text).not.toContain('uploads');
    expect(site.fetched).toEqual([SHAKSHUKA_URL, onion, eggs]);
  });

  it('gives pasted text no photos, even when the agent names a reference', async () => {
    const site = serveShakshuka({});
    answerInTurn(withSteps([{ text: 'Нарежете пилето.', image: 's1' }]));

    const body = await finished(
      await imported({ kind: 'text', text: BLOG_TEXT }),
    );

    expect(body.suggestion?.payload.steps).toEqual([
      { text: 'Нарежете пилето.' },
    ]);
    expect(site.fetched).toEqual([]);
  });
});

describe('a link already in the registry', () => {
  /** An import by link that has run to its proposed suggestion. */
  async function proposedFrom(url: string) {
    answerInTurn(normalizeAnswer);
    const body = await finished(await imported({ kind: 'url', url }));
    if (!body.suggestion) {
      throw new Error('import without a suggestion');
    }
    return body.suggestion;
  }

  it('answers 409 already_imported with the proposed suggestion, before fetching or asking the agent', async () => {
    const sites = serveSites();
    const suggestion = await proposedFrom(KEBAP_URL);
    sites.fetched.length = 0;

    const response = await postImport({
      kind: 'url',
      url: 'https://Kuhnia.example/recipes/knizhen-kebap?utm_source=facebook#comments',
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      error: 'already_imported',
      message: expect.any(String),
      suggestion: {
        id: suggestion.id,
        title: 'Пилешко филе с ориз на фурна',
        importRequestId: suggestion.importRequestId,
      },
    });
    expect(sites.fetched).toEqual([]);
  });

  it('answers 409 for the Cyrillic form of a link imported percent-encoded', async () => {
    serveSites();
    await proposedFrom(
      'https://recepti.example/r-1-%D0%91%D0%B0%D0%BD%D0%B8%D1%86%D0%B0',
    );

    const response = await postImport({
      kind: 'url',
      url: `${CYRILLIC_URL}?utm_source=viber`,
    });

    expect(response.statusCode).toBe(409);
  });

  it('answers 409 with the recipe once the suggestion is approved, and imports again with force', async () => {
    serveSites();
    const suggestion = await proposedFrom(SHORT_LINK);
    const { title, servings, steps, tags, ingredients } = suggestion.payload;
    const approved = await app.inject({
      method: 'POST',
      url: `/api/recipe-suggestions/${suggestion.id}/approve`,
      headers,
      payload: {
        title,
        servings,
        steps,
        tags,
        sourceUrl: KEBAP_URL,
        ingredients: ingredients.flatMap((line) =>
          line.ingredientId
            ? [
                {
                  ingredientId: line.ingredientId,
                  quantity: line.quantity,
                  unit: line.unit,
                },
              ]
            : [],
        ),
      },
    });
    expect(approved.statusCode).toBe(201);
    const recipeId = approved.json().recipe.id;

    const again = await postImport({ kind: 'url', url: KEBAP_URL });

    expect(again.statusCode).toBe(409);
    expect(again.json()).toMatchObject({
      error: 'already_imported',
      recipe: { id: recipeId, title: 'Пилешко филе с ориз на фурна' },
    });
    expect(again.json()).not.toHaveProperty('suggestion');

    answerInTurn(normalizeAnswer);
    const forced = await postImport({
      kind: 'url',
      url: KEBAP_URL,
      force: true,
    });
    expect(forced.statusCode).toBe(202);
    expect((await finished(forced.json().request)).request.status).toBe('done');
  });

  it('lets a link in again once its suggestion is rejected', async () => {
    serveSites();
    const suggestion = await proposedFrom(BLOG_URL);
    await app.inject({
      method: 'POST',
      url: `/api/recipe-suggestions/${suggestion.id}/reject`,
      headers,
    });

    const again = await postImport({ kind: 'url', url: BLOG_URL });
    expect(again.statusCode).toBe(202);
    await finished(again.json().request);
  });
});

describe('a title already in the registry', () => {
  function createRecipe(title: string) {
    return app.inject({
      method: 'POST',
      url: '/api/recipes',
      headers,
      payload: {
        title,
        servings: 4,
        steps: [{ text: 'Нарежи.' }, { text: 'Печи.' }],
        tags: ['dinner'],
        ingredients: [],
      },
    });
  }

  it('gives the suggestion of a text import duplicateOf: the recipe with the same title in other case and spacing', async () => {
    const created = await createRecipe('  пилешко   ФИЛЕ с ориз на фурна ');
    expect(created.statusCode).toBe(201);
    const recipe = created.json().recipe;
    answerInTurn(normalizeAnswer);

    const body = await finished(
      await imported({ kind: 'text', text: BLOG_TEXT }),
    );

    expect(body.suggestion?.payload.title).toBe('Пилешко филе с ориз на фурна');
    expect(body.suggestion?.duplicateOf).toEqual({
      id: recipe.id,
      title: recipe.title,
    });
  });

  it('leaves duplicateOf out when no recipe has the title', async () => {
    expect((await createRecipe('Пилешко филе с картофи')).statusCode).toBe(201);
    answerInTurn(normalizeAnswer);

    const body = await finished(
      await imported({ kind: 'text', text: BLOG_TEXT }),
    );

    expect(body.suggestion).toBeDefined();
    expect(body.suggestion).not.toHaveProperty('duplicateOf');
  });
});

describe('the recipe.normalize run', () => {
  it('fails with invalid_output after two answers linking a product the registry does not have', async () => {
    const calls = answerInTurn(withForeignId);

    const body = await finished(
      await imported({ kind: 'text', text: BLOG_TEXT }),
    );

    expect(calls.bodies).toHaveLength(2);
    expect(calls.bodies[1]?.messages.at(-1)?.content).toContain(
      'f0000000-0000-4000-8000-000000000099',
    );
    expect(body.request).toMatchObject({
      status: 'failed',
      error: 'invalid_output',
    });
    expect(body.suggestion).toBeUndefined();
  });

  it('takes a valid retry after one answer with a foreign product', async () => {
    const calls = answerInTurn(withForeignId, normalizeAnswer);

    const body = await finished(
      await imported({ kind: 'text', text: BLOG_TEXT }),
    );

    expect(calls.bodies).toHaveLength(2);
    expect(body.request.status).toBe('done');
    expect(body.suggestion).toBeDefined();
  });

  it('fails with no_results when the agent says the text has no recipe, without a retry', async () => {
    const calls = answerInTurn(() => ({
      recipe: null,
      noResults: 'Текстът е статия за градинарство, не рецепта.',
    }));

    const body = await finished(
      await imported({ kind: 'text', text: 'Как се садят домати.' }),
    );

    expect(calls.bodies).toHaveLength(1);
    expect(body.request).toMatchObject({
      status: 'failed',
      error: 'no_results',
      noResults: 'Текстът е статия за градинарство, не рецепта.',
    });
    expect(body.suggestion).toBeUndefined();
  });
});

describe('GET /api/recipe-imports', () => {
  it('lists the latest imports newest first, at most limit', async () => {
    answerInTurn(normalizeAnswer);
    const first = await finished(
      await imported({ kind: 'text', text: 'Първа' }),
    );
    const second = await finished(
      await imported({ kind: 'text', text: 'Втора' }),
    );
    const third = await finished(
      await imported({ kind: 'text', text: 'Трета' }),
    );

    const response = await app.inject({
      method: 'GET',
      url: '/api/recipe-imports?limit=2',
      headers,
    });

    expect(response.statusCode).toBe(200);
    const { requests } = response.json() as {
      requests: RecipeImportRequest[];
    };
    expect(requests.map((r) => r.id)).toEqual([
      third.request.id,
      second.request.id,
    ]);
    expect(requests[0]).toMatchObject({
      status: 'done',
      title: 'Пилешко филе с ориз на фурна',
      suggestionId: third.suggestion?.id,
    });
    expect(first.request.status).toBe('done');
  });

  it('gives each text import the first line of its text (at most 80 characters), so the list tells them apart', async () => {
    answerInTurn(normalizeAnswer);
    await finished(
      await imported({
        kind: 'text',
        text: '\n  Баница с тиква и орехи  \nПродукти:\n- тиква',
      }),
    );
    await finished(await imported({ kind: 'text', text: 'а'.repeat(500) }));
    await finished(await importedPhoto());

    const response = await app.inject({
      method: 'GET',
      url: '/api/recipe-imports?limit=10',
      headers,
    });

    const { requests } = response.json() as {
      requests: RecipeImportRequest[];
    };
    expect(requests.map((r) => r.firstLine)).toEqual([
      undefined,
      'а'.repeat(80),
      'Баница с тиква и орехи',
    ]);
  });

  it('answers 404 for an unknown import', async () => {
    const response = await getImport('00000000-0000-4000-8000-000000000000');

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: 'not_found' });
  });
});

describe('deciding an imported suggestion', () => {
  async function aSuggestion() {
    answerInTurn(normalizeAnswer);
    const body = await finished(
      await imported({
        kind: 'text',
        text: BLOG_TEXT,
        url: 'https://blog.example/pile-s-oriz',
      }),
    );
    if (!body.suggestion) {
      throw new Error('import without a suggestion');
    }
    return body.suggestion;
  }

  /** What the review sends: the linked lines as they are, the new product left out (as if unlinked by the person). */
  function editedInput(suggestion: ImportedSuggestion): RecipeInput {
    const { title, servings, steps, tags, ingredients } = suggestion.payload;
    return {
      title,
      servings,
      steps,
      tags,
      sourceUrl: 'https://blog.example/pile-s-oriz',
      ingredients: ingredients.flatMap((line) =>
        line.ingredientId
          ? [
              {
                ingredientId: line.ingredientId,
                quantity: line.quantity,
                unit: line.unit,
              },
            ]
          : [],
      ),
    };
  }

  function decide(id: string, action: 'approve' | 'reject', payload?: object) {
    return app.inject({
      method: 'POST',
      url: `/api/recipe-suggestions/${id}/${action}`,
      headers: { 'x-acting-user': POLI.id },
      payload,
    });
  }

  it('approval through /api/recipe-suggestions/:id/approve creates the recipe and marks the suggestion approved', async () => {
    const suggestion = await aSuggestion();
    const input = editedInput(suggestion);

    const response = await decide(suggestion.id, 'approve', input);

    expect(response.statusCode).toBe(201);
    const { recipe, suggestion: approved } =
      approvedSuggestionResponseSchema.parse(response.json());
    expect(recipe).toMatchObject({
      title: 'Пилешко филе с ориз на фурна',
      sourceUrl: 'https://blog.example/pile-s-oriz',
    });
    expect(recipe.ingredients).toHaveLength(input.ingredients.length);
    expect(approved).toMatchObject({
      id: suggestion.id,
      origin: 'import',
      importRequestId: suggestion.importRequestId,
      status: 'approved',
      recipeId: recipe.id,
      decidedBy: POLI.id,
    });
    const detail = recipeImportDetailSchema.parse(
      (await getImport(suggestion.importRequestId)).json(),
    );
    expect(detail.suggestion).toMatchObject({
      status: 'approved',
      recipeId: recipe.id,
    });
    expect((await decide(suggestion.id, 'approve', input)).statusCode).toBe(
      409,
    );
  });

  it('rejection marks it rejected', async () => {
    const suggestion = await aSuggestion();

    const response = await decide(suggestion.id, 'reject');

    expect(response.statusCode).toBe(200);
    expect(response.json().suggestion).toMatchObject({
      id: suggestion.id,
      origin: 'import',
      status: 'rejected',
    });
  });
});
