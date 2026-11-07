import type { User } from '@family/shared';
import { eq, ne } from 'drizzle-orm';
import type { DbExecutor } from '../client.js';
import { user } from '../schema/user.js';

/** API shape of a user: the DB row without `created_at`. */
const userColumns = {
  id: user.id,
  name: user.name,
  role: user.role,
  initial: user.initial,
  color: user.color,
};

/** Everyone, the service user Рецептурко too (ADR-0014): for names of whoever acted. */
export async function listUsers(db: DbExecutor): Promise<User[]> {
  return db.select(userColumns).from(user).orderBy(user.name);
}

/** The people of the family, without service users (role `app`, ADR-0014): who eats, cooks and gets notified. */
export async function listPeople(db: DbExecutor): Promise<User[]> {
  return db
    .select(userColumns)
    .from(user)
    .where(ne(user.role, 'app'))
    .orderBy(user.name);
}

export async function findUser(
  db: DbExecutor,
  id: string,
): Promise<User | undefined> {
  const [row] = await db
    .select(userColumns)
    .from(user)
    .where(eq(user.id, id))
    .limit(1);
  return row;
}
