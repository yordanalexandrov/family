import { describe, expect, it } from 'vitest';
import fixture from '../contracts/fixtures/recipe-suggest.valid.json' with {
  type: 'json',
};
import {
  recipeSuggestionSchema,
  suggestionFailureSchema,
  suggestionRequestSchema,
} from './recipe-suggestion.js';

const DANI = '11111111-1111-4111-8111-111111111111';
const REQUEST = '77777777-7777-4777-8777-777777777777';

const [suggestion] = fixture.suggestions;

describe('suggestionRequestSchema', () => {
  const pending = {
    id: REQUEST,
    slots: ['dinner'],
    times: [],
    tags: [],
    status: 'pending',
    requestedBy: DANI,
    createdAt: '2026-10-25T18:00:00.000Z',
  };

  it('accepts a pending request without a result yet', () => {
    expect(suggestionRequestSchema.parse(pending)).toEqual(pending);
  });

  it('accepts a failed request with its error and finish time', () => {
    const failed = {
      ...pending,
      times: ['15-30'],
      hint: 'нещо с риба',
      status: 'failed',
      error: 'timeout',
      finishedAt: '2026-10-25T18:03:00.000Z',
    };

    expect(suggestionRequestSchema.parse(failed)).toEqual(failed);
  });

  it('rejects an unknown status', () => {
    expect(
      suggestionRequestSchema.safeParse({ ...pending, status: 'running' })
        .success,
    ).toBe(false);
  });
});

describe('suggestionFailureSchema', () => {
  it('accepts the failure codes of a run and http_<status>', () => {
    for (const code of [
      'timeout',
      'invalid_output',
      'aborted',
      'stale',
      'error',
      'http_502',
    ]) {
      expect(suggestionFailureSchema.parse(code)).toBe(code);
    }
  });

  it('rejects codes no run produces', () => {
    for (const code of ['openclaw_unavailable', 'http_', 'http_abc', '']) {
      expect(suggestionFailureSchema.safeParse(code).success).toBe(false);
    }
  });
});

describe('recipeSuggestionSchema', () => {
  const proposed = {
    id: '88888888-8888-4888-8888-888888888888',
    requestId: REQUEST,
    payload: suggestion,
    status: 'proposed',
  };

  it('accepts a proposed suggestion carrying the contract payload', () => {
    expect(recipeSuggestionSchema.parse(proposed)).toEqual(proposed);
  });

  it('accepts an approved suggestion that points to its recipe', () => {
    const approved = {
      ...proposed,
      status: 'approved',
      recipeId: '66666666-6666-4666-8666-666666666666',
      decidedBy: DANI,
      decidedAt: '2026-10-25T18:10:00.000Z',
    };

    expect(recipeSuggestionSchema.parse(approved)).toEqual(approved);
  });

  it('does not use the reserved status verified yet', () => {
    expect(
      recipeSuggestionSchema.safeParse({ ...proposed, status: 'verified' })
        .success,
    ).toBe(false);
  });
});
