import type { ServerResponse } from 'node:http';
import { type ServerEvent, serverEventsQuerySchema } from '@family/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

/** Cloudflare closes a connection that sends nothing for ~100 s. */
const HEARTBEAT_MS = 25_000;

function message(event: ServerEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

/** Whether the stream opened with `?user=userId` gets `event`: a person's inbox signal goes only to their own streams. */
function isFor(event: ServerEvent, userId: string | undefined): boolean {
  return event.type !== 'inbox.changed' || event.userId === userId;
}

/**
 * `GET /api/events`: Server-Sent Events with change signals only (`menu.changed`, `shopping.changed`, …); the client
 * reloads the data through the REST routes. No acting user, since `EventSource` sends no headers; Cloudflare Access
 * applies as everywhere. The signals carry no content: a week, or for `inbox.changed` only the id of the person whose
 * inbox changed. `?user=` (a uuid, else 400) names that person for the stream and is not verified, an accepted risk
 * (ADR-0015): it gets only that contentless signal, and the inbox itself is read and written as the acting user. A
 * `: ping` comment every 25 s keeps the connection open.
 */
export const eventsRoutes: FastifyPluginAsyncZod = async (app) => {
  const open = new Set<ServerResponse>();

  // An event stream never ends by itself: end them so `app.close()` (and a container stop) does not wait for them.
  app.addHook('preClose', async () => {
    for (const raw of open) {
      raw.end();
    }
  });

  app.get(
    '/api/events',
    {
      config: { actingUser: false },
      schema: { querystring: serverEventsQuerySchema },
    },
    async (request, reply) => {
      reply.hijack();
      const raw = reply.raw;
      raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        // nginx-style proxies (and Cloudflare honours it): do not buffer the stream.
        'X-Accel-Buffering': 'no',
      });
      const write = (chunk: string) => {
        if (!raw.writableEnded && !raw.destroyed) {
          raw.write(chunk);
        }
      };

      const { user } = request.query;
      const unsubscribe = app.events.subscribe((event) => {
        if (isFor(event, user)) {
          write(message(event));
        }
      });
      const heartbeat = setInterval(() => write(': ping\n\n'), HEARTBEAT_MS);
      open.add(raw);
      // Sends the headers and a first byte at once, through any proxy.
      write(': connected\n\n');
      request.log.debug(
        { subscribers: app.events.subscribers },
        'event stream opened',
      );

      raw.on('close', () => {
        clearInterval(heartbeat);
        unsubscribe();
        open.delete(raw);
        request.log.debug(
          { subscribers: app.events.subscribers },
          'event stream closed',
        );
      });
    },
  );
};
