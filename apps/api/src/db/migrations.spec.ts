import { describe, expect, it } from 'vitest';
import { testDb } from '../test/db.js';
import { listUsers } from './repositories/users.js';

describe('migrations', () => {
  it('seed leaves exactly Дани and Поли in user', async () => {
    expect(await listUsers(testDb())).toEqual([
      {
        id: '11111111-1111-4111-8111-111111111111',
        name: 'Дани',
        role: 'parent',
        initial: 'Д',
        color: 'person-1',
      },
      {
        id: '22222222-2222-4222-8222-222222222222',
        name: 'Поли',
        role: 'parent',
        initial: 'П',
        color: 'person-2',
      },
    ]);
  });
});
