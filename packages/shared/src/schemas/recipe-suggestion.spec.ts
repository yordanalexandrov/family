import { describe, expect, it } from 'vitest';
import normalizeFixture from '../contracts/fixtures/recipe-normalize.valid.json' with {
  type: 'json',
};
import fixture from '../contracts/fixtures/recipe-suggest.valid.json' with {
  type: 'json',
};
import {
  anyRecipeSuggestionSchema,
  recipeSuggestionSchema,
  suggestionRequestSchema,
} from './recipe-suggestion.js';

const DANI = '11111111-1111-4111-8111-111111111111';
const REQUEST = '77777777-7777-4777-8777-777777777777';

/** A contract's recipe as stored in a suggestion: its steps of text become step objects. */
function stored<T extends { steps: string[] }>(recipe: T) {
  return { ...recipe, steps: recipe.steps.map((text) => ({ text })) };
}

const [contractSuggestion] = fixture.suggestions;
const suggestion = contractSuggestion && stored(contractSuggestion);

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

describe('recipeSuggestionSchema', () => {
  const proposed = {
    id: '88888888-8888-4888-8888-888888888888',
    origin: 'suggest',
    requestId: REQUEST,
    payload: suggestion,
    status: 'proposed',
  };

  it('accepts a proposed suggestion carrying the contract payload with its steps as objects', () => {
    expect(recipeSuggestionSchema.parse(proposed)).toEqual(proposed);
  });

  it('accepts a step with a photo and refuses steps of text, as the contract gives them', () => {
    const withPhoto = {
      ...proposed,
      payload: {
        ...suggestion,
        steps: [
          { text: 'Нарежи.', photoId: '99999999-9999-4999-8999-999999999999' },
          { text: 'Изпечи.' },
        ],
      },
    };

    expect(recipeSuggestionSchema.parse(withPhoto)).toEqual(withPhoto);
    expect(
      recipeSuggestionSchema.safeParse({
        ...proposed,
        payload: contractSuggestion,
      }).success,
    ).toBe(false);
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

describe('anyRecipeSuggestionSchema', () => {
  const IMPORT = '55555555-5555-4555-8555-555555555555';
  // The contract's steps carry the agent's photo reference; a stored step has text (and a photo id) only.
  const { nutritionPer100g: _none, ...recipe } = {
    ...normalizeFixture.recipe,
    steps: normalizeFixture.recipe.steps.map(({ text }) => ({ text })),
  };
  const imported = {
    id: '88888888-8888-4888-8888-888888888889',
    origin: 'import',
    importRequestId: IMPORT,
    payload: recipe,
    status: 'proposed',
  };

  it('accepts a suggestion of a suggestion request and one of an import, told apart by origin', () => {
    const suggested = {
      id: '88888888-8888-4888-8888-888888888888',
      origin: 'suggest',
      requestId: REQUEST,
      payload: suggestion,
      status: 'proposed',
    };

    expect(anyRecipeSuggestionSchema.parse(suggested)).toEqual(suggested);
    expect(anyRecipeSuggestionSchema.parse(imported)).toEqual(imported);
  });

  it('refuses an import whose payload is a recipe.suggest one, and the other way round', () => {
    expect(
      anyRecipeSuggestionSchema.safeParse({ ...imported, payload: suggestion })
        .success,
    ).toBe(false);
    expect(
      anyRecipeSuggestionSchema.safeParse({
        ...imported,
        origin: 'suggest',
        requestId: REQUEST,
      }).success,
    ).toBe(false);
  });
});
