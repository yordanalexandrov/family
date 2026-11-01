import {
  type CookingAskInput,
  type CookingQuestion,
  cookingQuestionSchema,
  ingredientsResponseSchema,
  type RecipeInput,
  recipeResponseSchema,
} from '@family/shared';
import type { FastifyInstance } from 'fastify';
import { delay, HttpResponse, http } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp } from '../test/app.js';
import {
  CHAT_COMPLETIONS_URL,
  completion,
  openclaw,
  TEST_OPENCLAW,
} from '../test/openclaw.js';
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

const ANSWER =
  'Да. За 2 порции сложи около 200 g pulp вместо 2-та домата и задуши 10 минути.';

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

/** A recipe for 4 with grated tomatoes on step 2 and the oven in its preparation. */
async function createdRecipe(target = app) {
  const input: RecipeInput = {
    title: 'Пиле с домати',
    servings: 4,
    tags: ['dinner'],
    steps: [
      { text: 'Нарежи лука и го запържи 5 минути.' },
      { text: 'Настържи 4 домата и ги добави.' },
      { text: 'Печи 30 минути.' },
    ],
    ingredients: [
      {
        ingredientId: await seedIngredientId('домат'),
        quantity: 4,
        unit: 'pcs',
        note: 'зрели',
      },
      {
        ingredientId: await seedIngredientId('ориз'),
        quantity: 1.5,
        unit: 'kg',
      },
      {
        ingredientId: await seedIngredientId('сол'),
        quantity: null,
        unit: 'pinch',
      },
    ],
    preparation: [{ kind: 'oven', degrees: 200, fan: 'fan' }],
  };
  const response = await target.inject({
    method: 'POST',
    url: '/api/recipes',
    headers,
    payload: input,
  });
  expect(response.statusCode).toBe(201);
  return recipeResponseSchema.parse(response.json()).recipe;
}

const QUESTION = {
  question: 'Мога ли с консерва pulp вместо доматите?',
  step: 1,
  servings: 2,
};

function ask(
  recipeId: string,
  payload: object = QUESTION,
  {
    target = app,
    acting = true,
  }: { target?: FastifyInstance; acting?: boolean } = {},
) {
  return target.inject({
    method: 'POST',
    url: `/api/recipes/${recipeId}/questions`,
    ...(acting ? { headers } : {}),
    payload,
  });
}

async function asked(
  recipeId: string,
  payload: object = QUESTION,
  options: { target?: FastifyInstance; acting?: boolean } = {},
): Promise<CookingQuestion> {
  const response = await ask(recipeId, payload, options);
  expect(response.statusCode).toBe(202);
  return cookingQuestionSchema.parse(response.json().request);
}

