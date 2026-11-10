import { describe, expect, it } from 'vitest';
import { inboxItemSchema } from './inbox.js';

const item = {
  id: '6a1e8a52-3f43-4c7e-9a43-2b1f1d4a0c11',
  kind: 'thaw',
  title: 'Извади месото за утре',
  body: 'Мусака: смесена кайма, свински врат',
  url: '/menu?week=2026-11-02&meal=6a1e8a52-3f43-4c7e-9a43-2b1f1d4a0c12',
  details: [
    { text: 'Във фризера: смесена кайма', url: '/pantry' },
    { text: 'Готви: Поли' },
  ],
  createdAt: '2026-11-04T18:00:00.000Z',
  updatedAt: '2026-11-04T18:00:00.000Z',
  unread: true,
};

describe('inboxItemSchema', () => {
  it('accepts a notification of the inbox as the api gives it', () => {
    expect(inboxItemSchema.parse(item)).toEqual(item);
  });

  it('rejects a link out of the app, in the details too, and a kind that is not a notification kind', () => {
    const result = inboxItemSchema.safeParse({
      ...item,
      url: '//evil.example.com/menu',
      kind: 'test',
      details: [{ text: 'Рецепта', url: 'https://evil.example.com' }],
    });

    expect(result.error?.issues.map((issue) => issue.path.join('.'))).toEqual([
      'kind',
      'url',
      'details.0.url',
    ]);
  });
});
