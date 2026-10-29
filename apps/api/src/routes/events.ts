import type { ServerResponse } from 'node:http';
import type { ServerEvent } from '@family/shared';
import type { FastifyPluginAsync } from 'fastify';

/** Cloudflare closes a connection that sends nothing for ~100 s. */
const HEARTBEAT_MS = 25_000;

function message(event: ServerEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

/**
 * `GET /api/events`: Server-Sent Events with change signals only (`menu.changed`, `menu.proposal.changed`, `shopping.changed`); the client
 * reloads the data through the REST routes. No acting user, since `EventSource` sends no headers and the signals carry
 * no personal data; Cloudflare Access applies as everywhere. A `: ping` comment every 25 s keeps the connection open.
 */
export const eventsRoutes: FastifyPluginAsync = async (app) => {
  const open = new Set<ServerResponse>();

  // An event stream never ends by itself: end them so `app.close()` (and a container stop) does not wait for them.
  app.addHook('preClose', async () => {
    for (const raw of open) {
      raw.end();
    }
  });

  app.get(
    '/api/events',
    { config: { actingUser: false } },
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

      const unsubscribe = app.events.subscribe((event) =>
        write(message(event)),
      );
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
