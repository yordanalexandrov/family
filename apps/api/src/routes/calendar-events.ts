import {
  addDays,
  CALENDAR_MAX_DAYS,
  calendarEventsQuerySchema,
  calendarEventsResponseSchema,
  dateKeyInSofia,
  utcMidnightOf,
} from '@family/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { HttpError } from '../plugins/error-handler.js';
import { readCalendarEvents } from '../services/calendar-events.js';

/** The Calendar screen and the dashboard read the cache by days; Google is never asked here. */
export const calendarEventsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/api/calendar/events',
    {
      // The tablet and the TV have no acting user.
      config: { actingUser: false },
      schema: {
        querystring: calendarEventsQuerySchema,
        response: { 200: calendarEventsResponseSchema },
      },
    },
    async (request) => {
      const from = request.query.from ?? dateKeyInSofia(app.now());
      const to = request.query.to ?? addDays(from, CALENDAR_MAX_DAYS);
      const days = (utcMidnightOf(to) - utcMidnightOf(from)) / 86_400_000;
      if (days < 1 || days > CALENDAR_MAX_DAYS) {
        throw new HttpError(
          400,
          'validation_error',
          `Периодът трябва да е от 1 до ${CALENDAR_MAX_DAYS} дни`,
        );
      }
      return readCalendarEvents(app.db, from, to);
    },
  );
};
