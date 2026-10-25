import { z } from 'zod';

/** `/:id` of a record; anything but a UUID is a 400 before the database is asked. */
export const idParamsSchema = z.object({ id: z.uuid() });
