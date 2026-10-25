import { z } from 'zod';

/** A person's colour as the name of its design token in web (`person-1` → `--color-person-1`), never a CSS value. */
export const personColorSchema = z.string().regex(/^person-[a-z0-9-]+$/);

export type PersonColor = z.infer<typeof personColorSchema>;

export const userSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  role: z.enum(['parent']),
  initial: z.string().length(1),
  color: personColorSchema,
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
