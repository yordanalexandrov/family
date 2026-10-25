import { meResponseSchema, usersResponseSchema } from '@family/shared';
import { useQuery } from '@tanstack/react-query';
import { useActingUser } from '../app/acting-user';
import { apiFetch } from './client';

export const queryKeys = {
  users: ['users'] as const,
  me: (actingUserId: string | null) => ['me', actingUserId] as const,
};

export function fetchUsers() {
  return apiFetch('/users', usersResponseSchema).then((body) => body.users);
}

export function fetchMe() {
  return apiFetch('/me', meResponseSchema);
}

export function useUsers() {
  return useQuery({ queryKey: queryKeys.users, queryFn: fetchUsers });
}

export function useMe() {
  const { actingUserId } = useActingUser();
  return useQuery({
    queryKey: queryKeys.me(actingUserId),
    queryFn: fetchMe,
    enabled: actingUserId !== null,
  });
}
