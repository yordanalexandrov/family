import type { User } from '@family/shared';

/** Expected values in specs: the two users that `drizzle/0001_seed_users.sql` inserts, as the API returns them. */
export const DANI: User = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Дани',
  role: 'parent',
  initial: 'Д',
  color: 'person-1',
};

export const POLI: User = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Поли',
  role: 'parent',
  initial: 'П',
  color: 'person-2',
};
