import type { User } from '@family/shared';
import type { Db } from '../db/client.js';
import { listUsers } from '../db/repositories/users.js';

/** Users change only through migrations, so a minute of staleness is harmless and spares a query per request. */
const USERS_TTL_MS = 60_000;

/** The family's users (GLOSSARY: Потребител), read from the database at most once a minute. */
export interface UsersService {
  /** Everyone, ordered by name. */
  list(): Promise<User[]>;
  /** The user with this id (a lowercase UUID), or `undefined`. */
  find(id: string): Promise<User | undefined>;
}

/** `buildApp()` creates one per app instance, so the cache lives as long as the app. */
export function createUsersService(db: Db): UsersService {
  let cache:
    | { users: User[]; byId: Map<string, User>; expiresAt: number }
    | undefined;

  async function load() {
    if (!cache || Date.now() >= cache.expiresAt) {
      const users = await listUsers(db);
      cache = {
        users,
        byId: new Map(users.map((user) => [user.id, user])),
        expiresAt: Date.now() + USERS_TTL_MS,
      };
    }
    return cache;
  }

  return {
    async list() {
      return (await load()).users;
    },
    async find(id) {
      return (await load()).byId.get(id);
    },
  };
}