/** Polls `GET /api/recipes/questions/:id` without an acting user (as the kiosk does) until the run has finished. */
async function finished(
  question: CookingQuestion,
  target = app,
): Promise<CookingQuestion> {
  const deadline = Date.now() + 5_000;
  for (;;) {
    const response = await target.inject({
      method: 'GET',
      url: `/api/recipes/questions/${question.id}`,
    });
    expect(response.statusCode).toBe(200);
    const body = cookingQuestionSchema.parse(response.json().request);
    if (body.status !== 'pending') {
      return body;
    }
    if (Date.now() > deadline) {
      throw new Error(`question ${question.id} still pending`);
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

interface ChatBody {
  model: string;
  messages: { role: string; content: string }[];
}

/** Answers every chat completion with `answer`; returns the contract inputs and the agents it was sent to. */
function answering(answer: unknown = { answer: ANSWER }) {
  const sent: { input: CookingAskInput; model: string }[] = [];
  openclaw.use(
    http.post(CHAT_COMPLETIONS_URL, async ({ request }) => {
      const body = (await request.json()) as ChatBody;
      sent.push({
        input: JSON.parse(body.messages[0]?.content ?? '') as CookingAskInput,
        model: body.model,
      });
      return HttpResponse.json(completion(JSON.stringify(answer)));
    }),
  );
  return sent;
}

describe('POST /api/recipes/:id/questions', () => {
  it('answers 202 with a pending question, then holds the agent’s answer', async () => {
    const recipe = await createdRecipe();
    const sent = answering();

    const pending = await asked(recipe.id);
    expect(pending).toMatchObject({
      recipeId: recipe.id,
      question: QUESTION.question,
      step: 1,
      servings: 2,
      status: 'pending',
      requestedBy: DANI.id,
    });
    expect(pending.answer).toBeUndefined();

    const done = await finished(pending);
    expect(done).toMatchObject({ status: 'done', answer: ANSWER });
    expect(done.finishedAt).toBeDefined();
    expect(sent.map(({ model }) => model)).toEqual(['openclaw/family-cook']);
  });

  it('sends the agent the recipe by the shown servings, the current step, the enabled appliances and the question, with no history for the first of a chain', async () => {
    const recipe = await createdRecipe();
    const disabled = await app.inject({
      method: 'PUT',
      url: '/api/appliances/a0000000-0000-4000-8000-000000000006',
      headers,
      payload: { enabled: false },
    });
    expect(disabled.statusCode).toBe(200);
    const sent = answering();

    await finished(await asked(recipe.id));

    expect(sent).toHaveLength(1);
    const input = sent[0]?.input;
    expect(input).toEqual({
      recipe: {
        title: 'Пиле с домати',
        servings: 4,
        shownServings: 2,
        ingredients: [
          { name: 'домат', quantity: 2, unit: 'pcs', note: 'зрели' },
          { name: 'ориз', quantity: 750, unit: 'g' },
          { name: 'сол', quantity: null, unit: 'pinch' },
        ],
        steps: [
          { number: 1, text: 'Нарежи лука и го запържи 5 минути.' },
          { number: 2, text: 'Настържи 4 домата и ги добави.' },
          { number: 3, text: 'Печи 30 минути.' },
        ],
        preparation: [{ kind: 'oven', degrees: 200, fan: 'fan' }],
      },
      currentStep: 2,
      appliances: expect.any(Array),
      history: [],
      question: QUESTION.question,
    });
    expect(input?.appliances).toHaveLength(5);
    expect(input?.appliances).not.toContain('пасатор');
  });

  it('is allowed without an acting user, as on the kiosk', async () => {
    const recipe = await createdRecipe();
    answering();

    const pending = await asked(recipe.id, QUESTION, { acting: false });

    expect(pending.requestedBy).toBeNull();
    expect(await finished(pending)).toMatchObject({
      status: 'done',
      answer: ANSWER,
      requestedBy: null,
    });
  });

  it('fails invalid_output when the answer is empty, even after the retry', async () => {
    const recipe = await createdRecipe();
    const sent = answering({ answer: '' });

    const done = await finished(await asked(recipe.id));

    expect(done).toMatchObject({ status: 'failed', error: 'invalid_output' });
    expect(done.answer).toBeUndefined();
    expect(sent).toHaveLength(2);
  });

  it('fails timeout after the question’s own time limit, shorter than the other contracts’', async () => {
    const quick = buildTestApp({
      openclaw: { ...TEST_OPENCLAW, cookTimeoutMs: 100 },
    });
    await quick.ready();
    try {
      const recipe = await createdRecipe(quick);
      openclaw.use(
        http.post(CHAT_COMPLETIONS_URL, async () => {
          await delay(500);
          return HttpResponse.json(
            completion(JSON.stringify({ answer: ANSWER })),
          );
        }),
      );

      const done = await finished(
        await asked(recipe.id, QUESTION, { target: quick }),
        quick,
      );

      expect(done).toMatchObject({ status: 'failed', error: 'timeout' });
    } finally {
      await quick.close();
    }
  });

  it('answers 404 for an unknown recipe and 400 for a step or a question it cannot take', async () => {
    const recipe = await createdRecipe();

    const unknown = await ask('00000000-0000-4000-8000-000000000000');
    expect(unknown.statusCode).toBe(404);
    expect(unknown.json()).toMatchObject({ error: 'not_found' });

    const pastLastStep = await ask(recipe.id, { ...QUESTION, step: 3 });
    expect(pastLastStep.statusCode).toBe(400);

    const tooLong = await ask(recipe.id, {
      ...QUESTION,
      question: 'а'.repeat(301),
    });
    expect(tooLong.statusCode).toBe(400);
  });

  it('never changes the recipe', async () => {
    const recipe = await createdRecipe();
    answering();

    await finished(await asked(recipe.id));

    const response = await app.inject({
      method: 'GET',
      url: `/api/recipes/${recipe.id}`,
    });
    expect(recipeResponseSchema.parse(response.json()).recipe).toEqual(recipe);
  });
});

describe('a follow-up question (follows)', () => {
  it('sends the agent the last 5 questions of the chain with their answers, oldest first', async () => {
    const recipe = await createdRecipe();
    const sent: CookingAskInput[] = [];
    openclaw.use(
      http.post(CHAT_COMPLETIONS_URL, async ({ request }) => {
        const body = (await request.json()) as ChatBody;
        const input = JSON.parse(
          body.messages[0]?.content ?? '',
        ) as CookingAskInput;
        sent.push(input);
        return HttpResponse.json(
          completion(
            JSON.stringify({ answer: `Отговор на ${input.question}` }),
          ),
        );
      }),
    );

    let follows: string | undefined;
    for (const n of [1, 2, 3, 4, 5, 6]) {
      const done = await finished(
        await asked(recipe.id, {
          ...QUESTION,
          question: `Въпрос ${n}`,
          ...(follows ? { follows } : {}),
        }),
      );
      expect(done.follows).toBe(follows);
      follows = done.id;
    }
    const last = await finished(
      await asked(recipe.id, {
        ...QUESTION,
        question: 'а колко дълго да я варя тогава?',
        follows,
      }),
    );

    expect(last.status).toBe('done');
    expect(sent[0]?.history).toEqual([]);
    expect(sent.at(-1)?.history).toEqual(
      [2, 3, 4, 5, 6].map((n) => ({
        question: `Въпрос ${n}`,
        answer: `Отговор на Въпрос ${n}`,
      })),
    );
  });

  it('answers 409 while a question of the chain still waits, and takes a new chain meanwhile', async () => {
    const recipe = await createdRecipe();
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let calls = 0;
    openclaw.use(
      http.post(CHAT_COMPLETIONS_URL, async () => {
        calls += 1;
        if (calls === 2) {
          await held;
        }
        return HttpResponse.json(
          completion(JSON.stringify({ answer: ANSWER })),
        );
      }),
    );
    const first = await finished(await asked(recipe.id));
    const waiting = await asked(recipe.id, {
      ...QUESTION,
      question: 'А цели доматки?',
      follows: first.id,
    });

    try {
      const onWaiting = await ask(recipe.id, {
        ...QUESTION,
        question: 'а колко дълго да я варя тогава?',
        follows: waiting.id,
      });
      expect(onWaiting.statusCode).toBe(409);
      expect(onWaiting.json()).toMatchObject({ error: 'conflict' });

      const besideWaiting = await ask(recipe.id, {
        ...QUESTION,
        question: 'а колко дълго да я варя тогава?',
        follows: first.id,
      });
      expect(besideWaiting.statusCode).toBe(409);

      const newChain = await ask(recipe.id, {
        ...QUESTION,
        question: 'Колко сол?',
      });
      expect(newChain.statusCode).toBe(202);
    } finally {
      release();
    }

    const answered = await finished(waiting);
    expect(answered.status).toBe('done');
    const afterAnswer = await ask(recipe.id, {
      ...QUESTION,
      question: 'а колко дълго да я варя тогава?',
      follows: answered.id,
    });
    expect(afterAnswer.statusCode).toBe(202);
    await finished(cookingQuestionSchema.parse(afterAnswer.json().request));
  });

  it('answers 404 for a follows that is not a question of this recipe', async () => {
    const recipe = await createdRecipe();
    const other = await createdRecipe();
    answering();
    const ofOther = await finished(await asked(other.id));

    const fromOther = await ask(recipe.id, {
      ...QUESTION,
      follows: ofOther.id,
    });
    expect(fromOther.statusCode).toBe(404);
    expect(fromOther.json()).toMatchObject({ error: 'not_found' });

    const unknown = await ask(recipe.id, {
      ...QUESTION,
      follows: '00000000-0000-4000-8000-000000000000',
    });
    expect(unknown.statusCode).toBe(404);
  });
});

describe('GET /api/recipes/questions/:id', () => {
  it('answers 404 for an unknown question', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/recipes/questions/00000000-0000-4000-8000-000000000000',
    });

    expect(response.statusCode).toBe(404);
  });
});
