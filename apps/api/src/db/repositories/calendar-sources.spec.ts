import { describe, expect, it } from 'vitest';
import type { CalendarSourceConfig } from '../../config.js';
import { testDb } from '../../test/db.js';
import { DANI, POLI } from '../../test/users.js';
import { calendarSource } from '../schema/dashboard.js';
import {
  listEnabledSources,
  upsertCalendarSources,
} from './calendar-sources.js';

const daniCalendar: CalendarSourceConfig = {
  googleCalendarId: 'dani@example.com',
  name: 'Дани',
  ownerUserId: DANI.id,
  colorToken: 'person-1',
};
const poliCalendar: CalendarSourceConfig = {
  googleCalendarId: 'poli@example.com',
  name: 'Поли',
  ownerUserId: POLI.id,
  colorToken: 'person-2',
};
const familyCalendar: CalendarSourceConfig = {
  googleCalendarId: 'family@group.calendar.google.com',
  name: 'Семеен',
  ownerUserId: null,
  colorToken: 'family',
};

describe('upsertCalendarSources', () => {
  it('stores the calendars from GOOGLE_CALENDARS as enabled sources', async () => {
    await upsertCalendarSources(testDb(), [
      daniCalendar,
      poliCalendar,
      familyCalendar,
    ]);

    const sources = await listEnabledSources(testDb());

    expect(sources).toHaveLength(3);
    expect(sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          googleCalendarId: 'dani@example.com',
          name: 'Дани',
          ownerUserId: DANI.id,
          colorToken: 'person-1',
          kind: 'person',
        }),
        expect.objectContaining({
          googleCalendarId: 'family@group.calendar.google.com',
          ownerUserId: null,
          colorToken: 'family',
          kind: 'family',
        }),
      ]),
    );
  });

  it('disables a source that is no longer in GOOGLE_CALENDARS instead of deleting it', async () => {
    await upsertCalendarSources(testDb(), [
      daniCalendar,
      poliCalendar,
      familyCalendar,
    ]);

    await upsertCalendarSources(testDb(), [daniCalendar, poliCalendar]);

    const enabled = await listEnabledSources(testDb());
    expect(enabled.map((source) => source.googleCalendarId).sort()).toEqual([
      'dani@example.com',
      'poli@example.com',
    ]);
    const all = await testDb().select().from(calendarSource);
    expect(all).toHaveLength(3);
    expect(
      all.find(
        (row) => row.googleCalendarId === familyCalendar.googleCalendarId,
      )?.enabled,
    ).toBe(false);
  });

  it('keeps the id of a source and updates its name and colour on the next start', async () => {
    await upsertCalendarSources(testDb(), [daniCalendar]);
    const [before] = await listEnabledSources(testDb());

    await upsertCalendarSources(testDb(), [
      { ...daniCalendar, name: 'Дани (работа)', colorToken: 'person-2' },
    ]);

    expect(await listEnabledSources(testDb())).toEqual([
      expect.objectContaining({
        id: before?.id,
        name: 'Дани (работа)',
        colorToken: 'person-2',
      }),
    ]);
  });

  it('enables a source again when it comes back', async () => {
    await upsertCalendarSources(testDb(), [daniCalendar, familyCalendar]);
    await upsertCalendarSources(testDb(), [daniCalendar]);

    await upsertCalendarSources(testDb(), [daniCalendar, familyCalendar]);

    expect(await listEnabledSources(testDb())).toHaveLength(2);
  });
});
