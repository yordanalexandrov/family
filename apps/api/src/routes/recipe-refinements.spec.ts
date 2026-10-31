import {
  ingredientsResponseSchema,
  type RecipeInput,
  type RecipeRefineInput,
  type RecipeRefineRequest,
  recipeRefineRequestSchema,
  recipeResponseSchema,
} from '@family/shared';
import type { FastifyInstance } from 'fastify';
import { HttpResponse, http } from 'msw';
import sharp from 'sharp';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp } from '../test/app.js';
import {
  CHAT_COMPLETIONS_URL,
  completion,
  openclaw,
} from '../test/openclaw.js';
import { storedStepPhoto } from '../test/photos.js';
import { DANI } from '../test/users.js';

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

const SOURCE_URL = 'https://blog.example/pile-s-kartofi';
const PHOTO_URL = {
  s1: 'https://blog.example/uploads/kartofi.jpg',
  s2: 'https://blog.example/uploads/pile.jpg',
};

/** The page of the source: a JSON-LD Recipe whose first two steps have photos. */
const PAGE = `<!doctype html><html><head><title>Пиле с картофи</title>
<script type="application/ld+json">${JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'Recipe',
  name: 'Пиле с картофи на фурна',
  totalTime: 'PT1H15M',
  recipeIngredient: ['4 пилешки бутчета', '1 кг картофи'],
  recipeInstructions: [
    {
      '@type': 'HowToStep',
      text: 'Нарежете картофите на кръгчета.',
      image: PHOTO_URL.s1,
    },
    {
      '@type': 'HowToStep',
      text: 'Сложете пилето отгоре.',
      image: PHOTO_URL.s2,
    },
    { '@type': 'HowToStep', text: 'Печете час на 200 градуса.' },
  ],
})}</script></head><body><h1>Пиле с картофи</h1></body></html>`;

async function seedIngredientId(name: string): Promise<string> {
  const response = await app.inject({
    method: 'GET',
    url: `/api/ingredients?q=${encodeURIComponent(name)}`,
    headers,
  });
  const { ingredients } = ingredientsResponseSchema.parse(response.json());
  const found = ingredients.find((ingredient) => ingredient.name === name);
  if (!found) {
    throw new Error(`no seed ingredient ${name}`);
  }
  return found.id;
}

/** A recipe with terse steps, the second one with a photo of its own. */
async function createdRecipe(overrides: Partial<RecipeInput> = {}) {
  const photoId = await storedStepPhoto(app);
  const input: RecipeInput = {
    title: 'Пиле с картофи на фурна',
    servings: 4,
    sourceUrl: SOURCE_URL,
    tags: ['dinner'],
    steps: [
      { text: 'Нарежи картофите.' },
      { text: 'Сложи пилето отгоре.', photoId },
      { text: 'Печи.' },
    ],
    ingredients: [
      {
        ingredientId: await seedIngredientId('картоф'),
        quantity: 1,
        unit: 'kg',
      },
      {
        ingredientId: await seedIngredientId('сол'),
        quantity: null,
        unit: 'pinch',
      },
    ],
    ...overrides,
  };
  const response = await app.inject({
    method: 'POST',
    url: '/api/recipes',
    headers,
    payload: input,
  });
  expect(response.statusCode).toBe(201);
  return {
    recipe: recipeResponseSchema.parse(response.json()).recipe,
    photoId,
  };
}

function postRefinement(recipeId: string) {
  return app.inject({
    method: 'POST',
    url: `/api/recipes/${recipeId}/refinements`,
    headers,
  });
}

async function requested(recipeId: string): Promise<RecipeRefineRequest> {
  const response = await postRefinement(recipeId);
  expect(response.statusCode).toBe(202);
  return recipeRefineRequestSchema.parse(response.json().request);
}

