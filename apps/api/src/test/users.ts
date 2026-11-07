import type { User } from '@family/shared';

/** Expected values in specs: the two people that `drizzle/0001_seed_users.sql` inserts, as the API returns them. */
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

/** The service user of Рецептурник (ADR-0014) that `drizzle/0040_seed_app_user.sql` inserts; not a person. */
export const RECEPTURKO: User = {
  id: '33333333-3333-4333-8333-333333333333',
  name: 'Рецептурко',
  role: 'app',
  initial: 'Р',
  color: 'person-app',
};
