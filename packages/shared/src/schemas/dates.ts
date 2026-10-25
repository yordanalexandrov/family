import { z } from 'zod';

/** A calendar date in Sofia as `YYYY-MM-DD`. */
export const dateKeySchema = z.iso.date();

/** An instant as an ISO 8601 date-time (the api sends UTC, `…Z`). */
export const instantSchema = z.iso.datetime({ offset: true });
