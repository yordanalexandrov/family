import { describe, expect, it } from 'vitest';
import { listUsers } from '../db/repositories/users.js';
import { user } from '../db/schema/user.js';
import { resetDatabase, testDb } from './db.js';

describe('resetDatabase', () => {
  it('restores Дани and Поли after a test emptied the table', async () => {
    const db = testDb();
    await db.delete(user);
    expect(await listUsers(db)).toEqual([]);

    await resetDatabase(db);

    expect((await listUsers(db)).map((u) => u.name)).toEqual(['Дани', 'Поли']);
  });
});
