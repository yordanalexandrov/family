import {
  approvedSuggestionResponseSchema,
  ingredientsResponseSchema,
  type RecipeInput,
  type RecipeSuggestion,
  recipeSuggestionSchema,
  type SuggestionRequest,
  suggestionRequestSchema,
} from '@family/shared';
import type { FastifyInstance } from 'fastify';
import { HttpResponse, http } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { recipeSuggestionRequest } from '../db/schema/food.js';
import type { CloudflareAccessOptions } from '../plugins/cloudflare-access.js';
import { buildTestApp } from '../test/app.js';
import { testDb } from '../test/db.js';
import {
  CHAT_COMPLETIONS_URL,
  completion,
  openclaw,
  suggestFixture,
  TEST_OPENCLAW,
} from '../test/openclaw.js';
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

function postRequest(payload: object, target = app) {
  return target.inject({
    method: 'POST',
    url: '/api/recipe-suggestions/requests',
    headers,
    payload,
  });
}

function getRequest(id: string, target = app) {
  return target.inject({
    method: 'GET',
    url: `/api/recipe-suggestions/requests/${id}`,
    headers,
  });
}

async function requested(payload: object, target = app) {
  const response = await postRequest(payload, target);
  expect(response.statusCode).toBe(202);
  return suggestionRequestSchema.parse(response.json().request);
}

