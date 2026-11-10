import { describe, expect, it } from 'vitest';
import { inboxGroups } from './groups.js';

/** Thursday 5 November 2026, 09:00 in Sofia (EET, UTC+2). */
const NOW = new Date('2026-11-05T07:00:00Z');

function item(id: string, updatedAt: string) {
  return { id, updatedAt };
}

describe('inboxGroups', () => {
  it('puts the items of today, of yesterday and the earlier ones in their groups, keeping their order', () => {
    const items = [
      item('a', '2026-11-05T06:00:00.000Z'),
      // 00:30 on Thursday in Sofia, still Wednesday in UTC.
      item('b', '2026-11-04T22:30:00.000Z'),
      item('c', '2026-11-04T08:00:00.000Z'),
      // 23:59 on Tuesday in Sofia.
      item('d', '2026-11-03T21:59:00.000Z'),
      item('e', '2026-10-10T10:00:00.000Z'),
    ];

    expect(inboxGroups(items, NOW)).toEqual([
      { label: 'Днес', items: [items[0], items[1]] },
      { label: 'Вчера', items: [items[2]] },
      { label: 'По-рано', items: [items[3], items[4]] },
    ]);
  });

  it('leaves out a group without items', () => {
    const items = [item('a', '2026-10-10T10:00:00.000Z')];

    expect(inboxGroups(items, NOW)).toEqual([{ label: 'По-рано', items }]);
    expect(inboxGroups([], NOW)).toEqual([]);
  });
});
