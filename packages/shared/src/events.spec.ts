import { describe, expect, it } from 'vitest';
import { SERVER_EVENT_TYPES, serverEventSchema } from './events.js';

describe('serverEventSchema', () => {
  it('accepts menu.changed and shopping.changed for a week', () => {
    for (const type of ['menu.changed', 'shopping.changed']) {
      expect(
        serverEventSchema.parse({ type, weekStart: '2026-11-02' }),
      ).toEqual({ type, weekStart: '2026-11-02' });
    }
  });

  it('rejects a weekStart that is not a Monday', () => {
    expect(
      serverEventSchema.safeParse({
        type: 'menu.changed',
        weekStart: '2026-11-03',
      }).success,
    ).toBe(false);
  });

  it('rejects an unknown signal', () => {
    expect(
      serverEventSchema.safeParse({
        type: 'recipes.changed',
        weekStart: '2026-11-02',
      }).success,
    ).toBe(false);
  });
});

describe('SERVER_EVENT_TYPES', () => {
  it('lists every signal of the schema, for the client to subscribe to', () => {
    expect(SERVER_EVENT_TYPES).toEqual(['menu.changed', 'shopping.changed']);
  });
});