/** Polls `GET …/requests/:id` until the background run has finished (or the timeout elapses). */
async function finished(
  request: SuggestionRequest,
  target = app,
  timeoutMs = 5_000,
) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const response = await getRequest(request.id, target);
    expect(response.statusCode).toBe(200);
    const body = response.json();
    if (body.request.status !== 'pending') {
      return body;
    }
    if (Date.now() > deadline) {
      throw new Error(`request ${request.id} still pending`);
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

describe('POST /api/recipe-suggestions/requests', () => {
  it('answers 202 with a pending request, then the run stores the suggestions and the request is done', async () => {
    const request = await requested({
      slots: ['lunch', 'dinner'],
      times: ['15-30', '45-60'],
      tags: ['kid_friendly'],
      hint: 'нещо с пиле',
    });
    expect(request).toMatchObject({
      slots: ['lunch', 'dinner'],
      times: ['15-30', '45-60'],
      tags: ['kid_friendly'],
      hint: 'нещо с пиле',
      status: 'pending',
      requestedBy: DANI.id,
    });

    const body = await finished(request);

    expect(body.request).toMatchObject({ id: request.id, status: 'done' });
    expect(body.request.finishedAt).toEqual(expect.any(String));
    const fixture = suggestFixture();
    expect(body.suggestions).toHaveLength(fixture.suggestions.length);
    expect(body.suggestions.length).toBeGreaterThanOrEqual(3);
    expect(body.suggestions[0]).toMatchObject({
      requestId: request.id,
      status: 'proposed',
      payload: {
        title: fixture.suggestions[0]?.title,
        sourceUrl: fixture.suggestions[0]?.sourceUrl,
      },
    });
    expect(
      body.suggestions.map(
        (s: { payload: { title: string } }) => s.payload.title,
      ),
    ).toEqual(fixture.suggestions.map((s) => s.title));
  });
});

/** Answers the chat completions in turn with `contents`; returns the request bodies it got. */
function answerInTurn(...contents: string[]) {
  const bodies: Record<string, unknown>[] = [];
  openclaw.use(
    http.post(CHAT_COMPLETIONS_URL, async ({ request }) => {
      bodies.push((await request.json()) as Record<string, unknown>);
      const content = contents[bodies.length - 1] ?? contents.at(-1) ?? '';
      return HttpResponse.json(completion(content));
    }),
  );
  return { bodies };
}

const VALID = () => JSON.stringify(suggestFixture());
const TOO_FEW = () =>
  JSON.stringify({ suggestions: suggestFixture().suggestions.slice(0, 2) });

describe('the recipe.suggest run', () => {
  it('asks the recipe agent with the recipe.suggest contract: the request plus the registry context', async () => {
    const calls = answerInTurn(VALID());

    await finished(await requested({ slots: ['lunch'], hint: 'с леща' }));

    expect(calls.bodies).toHaveLength(1);
    const body = calls.bodies[0] as {
      model: string;
      messages: { role: string; content: string }[];
      response_format: { json_schema: { name: string } };
    };
    expect(body.model).toBe('openclaw/family-recipe');
    expect(body.response_format.json_schema.name).toBe('recipe_suggest');
    const input = JSON.parse(body.messages[0]?.content ?? '');
    expect(input).toMatchObject({
      slots: ['lunch'],
      hint: 'с леща',
      existingRecipeTitles: [],
    });
    expect(input.ingredientNames).toContain('сол');
  });

  it('puts only recipes that are not archived into existingRecipeTitles', async () => {
    const recipe = (title: string) =>
      app.inject({
        method: 'POST',
        url: '/api/recipes',
        headers,
        payload: {
          title,
          servings: 2,
          steps: ['Свари.'],
          tags: [],
          ingredients: [],
        },
      });
    await recipe('Боб чорба');
    const archived = (await recipe('Стара мусака')).json().recipe;
    await app.inject({
      method: 'POST',
      url: `/api/recipes/${archived.id}/archive`,
      headers,
    });
    const calls = answerInTurn(VALID());

    await finished(await requested({ slots: ['lunch'] }));

    const body = calls.bodies[0] as { messages: { content: string }[] };
    expect(
      JSON.parse(body.messages[0]?.content ?? '').existingRecipeTitles,
    ).toEqual(['Боб чорба']);
  });

  it('takes nutritionPer100g: null, as strict structured outputs send it, as no nutrition', async () => {
    const output = suggestFixture();
    const [first] = output.suggestions;
    if (!first) {
      throw new Error('fixture without suggestions');
    }
    (first as Record<string, unknown>).nutritionPer100g = null;
    const calls = answerInTurn(JSON.stringify(output));

    const body = await finished(await requested({ slots: ['dinner'] }));

    expect(body.request.status).toBe('done');
    expect(calls.bodies).toHaveLength(1);
    expect(body.suggestions[0].payload).not.toHaveProperty('nutritionPer100g');
  });

  it('fails with invalid_output after two invalid answers and stores no suggestions', async () => {
    const calls = answerInTurn('Ето три рецепти: …', TOO_FEW());

    const body = await finished(await requested({ slots: ['breakfast'] }));

    expect(calls.bodies).toHaveLength(2);
    expect(body.request).toMatchObject({
      status: 'failed',
      error: 'invalid_output',
    });
    expect(body.request.finishedAt).toEqual(expect.any(String));
    expect(body.suggestions).toEqual([]);
  });
});

describe('without a gateway password', () => {
  it('is refused outside dev mode: only AUTH_MODE=dev may run with OpenClaw disabled', () => {
    const cloudflare: CloudflareAccessOptions = {
      mode: 'cloudflare',
      teamDomain: 'https://family-test.cloudflareaccess.com',
      audience: 'aud-tag',
      allowedEmails: ['dani@example.com'],
    };

    for (const openclaw of [
      { ...TEST_OPENCLAW, gatewayPassword: undefined },
      undefined,
    ]) {
      expect(() => buildTestApp({ auth: cloudflare, openclaw })).toThrow(
        /OpenClaw/,
      );
    }
  });

  it('answers 503 openclaw_unavailable in dev mode and stores no request', async () => {
    const disabled = buildTestApp({
      openclaw: { ...TEST_OPENCLAW, gatewayPassword: undefined },
    });
    await disabled.ready();
    try {
      const response = await postRequest({ slots: ['lunch'] }, disabled);

      expect(response.statusCode).toBe(503);
      expect(response.json()).toMatchObject({ error: 'openclaw_unavailable' });
      const list = await disabled.inject({
        method: 'GET',
        url: '/api/recipe-suggestions/requests',
        headers,
      });
      expect(list.json()).toEqual({ requests: [] });
    } finally {
      await disabled.close();
    }
  });
});

describe('POST /api/recipe-suggestions/requests validation', () => {
  it('refuses no slot, an unknown slot or time, and a hint over 200 characters', async () => {
    expect((await postRequest({ slots: [] })).statusCode).toBe(400);
    expect((await postRequest({ slots: ['snack'] })).statusCode).toBe(400);
    expect(
      (await postRequest({ slots: ['lunch'], times: ['10-20'] })).statusCode,
    ).toBe(400);
    expect(
      (await postRequest({ slots: ['lunch'], hint: 'а'.repeat(201) }))
        .statusCode,
    ).toBe(400);
  });
});

describe('GET /api/recipe-suggestions/requests', () => {
  it('lists the latest requests newest first, at most limit', async () => {
    const first = await finished(await requested({ slots: ['breakfast'] }));
    const second = await finished(await requested({ slots: ['lunch'] }));
    const third = await finished(await requested({ slots: ['dinner'] }));

    const response = await app.inject({
      method: 'GET',
      url: '/api/recipe-suggestions/requests?limit=2',
      headers,
    });

    expect(response.statusCode).toBe(200);
    expect(
      response.json().requests.map((r: SuggestionRequest) => r.id),
    ).toEqual([third.request.id, second.request.id]);
    expect(first.request.status).toBe('done');
  });

  it('answers 404 for an unknown request', async () => {
    const response = await getRequest('00000000-0000-4000-8000-000000000000');

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: 'not_found' });
  });
});

/** The first suggestion of a finished request. */
async function aSuggestion(): Promise<RecipeSuggestion> {
  const body = await finished(await requested({ slots: ['dinner'] }));
  return recipeSuggestionSchema.parse(body.suggestions[0]);
}

