import {
  ingredientsResponseSchema,
  type RecipeInput,
  type RecipeReviseInput,
  type RecipeRevisionRequest,
  recipeResponseSchema,
  recipeRevisionRequestSchema,
  recipesResponseSchema,
} from '@family/shared';
import fixtureInput from '@family/shared/fixtures/recipe-revise.input.json' with {
  type: 'json',
};
import type { FastifyInstance } from 'fastify';
import { HttpResponse, http } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp } from '../test/app.js';
import {
  CHAT_COMPLETIONS_URL,
  completion,
  openclaw,
  reviseAnswer,
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
const INSTRUCTION = 'картофите искат още 20 минути';

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

/** The moussaka of the contract fixture, with the seed products and a photo of its own on steps 2 and 5. */
async function createdRecipe() {
  const photos = [await storedStepPhoto(app), await storedStepPhoto(app)];
  const { recipe } = fixtureInput;
  const input: RecipeInput = {
    title: recipe.title,
    servings: recipe.servings,
    prepMinutes: recipe.prepMinutes,
    tags: ['dinner'],
    steps: recipe.steps.map((step) => ({
      text: step.text,
      ...(step.image === 'e1' ? { photoId: photos[0] } : {}),
      ...(step.image === 'e2' ? { photoId: photos[1] } : {}),
    })),
    ingredients: await Promise.all(
      recipe.ingredients.map(async (line) => ({
        ingredientId: await seedIngredientId(line.name),
        quantity: line.quantity,
        unit: line.unit as RecipeInput['ingredients'][number]['unit'],
        ...(line.note === undefined ? {} : { note: line.note }),
      })),
    ),
    preparation: [{ kind: 'oven', degrees: 200, fan: 'fan' }],
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
    input,
    photos,
  };
}

function postRevision(
  recipeId: string,
  instruction = INSTRUCTION,
  withHeaders: Record<string, string> = headers,
) {
  return app.inject({
    method: 'POST',
    url: `/api/recipes/${recipeId}/revisions`,
    headers: withHeaders,
    payload: { instruction },
  });
}

async function requested(recipeId: string): Promise<RecipeRevisionRequest> {
  const response = await postRevision(recipeId);
  expect(response.statusCode).toBe(202);
  return recipeRevisionRequestSchema.parse(response.json().request);
}

/** Polls `GET /api/recipes/revisions/:id` without an acting user until the background run has finished. */
async function finished(
  request: RecipeRevisionRequest,
): Promise<RecipeRevisionRequest> {
  const deadline = Date.now() + 5_000;
  for (;;) {
    const response = await app.inject({
      method: 'GET',
      url: `/api/recipes/revisions/${request.id}`,
    });
    expect(response.statusCode).toBe(200);
    const body = recipeRevisionRequestSchema.parse(response.json().request);
    if (body.status !== 'pending') {
      return body;
    }
    if (Date.now() > deadline) {
      throw new Error(`revision ${request.id} still pending`);
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

interface ChatBody {
  messages: { role: string; content: string }[];
}

/** Answers every chat completion with `answer` built from the contract input; returns the inputs it got. */
function answering(answer: (input: RecipeReviseInput) => unknown) {
  const inputs: RecipeReviseInput[] = [];
  openclaw.use(
    http.post(CHAT_COMPLETIONS_URL, async ({ request }) => {
      const body = (await request.json()) as ChatBody;
      const input = JSON.parse(
        body.messages[0]?.content ?? '',
      ) as RecipeReviseInput;
      inputs.push(input);
      return HttpResponse.json(completion(JSON.stringify(answer(input))));
    }),
  );
  return inputs;
}

async function getRecipe(id: string) {
  const response = await app.inject({
    method: 'GET',
    url: `/api/recipes/${id}`,
    headers,
  });
  return recipeResponseSchema.parse(response.json()).recipe;
}

describe('POST /api/recipes/:id/revisions', () => {
  it('answers 202 with a pending revision, then holds the whole revised recipe; the recipe is not changed', async () => {
    const { recipe, photos } = await createdRecipe();
    answering(reviseAnswer);

    const created = await requested(recipe.id);
    expect(created).toMatchObject({
      recipeId: recipe.id,
      instruction: INSTRUCTION,
      status: 'pending',
      requestedBy: DANI.id,
    });
    const done = await finished(created);

    expect(done.status).toBe('done');
    const revision = done.revision;
    expect(revision?.changes).toContain('60 минути');
    expect(revision?.servings).toBe(4);
    expect(revision?.prepMinutes).toBe(110);
    expect(revision?.steps[3]?.text).toContain('Печи 60 минути');
    expect(revision?.steps.map((step) => step.photoId)).toEqual([
      undefined,
      photos[0],
      undefined,
      undefined,
      photos[1],
    ]);
    expect(revision?.ingredients[0]).toEqual({
      ingredient: {
        id: await seedIngredientId('картоф'),
        name: 'картоф',
        unit: 'g',
        aisle: 'produce',
      },
      quantity: 1,
      unit: 'kg',
    });
    expect(revision?.ingredients[5]?.note).toBe('сладък');
    expect(revision?.preparation).toEqual([
      { kind: 'oven', degrees: 200, fan: 'fan' },
    ]);
    expect(revision?.droppedPhotos).toBe(0);
    expect(await getRecipe(recipe.id)).toEqual({
      ...recipe,
      openRevision: { id: created.id, status: 'done' },
    });
  });

  it('sends the agent the recipe by product names with its photos as references, the instruction, no cooking changes and the registry', async () => {
    const { recipe } = await createdRecipe();
    const inputs = answering(reviseAnswer);

    await finished(await requested(recipe.id));

    const [input] = inputs;
    expect(input?.recipe).toEqual(fixtureInput.recipe);
    expect(input?.instruction).toBe(INSTRUCTION);
    expect(input?.cookingChanges).toEqual([]);
    expect(input?.ingredients).toContainEqual({
      id: await seedIngredientId('сол'),
      name: 'сол',
      unit: 'g',
    });
  });

  it('holds a proposed new product and counts the photos no step keeps', async () => {
    const { recipe } = await createdRecipe();
    answering((input) => {
      const answer = reviseAnswer(input);
      if (!answer.recipe) {
        throw new Error('no recipe in the fixture');
      }
      answer.recipe.ingredients.push({
        ingredientId: null,
        newProduct: { name: 'индийско орехче', unit: 'g', aisle: 'spices' },
        quantity: null,
        unit: 'pinch',
        note: null,
      });
      answer.recipe.steps = answer.recipe.steps.slice(0, 4);
      return answer;
    });

    const done = await finished(await requested(recipe.id));

    expect(done.revision?.ingredients.at(-1)).toEqual({
      newProduct: { name: 'индийско орехче', unit: 'g', aisle: 'spices' },
      quantity: null,
      unit: 'pinch',
    });
    expect(done.revision?.droppedPhotos).toBe(1);
  });

  it('ends failed no_results with the agent’s reason', async () => {
    const { recipe } = await createdRecipe();
    answering(() => ({
      recipe: null,
      noResults: 'Указанието не е за тази рецепта.',
    }));

    const done = await finished(await requested(recipe.id));

    expect(done).toMatchObject({
      status: 'failed',
      error: 'no_results',
      noResults: 'Указанието не е за тази рецепта.',
    });
    expect(done.revision).toBeUndefined();
  });

  it('fails invalid_output for a product that is not in the registry, even after the retry', async () => {
    const { recipe } = await createdRecipe();
    const inputs = answering((input) => {
      const answer = reviseAnswer(input);
      const first = answer.recipe?.ingredients[0];
      if (first) {
        first.ingredientId = '00000000-0000-4000-8000-000000000000';
      }
      return answer;
    });

    const done = await finished(await requested(recipe.id));

    expect(done).toMatchObject({ status: 'failed', error: 'invalid_output' });
    expect(inputs).toHaveLength(2);
  });

  it('is allowed without an acting user, as on the kiosk', async () => {
    const { recipe } = await createdRecipe();
    answering(reviseAnswer);

    const response = await postRevision(recipe.id, INSTRUCTION, {});

    expect(response.statusCode).toBe(202);
    expect(response.json().request.requestedBy).toBeNull();
    await finished(response.json().request);
  });

  it('answers 404 for an unknown recipe and 400 for an empty or too long instruction', async () => {
    const { recipe } = await createdRecipe();

    const unknown = await postRevision('00000000-0000-4000-8000-000000000000');
    expect(unknown.statusCode).toBe(404);
    expect(unknown.json()).toMatchObject({ error: 'not_found' });
    expect((await postRevision(recipe.id, '  ')).statusCode).toBe(400);
    expect((await postRevision(recipe.id, 'а'.repeat(501))).statusCode).toBe(
      400,
    );
  });
});

describe('GET /api/recipes/revisions/:id', () => {
  it('answers 404 for an unknown revision', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/recipes/revisions/00000000-0000-4000-8000-000000000000',
    });

    expect(response.statusCode).toBe(404);
  });
});

describe('POST /api/recipes/revisions/:id/reject', () => {
  it('marks the revision rejected, without an acting user too, and leaves the recipe as it is', async () => {
    const { recipe } = await createdRecipe();
    answering(reviseAnswer);
    const done = await finished(await requested(recipe.id));

    const response = await app.inject({
      method: 'POST',
      url: `/api/recipes/revisions/${done.id}/reject`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().request).toMatchObject({
      id: done.id,
      decision: 'rejected',
    });
    expect(await getRecipe(recipe.id)).toEqual(recipe);
  });

  it('answers 404 for an unknown revision and 409 for one already decided', async () => {
    const { recipe } = await createdRecipe();
    answering(reviseAnswer);
    const done = await finished(await requested(recipe.id));
    const reject = (id: string) =>
      app.inject({
        method: 'POST',
        url: `/api/recipes/revisions/${id}/reject`,
        headers,
      });

    expect(
      (await reject('00000000-0000-4000-8000-000000000000')).statusCode,
    ).toBe(404);
    expect((await reject(done.id)).statusCode).toBe(200);
    expect((await reject(done.id)).statusCode).toBe(409);
  });
});

describe('PUT /api/recipes/:id with revisionId', () => {
  it('saves the recipe and marks the revision accepted', async () => {
    const { recipe, input } = await createdRecipe();
    answering(reviseAnswer);
    const done = await finished(await requested(recipe.id));
    const revision = done.revision;
    if (!revision) {
      throw new Error('no revision');
    }

    const response = await app.inject({
      method: 'PUT',
      url: `/api/recipes/${recipe.id}`,
      headers,
      payload: {
        ...input,
        prepMinutes: revision.prepMinutes,
        steps: revision.steps,
        revisionId: done.id,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().recipe.prepMinutes).toBe(110);
    expect((await finished(done)).decision).toBe('accepted');
  });

  it('saves a new product of the revision once the person has created it', async () => {
    const { recipe, input } = await createdRecipe();
    answering((answerInput) => {
      const answer = reviseAnswer(answerInput);
      answer.recipe?.ingredients.push({
        ingredientId: null,
        newProduct: { name: 'индийско орехче', unit: 'g', aisle: 'spices' },
        quantity: null,
        unit: 'pinch',
        note: null,
      });
      return answer;
    });
    const done = await finished(await requested(recipe.id));
    const proposed = done.revision?.ingredients.at(-1)?.newProduct;
    const created = await app.inject({
      method: 'POST',
      url: '/api/ingredients',
      headers,
      payload: proposed,
    });
    expect(created.statusCode).toBe(201);

    const response = await app.inject({
      method: 'PUT',
      url: `/api/recipes/${recipe.id}`,
      headers,
      payload: {
        ...input,
        ingredients: [
          ...input.ingredients,
          {
            ingredientId: created.json().ingredient.id,
            quantity: null,
            unit: 'pinch',
          },
        ],
        revisionId: done.id,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().recipe.ingredients.at(-1).ingredient.name).toBe(
      'индийско орехче',
    );
    expect((await finished(done)).decision).toBe('accepted');
  });

  it('answers 404 for a revision of another recipe and 409 for one already decided, and saves nothing', async () => {
    const first = await createdRecipe();
    const second = await createdRecipe();
    answering(reviseAnswer);
    const done = await finished(await requested(first.recipe.id));
    const put = (id: string, title: string) =>
      app.inject({
        method: 'PUT',
        url: `/api/recipes/${id}`,
        headers,
        payload: { ...first.input, title, revisionId: done.id },
      });

    expect((await put(second.recipe.id, 'Друга')).statusCode).toBe(404);
    await app.inject({
      method: 'POST',
      url: `/api/recipes/revisions/${done.id}/reject`,
      headers,
    });
    expect((await put(first.recipe.id, 'Друга')).statusCode).toBe(409);
    expect((await getRecipe(first.recipe.id)).title).toBe('Мусака');
    expect((await getRecipe(second.recipe.id)).title).toBe('Мусака');
  });
});

/** Holds every chat completion until `release()`, then answers it with `reviseAnswer`. */
function holding() {
  let release = () => {};
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  openclaw.use(
    http.post(CHAT_COMPLETIONS_URL, async ({ request }) => {
      const body = (await request.json()) as ChatBody;
      await released;
      return HttpResponse.json(
        completion(
          JSON.stringify(
            reviseAnswer(
              JSON.parse(body.messages[0]?.content ?? '') as RecipeReviseInput,
            ),
          ),
        ),
      );
    }),
  );
  return { release };
}

async function listedOpenRevision(recipeId: string) {
  const response = await app.inject({
    method: 'GET',
    url: '/api/recipes',
    headers,
  });
  return recipesResponseSchema
    .parse(response.json())
    .recipes.find((summary) => summary.id === recipeId)?.openRevision;
}

describe('openRevision of a recipe', () => {
  it('is the pending revision, then the done one, in the recipe and in the registry', async () => {
    const { recipe } = await createdRecipe();
    expect((await getRecipe(recipe.id)).openRevision).toBeNull();
    expect(await listedOpenRevision(recipe.id)).toBeNull();
    const { release } = holding();

    const pending = await requested(recipe.id);

    const open = { id: pending.id, status: 'pending' };
    expect((await getRecipe(recipe.id)).openRevision).toEqual(open);
    expect(await listedOpenRevision(recipe.id)).toEqual(open);
    release();
    await finished(pending);
    const done = { id: pending.id, status: 'done' };
    expect((await getRecipe(recipe.id)).openRevision).toEqual(done);
    expect(await listedOpenRevision(recipe.id)).toEqual(done);
  });

  it('is none once the revision is rejected or accepted', async () => {
    const { recipe, input } = await createdRecipe();
    answering(reviseAnswer);
    const rejected = await finished(await requested(recipe.id));
    await app.inject({
      method: 'POST',
      url: `/api/recipes/revisions/${rejected.id}/reject`,
    });
    expect((await getRecipe(recipe.id)).openRevision).toBeNull();
    expect(await listedOpenRevision(recipe.id)).toBeNull();

    const accepted = await finished(await requested(recipe.id));
    const saved = await app.inject({
      method: 'PUT',
      url: `/api/recipes/${recipe.id}`,
      headers,
      payload: { ...input, revisionId: accepted.id },
    });

    expect(saved.json().recipe.openRevision).toBeNull();
    expect((await getRecipe(recipe.id)).openRevision).toBeNull();
    expect(await listedOpenRevision(recipe.id)).toBeNull();
  });

  it('is none after no_results', async () => {
    const { recipe } = await createdRecipe();
    answering(() => ({ recipe: null, noResults: 'Не е за тази рецепта.' }));

    await finished(await requested(recipe.id));

    expect((await getRecipe(recipe.id)).openRevision).toBeNull();
  });
});

describe('a second revision of a recipe', () => {
  it('answers 409 revision_open with the open one while it is pending or done', async () => {
    const { recipe } = await createdRecipe();
    const { release } = holding();
    const open = await requested(recipe.id);

    const whilePending = await postRevision(recipe.id, 'добави сол');

    expect(whilePending.statusCode).toBe(409);
    expect(whilePending.json()).toMatchObject({
      error: 'conflict',
      code: 'revision_open',
      revisionId: open.id,
    });
    release();
    await finished(open);
    const whileDone = await postRevision(recipe.id, 'добави сол');
    expect(whileDone.statusCode).toBe(409);
    expect(whileDone.json()).toMatchObject({ revisionId: open.id });
  });

  it('is allowed after no_results, a failure, a rejection and an acceptance', async () => {
    const { recipe, input } = await createdRecipe();
    answering(() => ({ recipe: null, noResults: 'Не е за тази рецепта.' }));
    await finished(await requested(recipe.id));
    openclaw.use(
      http.post(
        CHAT_COMPLETIONS_URL,
        () => new HttpResponse(null, { status: 500 }),
      ),
    );
    expect((await finished(await requested(recipe.id))).status).toBe('failed');
    answering(reviseAnswer);
    const rejected = await finished(await requested(recipe.id));
    await app.inject({
      method: 'POST',
      url: `/api/recipes/revisions/${rejected.id}/reject`,
    });
    const accepted = await finished(await requested(recipe.id));
    await app.inject({
      method: 'PUT',
      url: `/api/recipes/${recipe.id}`,
      headers,
      payload: { ...input, revisionId: accepted.id },
    });

    const next = await postRevision(recipe.id);
    expect(next.statusCode).toBe(202);
    await finished(next.json().request);
  });
});

describe('stale of a revision', () => {
  it('is true once the recipe is saved after the revision was asked for', async () => {
    const { recipe, input } = await createdRecipe();
    answering(reviseAnswer);
    const done = await finished(await requested(recipe.id));
    expect(done.stale).toBe(false);

    const saved = await app.inject({
      method: 'PUT',
      url: `/api/recipes/${recipe.id}`,
      headers,
      payload: { ...input, title: 'Мусака с тиквички' },
    });
    expect(saved.statusCode).toBe(200);

    expect((await finished(done)).stale).toBe(true);
    expect((await getRecipe(recipe.id)).openRevision).toEqual({
      id: done.id,
      status: 'done',
    });
  });

  it('is not accepted: PUT with its revisionId answers 409 revision_stale and keeps the newer save', async () => {
    const { recipe, input } = await createdRecipe();
    answering(reviseAnswer);
    const done = await finished(await requested(recipe.id));
    await app.inject({
      method: 'PUT',
      url: `/api/recipes/${recipe.id}`,
      headers,
      payload: { ...input, title: 'Мусака с тиквички' },
    });

    const response = await app.inject({
      method: 'PUT',
      url: `/api/recipes/${recipe.id}`,
      headers,
      payload: { ...input, prepMinutes: 110, revisionId: done.id },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      error: 'conflict',
      code: 'revision_stale',
    });
    expect(await getRecipe(recipe.id)).toMatchObject({
      title: 'Мусака с тиквички',
      openRevision: { id: done.id, status: 'done' },
    });
    expect((await finished(done)).decision).toBeUndefined();
  });
});

/** A suggestion of `recipe.suggest`, still waiting for a decision. */
async function aSuggestion(): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/recipe-suggestions/requests',
    headers,
    payload: { slots: ['dinner'] },
  });
  expect(response.statusCode).toBe(202);
  const requestId: string = response.json().request.id;
  const deadline = Date.now() + 5_000;
  for (;;) {
    const detail = await app.inject({
      method: 'GET',
      url: `/api/recipe-suggestions/requests/${requestId}`,
      headers,
    });
    const body = detail.json();
    if (body.request.status !== 'pending') {
      return body.suggestions[0].id;
    }
    if (Date.now() > deadline) {
      throw new Error(`suggestion request ${requestId} still pending`);
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

/** The review form as „✏️ Поправи с AI“ sends it: the moussaka of the fixture, its own photos on steps 2 and 5. */
async function formRecipe() {
  const photos = [await storedStepPhoto(app), await storedStepPhoto(app)];
  const { recipe } = fixtureInput;
  return {
    photos,
    recipe: {
      title: recipe.title,
      servings: recipe.servings,
      prepMinutes: recipe.prepMinutes,
      ingredients: recipe.ingredients,
      steps: recipe.steps.map((step) => ({
        text: step.text,
        ...(step.image === 'e1' ? { photoId: photos[0] } : {}),
        ...(step.image === 'e2' ? { photoId: photos[1] } : {}),
      })),
      preparation: recipe.preparation,
    },
  };
}

function postSuggestionRevision(suggestionId: string, recipe: object) {
  return app.inject({
    method: 'POST',
    url: `/api/recipe-suggestions/${suggestionId}/revisions`,
    headers,
    payload: { instruction: INSTRUCTION, recipe },
  });
}

async function requestedForSuggestion(
  suggestionId: string,
  recipe: object,
): Promise<RecipeRevisionRequest> {
  const response = await postSuggestionRevision(suggestionId, recipe);
  expect(response.statusCode).toBe(202);
  return recipeRevisionRequestSchema.parse(response.json().request);
}

describe('POST /api/recipe-suggestions/:id/revisions', () => {
  it('answers 202 with a pending revision of the suggestion, then holds the revised recipe with the form’s photos', async () => {
    const suggestionId = await aSuggestion();
    const { recipe, photos } = await formRecipe();
    answering(reviseAnswer);

    const created = await requestedForSuggestion(suggestionId, recipe);
    expect(created).toMatchObject({
      suggestionId,
      instruction: INSTRUCTION,
      status: 'pending',
      requestedBy: DANI.id,
    });
    expect(created.recipeId).toBeUndefined();
    const done = await finished(created);

    expect(done.status).toBe('done');
    expect(done.stale).toBe(false);
    expect(done.revision?.prepMinutes).toBe(110);
    expect(done.revision?.steps.map((step) => step.photoId)).toEqual([
      undefined,
      photos[0],
      undefined,
      undefined,
      photos[1],
    ]);
  });

  it('sends the agent the recipe of the form, not the suggestion as it is stored', async () => {
    const suggestionId = await aSuggestion();
    const { recipe } = await formRecipe();
    const inputs = answering(reviseAnswer);

    await finished(await requestedForSuggestion(suggestionId, recipe));

    expect(inputs[0]?.recipe).toEqual(fixtureInput.recipe);
    expect(inputs[0]?.instruction).toBe(INSTRUCTION);
    expect(inputs[0]?.cookingChanges).toEqual([]);
  });

  it('answers 404 for an unknown suggestion', async () => {
    const { recipe } = await formRecipe();

    const response = await postSuggestionRevision(
      '00000000-0000-4000-8000-000000000000',
      recipe,
    );

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: 'not_found' });
  });

  it('answers 409 for a suggestion already decided', async () => {
    const suggestionId = await aSuggestion();
    const { recipe } = await formRecipe();
    await app.inject({
      method: 'POST',
      url: `/api/recipe-suggestions/${suggestionId}/reject`,
      headers,
    });

    const response = await postSuggestionRevision(suggestionId, recipe);

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: 'conflict' });
  });

  it('answers 409 revision_open with the open revision while one waits for review, and takes a new one once it is rejected', async () => {
    const suggestionId = await aSuggestion();
    const { recipe } = await formRecipe();
    answering(reviseAnswer);
    const done = await finished(
      await requestedForSuggestion(suggestionId, recipe),
    );

    const again = await postSuggestionRevision(suggestionId, recipe);

    expect(again.statusCode).toBe(409);
    expect(again.json()).toMatchObject({
      error: 'conflict',
      code: 'revision_open',
      revisionId: done.id,
    });
    await app.inject({
      method: 'POST',
      url: `/api/recipes/revisions/${done.id}/reject`,
    });
    expect(
      (await postSuggestionRevision(suggestionId, recipe)).statusCode,
    ).toBe(202);
  });
});

describe('POST /api/recipe-suggestions/:id/approve with revisionId', () => {
  /** The form after „Приеми“: the revised recipe with the seed products, ready to approve. */
  async function approvalInput(revision: RecipeRevisionRequest['revision']) {
    if (!revision) {
      throw new Error('no revision');
    }
    return {
      title: 'Мусака',
      servings: revision.servings,
      prepMinutes: revision.prepMinutes,
      tags: ['dinner'],
      steps: revision.steps,
      preparation: revision.preparation,
      ingredients: revision.ingredients.flatMap((line) =>
        line.ingredient
          ? [
              {
                ingredientId: line.ingredient.id,
                quantity: line.quantity,
                unit: line.unit,
              },
            ]
          : [],
      ),
    };
  }

  function approve(suggestionId: string, payload: object) {
    return app.inject({
      method: 'POST',
      url: `/api/recipe-suggestions/${suggestionId}/approve`,
      headers,
      payload,
    });
  }

  it('creates the recipe and marks the revision accepted', async () => {
    const suggestionId = await aSuggestion();
    const { recipe } = await formRecipe();
    answering(reviseAnswer);
    const done = await finished(
      await requestedForSuggestion(suggestionId, recipe),
    );

    const response = await approve(suggestionId, {
      ...(await approvalInput(done.revision)),
      revisionId: done.id,
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().recipe.prepMinutes).toBe(110);
    expect((await finished(done)).decision).toBe('accepted');
  });

  it('answers 404 for a revision of another suggestion and approves nothing', async () => {
    const first = await aSuggestion();
    const second = await aSuggestion();
    const { recipe } = await formRecipe();
    answering(reviseAnswer);
    const done = await finished(await requestedForSuggestion(first, recipe));

    const response = await approve(second, {
      ...(await approvalInput(done.revision)),
      revisionId: done.id,
    });

    expect(response.statusCode).toBe(404);
    expect((await finished(done)).decision).toBeUndefined();
    expect(
      (await approve(second, await approvalInput(done.revision))).statusCode,
    ).toBe(201);
  });
});

describe('applied: the cooking changes of the last cooking', () => {
  /** Asks a question in Готвене for 2 servings, answered with `change`; returns its id once it is done. */
  async function askedWithChange(
    recipeId: string,
    change: unknown,
    applied: string[] = [],
  ): Promise<string> {
    openclaw.use(
      http.post(CHAT_COMPLETIONS_URL, () =>
        HttpResponse.json(
          completion(JSON.stringify({ answer: 'Да.', change })),
        ),
      ),
    );
    const response = await app.inject({
      method: 'POST',
      url: `/api/recipes/${recipeId}/questions`,
      headers,
      payload: { question: 'Може ли?', step: 2, servings: 2, applied },
    });
    expect(response.statusCode).toBe(202);
    const { id } = response.json().request as { id: string };
    const deadline = Date.now() + 5_000;
    for (;;) {
      const polled = await app.inject({
        method: 'GET',
        url: `/api/recipes/questions/${id}`,
      });
      const { status } = polled.json().request as { status: string };
      if (status === 'done') {
        openclaw.resetHandlers();
        return id;
      }
      if (status !== 'pending' || Date.now() > deadline) {
        throw new Error(`question ${id} ended ${status}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }

  const PULP = {
    ingredients: [
      {
        kind: 'replace',
        index: 3,
        ingredient: { name: 'консерва pulp', quantity: 200, unit: 'g' },
      },
    ],
  };
  const PARSLEY = {
    ingredients: [
      { kind: 'remove', index: 6 },
      {
        kind: 'add',
        ingredient: { name: 'магданоз', quantity: 10, unit: 'g' },
      },
    ],
    steps: [
      {
        number: 3,
        text: 'Смеси картофите с каймата и консервата, подреди в тава.',
      },
    ],
  };

  it('sends the agent the applied changes in their order as readable lines, scaled to the recipe’s servings, with the recipe as it is saved', async () => {
    const { recipe } = await createdRecipe();
    const pulp = await askedWithChange(recipe.id, PULP);
    const parsley = await askedWithChange(recipe.id, PARSLEY, [pulp]);
    const inputs = answering(reviseAnswer);

    const response = await app.inject({
      method: 'POST',
      url: `/api/recipes/${recipe.id}/revisions`,
      payload: { instruction: 'запази замяната', applied: [pulp, parsley] },
    });
    expect(response.statusCode).toBe(202);
    await finished(recipeRevisionRequestSchema.parse(response.json().request));

    const [input] = inputs;
    expect(input?.recipe).toEqual(fixtureInput.recipe);
    expect(input?.cookingChanges).toEqual([
      'вместо домат: консерва pulp 400 g',
      'без черен пипер',
      'добавен: магданоз 20 g',
      'стъпка 3: Смеси картофите с каймата и консервата, подреди в тава.',
    ]);
  });

  it('answers 404 no_applied_change for an applied that is not a question of this recipe with a change, and asks nothing', async () => {
    const { recipe } = await createdRecipe();
    const { recipe: other } = await createdRecipe();
    const ofOther = await askedWithChange(other.id, PULP);
    const inputs = answering(reviseAnswer);

    const response = await app.inject({
      method: 'POST',
      url: `/api/recipes/${recipe.id}/revisions`,
      payload: { instruction: 'запази замяната', applied: [ofOther] },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      error: 'not_found',
      code: 'no_applied_change',
      ids: [ofOther],
    });
    expect(inputs).toEqual([]);
    expect((await getRecipe(recipe.id)).openRevision).toBeNull();
  });
});
