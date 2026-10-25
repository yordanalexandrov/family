import type { User } from '@family/shared';
import { eq } from 'drizzle-orm';
import type { Db } from '../client.js';
import { user } from '../schema/user.js';

/** API shape of a user: the DB row without `created_at`. */
const userColumns = {
  id: user.id,
  name: user.name,
  role: user.role,
  initial: user.initial,
  color: user.color,
};

export async function listUsers(db: Db): Promise<User[]> {
  return db.select(userColumns).from(user).orderBy(user.name);
}

export async function findUser(db: Db, id: string): Promise<User | undefined> {
  const [row] = await db
    .select(userColumns)
    .from(user)
    .where(eq(user.id, id))
    .limit(1);
  return row;
}
