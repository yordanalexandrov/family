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
  timeoutMs: 2_000,
};

export const CHAT_COMPLETIONS_URL = `${TEST_OPENCLAW.url}/v1/chat/completions`;

/** The recorded `recipe.suggest` answer from `packages/shared`, cloned so a spec can break it. */
export function suggestFixture(): typeof fixture {
  return structuredClone(fixture);
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
