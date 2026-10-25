import { dashboardResponseSchema } from '@family/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { readDashboard } from '../services/dashboard.js';

/** Everything the kiosk, TV and phone screens show, from the cache; Google and Wallet are never asked here. */
export const dashboardRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/api/dashboard',
    {
      // The tablet and the TV have no acting user.
      config: { actingUser: false },
      schema: { response: { 200: dashboardResponseSchema } },
    },
    async () =>
      readDashboard(app.db, app.now(), {
        calendar: app.calendarSync !== null,
        budget: app.budgetSync !== null,
      }),
  );
};