/** The edited suggestion the client sends on approval: its ingredients matched to real (seed) ingredients. */
async function editedInput(suggestion: RecipeSuggestion): Promise<RecipeInput> {
  const lines = [];
  for (const line of suggestion.payload.ingredients.filter((i) => !i.isNew)) {
    const response = await app.inject({
      method: 'GET',
      url: `/api/ingredients?q=${encodeURIComponent(line.name)}`,
      headers,
    });
    const found = ingredientsResponseSchema
      .parse(response.json())
      .ingredients.find((i) => i.name === line.name);
    if (!found) {
      throw new Error(`no seed ingredient ${line.name}`);
    }
    lines.push({
      ingredientId: found.id,
      quantity: line.quantity,
      unit: line.unit,
    });
  }
  const { title, servings, steps, sourceUrl, prepMinutes, tags } =
    suggestion.payload;
  return {
    title,
    servings,
    steps,
    sourceUrl,
    prepMinutes,
    tags,
    ingredients: lines,
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

describe('POST /api/recipe-suggestions/:id/approve', () => {
  it('creates the recipe from the edited suggestion and marks the suggestion approved; a second approve is 409', async () => {
    const suggestion = await aSuggestion();
    const input = await editedInput(suggestion);

    const response = await decide(suggestion.id, 'approve', input);

    expect(response.statusCode).toBe(201);
    const { recipe, suggestion: approved } =
      approvedSuggestionResponseSchema.parse(response.json());
    expect(recipe).toMatchObject({
      title: suggestion.payload.title,
      sourceUrl: suggestion.payload.sourceUrl,
    });
    expect(recipe.ingredients).toHaveLength(input.ingredients.length);
    expect(approved).toMatchObject({
      id: suggestion.id,
      status: 'approved',
      recipeId: recipe.id,
      decidedBy: POLI.id,
    });
    expect(approved.decidedAt).toEqual(expect.any(String));
    const registry = await app.inject({
      method: 'GET',
      url: `/api/recipes/${recipe.id}`,
      headers,
    });
    expect(registry.statusCode).toBe(200);

    const again = await decide(suggestion.id, 'approve', input);

    expect(again.statusCode).toBe(409);
    expect(again.json()).toMatchObject({
      error: 'conflict',
      suggestion: { id: suggestion.id, status: 'approved' },
    });
    const list = await app.inject({
      method: 'GET',
      url: '/api/recipes',
      headers,
    });
    expect(list.json().recipes).toHaveLength(1);
  });

  it('leaves the suggestion proposed when the recipe points at an unknown ingredient', async () => {
    const suggestion = await aSuggestion();
    const input = await editedInput(suggestion);
    input.ingredients.push({
      ingredientId: '00000000-0000-4000-8000-000000000000',
      quantity: 1,
      unit: 'pcs',
    });

    const response = await decide(suggestion.id, 'approve', input);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: 'invalid_reference' });
    const reject = await decide(suggestion.id, 'reject');
    expect(reject.statusCode).toBe(200);
  });

  it('answers 404 for an unknown suggestion', async () => {
    const suggestion = await aSuggestion();
    const response = await decide(
      '00000000-0000-4000-8000-000000000000',
      'approve',
      await editedInput(suggestion),
    );

    expect(response.statusCode).toBe(404);
  });
});

describe('POST /api/recipe-suggestions/:id/reject', () => {
  it('marks the suggestion rejected and keeps it with the request; deciding again is 409', async () => {
    const suggestion = await aSuggestion();

    const response = await decide(suggestion.id, 'reject');

    expect(response.statusCode).toBe(200);
    expect(response.json().suggestion).toMatchObject({
      id: suggestion.id,
      status: 'rejected',
      decidedBy: POLI.id,
    });
    expect(response.json().suggestion).not.toHaveProperty('recipeId');
    const detail = await getRequest(suggestion.requestId);
    expect(
      detail.json().suggestions.map((s: RecipeSuggestion) => s.status),
    ).toEqual(['rejected', 'proposed', 'proposed']);

    expect((await decide(suggestion.id, 'reject')).statusCode).toBe(409);
    expect(
      (await decide(suggestion.id, 'approve', await editedInput(suggestion)))
        .statusCode,
    ).toBe(409);
  });
});

describe('at start', () => {
  it('fails pending requests older than 10 minutes as stale, and leaves younger ones pending', async () => {
    // Arrange as a restart leaves it: two runs that were in flight when the previous process ended.
    const [old, young] = await testDb()
      .insert(recipeSuggestionRequest)
      .values([
        {
          slots: ['lunch'],
          requestedBy: DANI.id,
          createdAt: new Date(Date.now() - 11 * 60 * 1000),
        },
        {
          slots: ['dinner'],
          requestedBy: DANI.id,
          createdAt: new Date(Date.now() - 60 * 1000),
        },
      ])
      .returning({ id: recipeSuggestionRequest.id });

    const restarted = buildTestApp();
    await restarted.ready();
    try {
      const stale = await getRequest(old?.id ?? '', restarted);
      const pending = await getRequest(young?.id ?? '', restarted);

      expect(stale.json().request).toMatchObject({
        status: 'failed',
        error: 'stale',
      });
      expect(stale.json().request.finishedAt).toEqual(expect.any(String));
      expect(pending.json().request.status).toBe('pending');
    } finally {
      await restarted.close();
    }
  });
});
