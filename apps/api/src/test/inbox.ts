import { type InboxItem, inboxResponseSchema } from '@family/shared';
import type { FastifyInstance } from 'fastify';

/** `GET /api/inbox` as `userId`: the person's notifications, the last updated first. */
export async function inboxOf(
  app: FastifyInstance,
  userId: string,
): Promise<InboxItem[]> {
  const response = await app.inject({
    method: 'GET',
    url: '/api/inbox',
    headers: { 'x-acting-user': userId },
  });
  if (response.statusCode !== 200) {
    throw new Error(`GET /api/inbox: ${response.statusCode} ${response.body}`);
  }
  return inboxResponseSchema.parse(response.json()).items;
}
