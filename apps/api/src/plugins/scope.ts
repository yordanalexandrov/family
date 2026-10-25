import type { FastifyRequest } from 'fastify';

/**
 * Whether a request targets the API (`/api/*`), the part behind Access and the acting user.
 * Judged by the matched route, not the raw URL: the router decodes `/%61pi/users` to `/api/users`,
 * the raw URL keeps it encoded. Unmatched requests (404) fall back to the raw URL.
 */
export function isApiRequest(request: FastifyRequest): boolean {
  return (request.routeOptions.url ?? request.url).startsWith('/api/');
}
