import { z } from 'zod';

export const userSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  role: z.enum(['parent']),
  initial: z.string().length(1),
  color: z.string(),
});

export type User = z.infer<typeof userSchema>;

export const usersResponseSchema = z.object({
  users: z.array(userSchema),
});

export type UsersResponse = z.infer<typeof usersResponseSchema>;

export const meResponseSchema = z.object({
  user: userSchema,
  accessEmail: z.email(),
});

export type MeResponse = z.infer<typeof meResponseSchema>;
