import { setupServer } from 'msw/node';

/**
 * Stands in for the external HTTP systems (Google) in specs. A spec that uses it starts it in `beforeAll`
 * with `onUnhandledFrame: 'error'`, so nothing reaches the real network, and adds its handlers with `server.use()`.
 */
export const server = setupServer();
