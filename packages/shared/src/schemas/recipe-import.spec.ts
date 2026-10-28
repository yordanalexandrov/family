import { describe, expect, it } from 'vitest';
import { recipeImportRequestSchema } from './recipe-import.js';

const DANI = '11111111-1111-4111-8111-111111111111';
const REQUEST = '77777777-7777-4777-8777-777777777777';

describe('recipeImportRequestSchema', () => {
  const pending = {
    id: REQUEST,
    status: 'pending',
    source: 'text',
    requestedBy: DANI,
    createdAt: '2026-10-25T18:00:00.000Z',
  };

  it('accepts a pending text import without a link', () => {
    expect(recipeImportRequestSchema.parse(pending)).toEqual(pending);
  });

  it('accepts a done import with its link, suggestion and its title', () => {
    const done = {
      ...pending,
      status: 'done',
      url: 'https://blog.example/pile-s-oriz',
      finishedAt: '2026-10-25T18:01:00.000Z',
      suggestionId: '88888888-8888-4888-8888-888888888889',
      title: 'Пилешко филе с ориз на фурна',
    };

    expect(recipeImportRequestSchema.parse(done)).toEqual(done);
  });

  it('refuses an unknown source', () => {
    expect(
      recipeImportRequestSchema.safeParse({ ...pending, source: 'video' })
        .success,
    ).toBe(false);
  });
});
