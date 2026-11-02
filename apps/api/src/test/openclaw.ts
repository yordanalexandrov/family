import type {
  RecipeNormalizeInput,
  RecipeReviseInput,
  RecipeReviseOutput,
} from '@family/shared';
import normalizeInput from '@family/shared/fixtures/recipe-normalize.input.json' with {
  type: 'json',
};
import normalizeFixture from '@family/shared/fixtures/recipe-normalize.valid.json' with {
  type: 'json',
};
import reviseInput from '@family/shared/fixtures/recipe-revise.input.json' with {
  type: 'json',
};
import reviseFixture from '@family/shared/fixtures/recipe-revise.valid.json' with {
  type: 'json',
};
import fixture from '@family/shared/fixtures/recipe-suggest.valid.json' with {
  type: 'json',
};
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { OpenClawConfig } from '../config.js';

/** Where specs point the OpenClaw client; msw answers for it, nothing listens there. */
export const TEST_OPENCLAW: OpenClawConfig = {
  url: 'http://openclaw.test',
  gatewayPassword: 'test-gateway-password',
  recipeAgent: 'family-recipe',
  menuAgent: 'family-menu',
  mealAgent: 'family-meal',
  importAgent: 'family-import',
  refineAgent: 'family-refine',
  cookAgent: 'family-cook',
  reviseAgent: 'family-revise',
  timeoutMs: 2_000,
  cookTimeoutMs: 2_000,
};

export const CHAT_COMPLETIONS_URL = `${TEST_OPENCLAW.url}/v1/chat/completions`;

/** The recorded `recipe.suggest` answer from `packages/shared`, cloned so a spec can break it. */
export function suggestFixture(): typeof fixture {
  return structuredClone(fixture);
}

/**
 * The recorded `recipe.normalize` answer from `packages/shared` for `input`: its lines are linked to the fixture's
 * registry, so each `ingredientId` is swapped for the id of the same name in `input.ingredients` (the seed products of
 * the test database, whose ids differ per run). Cloned, so a spec can break it.
 */
export function normalizeAnswer(input: RecipeNormalizeInput) {
  const answer = structuredClone(normalizeFixture) as {
    recipe: {
      ingredients: { ingredientId: string | null }[];
    } | null;
    noResults: string | null;
  };
  const names = new Map(normalizeInput.ingredients.map((i) => [i.id, i.name]));
  const ids = new Map(input.ingredients.map((i) => [i.name, i.id]));
  for (const line of answer.recipe?.ingredients ?? []) {
    if (line.ingredientId !== null) {
      const id = ids.get(names.get(line.ingredientId) ?? '');
      if (!id) {
        throw new Error(`no registry ingredient for ${line.ingredientId}`);
      }
      line.ingredientId = id;
    }
  }
  return answer;
}

/**
 * The recorded `recipe.revise` answer from `packages/shared` for `input`, its lines linked to the ids of the same names
 * in `input.ingredients` (the seed products of the test database). Cloned, so a spec can change it.
 */
export function reviseAnswer(input: RecipeReviseInput): RecipeReviseOutput {
  // As the agent writes it (`rack: null`), which the contract reads as `RecipeReviseOutput`.
  const answer = structuredClone(
    reviseFixture,
  ) as unknown as RecipeReviseOutput;
  const names = new Map(reviseInput.ingredients.map((i) => [i.id, i.name]));
  const ids = new Map(input.ingredients.map((i) => [i.name, i.id]));
  for (const line of answer.recipe?.ingredients ?? []) {
    if (line.ingredientId !== null) {
      const id = ids.get(names.get(line.ingredientId) ?? '');
      if (!id) {
        throw new Error(`no registry ingredient for ${line.ingredientId}`);
      }
      line.ingredientId = id;
    }
  }
  return answer;
}

/** A non-streaming Chat Completions body whose message is `content`, as the gateway sends it. */
export function completion(content: string) {
  return {
    id: 'chatcmpl-test',
    object: 'chat.completion',
    created: 0,
    model: 'openclaw/family-recipe',
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content },
        finish_reason: 'stop',
      },
    ],
    usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
  };
}

/** Answers every chat completion with the fixture; specs replace it with `openclaw.use(...)`. */
export const openclaw = setupServer(
  http.post(CHAT_COMPLETIONS_URL, () =>
    HttpResponse.json(completion(JSON.stringify(suggestFixture()))),
  ),
);
