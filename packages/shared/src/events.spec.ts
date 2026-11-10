import { describe, expect, it } from 'vitest';
import { SERVER_EVENT_TYPES, serverEventSchema } from './events.js';

describe('serverEventSchema', () => {
  it('accepts menu.changed, menu.proposal.changed, menu.rework.changed and shopping.changed for a week', () => {
    for (const type of [
      'menu.changed',
      'menu.proposal.changed',
      'menu.rework.changed',
      'shopping.changed',
    ]) {
      expect(
        serverEventSchema.parse({ type, weekStart: '2026-11-02' }),
      ).toEqual({ type, weekStart: '2026-11-02' });
    }
  });

  it('accepts shopping.changed without a week: every list changed (e.g. the pantry)', () => {
    expect(serverEventSchema.parse({ type: 'shopping.changed' })).toEqual({
      type: 'shopping.changed',
    });
  });

  it('rejects menu.changed, menu.proposal.changed and menu.rework.changed without a week', () => {
    for (const type of [
      'menu.changed',
      'menu.proposal.changed',
      'menu.rework.changed',
    ]) {
      expect(serverEventSchema.safeParse({ type }).success).toBe(false);
    }
  });

  it('accepts inbox.changed only with the person whose inbox changed', () => {
    const userId = '11111111-1111-4111-8111-111111111111';
    expect(serverEventSchema.parse({ type: 'inbox.changed', userId })).toEqual({
      type: 'inbox.changed',
      userId,
    });
    expect(serverEventSchema.safeParse({ type: 'inbox.changed' }).success).toBe(
      false,
    );
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
    expect(SERVER_EVENT_TYPES).toEqual([
      'menu.changed',
      'menu.proposal.changed',
      'menu.rework.changed',
      'shopping.changed',
      'inbox.changed',
    ]);
  });
});