/** Polls `GET /api/recipes/refinements/:id` until the background run has finished. */
async function finished(
  request: RecipeRefineRequest,
): Promise<RecipeRefineRequest> {
  const deadline = Date.now() + 5_000;
  for (;;) {
    const response = await app.inject({
      method: 'GET',
      url: `/api/recipes/refinements/${request.id}`,
      headers,
    });
    expect(response.statusCode).toBe(200);
    const body = recipeRefineRequestSchema.parse(response.json().request);
    if (body.status !== 'pending') {
      return body;
    }
    if (Date.now() > deadline) {
      throw new Error(`refinement ${request.id} still pending`);
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

interface ChatBody {
  messages: { role: string; content: string }[];
}

/** Answers the chat completions in turn, each built from the contract input; returns the inputs it got. */
function answerInTurn(...answers: ((input: RecipeRefineInput) => unknown)[]) {
  const inputs: RecipeRefineInput[] = [];
  openclaw.use(
    http.post(CHAT_COMPLETIONS_URL, async ({ request }) => {
      const body = (await request.json()) as ChatBody;
      const sent = body.messages[0]?.content ?? '';
      expect(sent).not.toContain('uploads');
      const input = JSON.parse(sent) as RecipeRefineInput;
      inputs.push(input);
      const answer = answers[inputs.length - 1] ?? answers.at(-1);
      return HttpResponse.json(
        completion(JSON.stringify(answer?.(input) ?? {})),
      );
    }),
  );
  return inputs;
}

/** A picture `width` pixels wide, so a stored photo tells which one of the page it is. */
async function imageResponse(width: number) {
  const bytes = await sharp({
    create: { width, height: 300, channels: 3, background: '#c63' },
  })
    .jpeg()
    .toBuffer();
  return new HttpResponse(bytes, { headers: { 'content-type': 'image/jpeg' } });
}

/** The source page and its photos; `s2` is not a picture. Returns the URLs fetched besides the agent. */
function serveSource(page: () => Response = () => htmlResponse(PAGE)) {
  const fetched: string[] = [];
  openclaw.use(
    http.all('*', ({ request }) => {
      if (request.url !== CHAT_COMPLETIONS_URL) {
        fetched.push(request.url);
      }
    }),
    http.get(SOURCE_URL, page),
    http.get(PHOTO_URL.s1, () => imageResponse(410)),
    http.get(
      PHOTO_URL.s2,
      () =>
        new HttpResponse('not a picture', {
          headers: { 'content-type': 'image/jpeg' },
        }),
    ),
  );
  return fetched;
}

function htmlResponse(html: string) {
  return new HttpResponse(html, {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

async function storedWidth(photoId: string | undefined): Promise<number> {
  const response = await app.inject({
    method: 'GET',
    url: `/api/step-photos/${photoId}`,
  });
  expect(response.statusCode).toBe(200);
  return (await sharp(response.rawPayload).metadata()).width;
}

const REFINED_STEPS = [
  {
    text: 'Загрей фурната на 200 °C с вентилатор, скарата на средно ниво.',
    image: null,
  },
  {
    text: 'Нарежи 1 кг картофи на кръгчета около 5 мм и ги подреди в тава.',
    image: 's1',
  },
  { text: 'Сложи пилето върху картофите с кожата нагоре.', image: 'e1' },
  {
    text: 'Печи без фолио около 60 минути, докато кожата стане златиста.',
    image: 's2',
  },
];

function refined(steps = REFINED_STEPS, prepMinutes: number | null = 75) {
  return () => ({
    recipe: {
      steps,
      prepMinutes,
      changes: 'Стъпките са по-подробни, времето е от източника.',
    },
    noResults: null,
  });
}

describe('POST /api/recipes/:id/refinements', () => {
  it('refines from the page read again: keeps the photo the recipe had, stores the chosen photos of the page, fills the time', async () => {
    const { recipe, photoId } = await createdRecipe();
    const fetched = serveSource();
    const inputs = answerInTurn(refined());

    const request = await requested(recipe.id);
    expect(request).toMatchObject({ status: 'pending', recipeId: recipe.id });
    const done = await finished(request);

    expect(inputs[0]?.recipe).toEqual({
      title: 'Пиле с картофи на фурна',
      servings: 4,
      prepMinutes: null,
      ingredients: [
        { name: 'картоф', quantity: 1, unit: 'kg' },
        { name: 'сол', quantity: null, unit: 'pinch' },
      ],
      steps: [
        { text: 'Нарежи картофите.', image: null },
        { text: 'Сложи пилето отгоре.', image: 'e1' },
        { text: 'Печи.', image: null },
      ],
    });
    expect(inputs[0]?.source).toMatchObject({
      url: SOURCE_URL,
      photos: ['s1', 's2'],
    });
    expect(done.status).toBe('done');
    const refinement = done.refinement;
    expect(refinement).toMatchObject({
      prepMinutes: 75,
      changes: 'Стъпките са по-подробни, времето е от източника.',
      source: 'read',
      droppedPhotos: 1,
    });
    const steps = refinement?.steps ?? [];
    expect(steps.map((step) => step.text)).toEqual(
      REFINED_STEPS.map((step) => step.text),
    );
    expect(steps[0]).not.toHaveProperty('photoId');
    expect(await storedWidth(steps[1]?.photoId)).toBe(410);
    expect(steps[2]?.photoId).toBe(photoId);
    expect(steps[3]).not.toHaveProperty('photoId');
    expect(fetched).toEqual([SOURCE_URL, PHOTO_URL.s1, PHOTO_URL.s2]);

    // The recipe itself changes only on „Запази“.
    const stored = await app.inject({
      method: 'GET',
      url: `/api/recipes/${recipe.id}`,
      headers,
    });
    expect(recipeResponseSchema.parse(stored.json()).recipe.steps).toEqual(
      recipe.steps,
    );
  });

  it('refines a recipe without a link from the recipe alone', async () => {
    const { recipe } = await createdRecipe({ sourceUrl: undefined });
    const fetched = serveSource();
    const inputs = answerInTurn(
      refined(
        REFINED_STEPS.map((step) => ({
          ...step,
          image: step.image === 'e1' ? 'e1' : null,
        })),
      ),
    );

    const done = await finished(await requested(recipe.id));

    expect(inputs[0]?.source).toBeNull();
    expect(done.refinement).toMatchObject({ source: 'none', droppedPhotos: 0 });
    expect(fetched).toEqual([]);
  });

  it('refines without the page when it does not open, and says so', async () => {
    const { recipe } = await createdRecipe();
    serveSource(() => new HttpResponse('Forbidden', { status: 403 }));
    const inputs = answerInTurn(
      refined([{ text: 'Сложи пилето върху картофите.', image: 'e1' }]),
    );

    const done = await finished(await requested(recipe.id));

    expect(inputs[0]?.source).toBeNull();
    expect(done.status).toBe('done');
    expect(done.refinement?.source).toBe('unread');
  });

  it('keeps the time the recipe has', async () => {
    const { recipe } = await createdRecipe({ prepMinutes: 60 });
    serveSource();
    const inputs = answerInTurn(refined(REFINED_STEPS, 60));

    const done = await finished(await requested(recipe.id));

    expect(inputs[0]?.recipe.prepMinutes).toBe(60);
    expect(done.refinement).not.toHaveProperty('prepMinutes');
  });

  it('ends no_results with the reason when there is nothing to refine', async () => {
    const { recipe } = await createdRecipe();
    serveSource();
    answerInTurn(() => ({
      recipe: null,
      noResults: 'Стъпките вече са подробни.',
    }));

    const done = await finished(await requested(recipe.id));

    expect(done).toMatchObject({
      status: 'failed',
      error: 'no_results',
      noResults: 'Стъпките вече са подробни.',
    });
    expect(done).not.toHaveProperty('refinement');
  });

  it('fails invalid_output when the answer loses a photo of the recipe, even after the retry', async () => {
    const { recipe } = await createdRecipe();
    serveSource();
    const inputs = answerInTurn(
      refined(REFINED_STEPS.map((step) => ({ ...step, image: null }))),
    );

    const done = await finished(await requested(recipe.id));

    expect(inputs).toHaveLength(2);
    expect(done).toMatchObject({ status: 'failed', error: 'invalid_output' });
  });

  it('answers 409 while the recipe has a refinement pending, and 404 for an unknown recipe', async () => {
    const { recipe } = await createdRecipe({ sourceUrl: undefined });
    let answer: () => void = () => {};
    const answered = new Promise<void>((resolve) => {
      answer = resolve;
    });
    openclaw.use(
      http.post(CHAT_COMPLETIONS_URL, async () => {
        await answered;
        return HttpResponse.json(
          completion(
            JSON.stringify({ recipe: null, noResults: 'Няма какво.' }),
          ),
        );
      }),
    );

    const first = await requested(recipe.id);
    const second = await postRefinement(recipe.id);
    answer();
    await finished(first);

    expect(second.statusCode).toBe(409);
    const unknown = await postRefinement(
      '00000000-0000-4000-8000-000000000000',
    );
    expect(unknown.statusCode).toBe(404);
  });
});
