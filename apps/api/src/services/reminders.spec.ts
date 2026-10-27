import { describe, expect, it } from 'vitest';
import { DANI, POLI } from '../test/users.js';
import {
  type DueReminder,
  dueReminders,
  type ReminderMeal,
  type ReminderState,
} from './reminders.js';

const KAIMA = { id: 'ing-kaima', name: 'кайма' };
const PORK = { id: 'ing-pork', name: 'свинско' };
const ONION = { id: 'ing-onion', name: 'лук' };

/** Musaka for dinner on Thursday 5 November 2026. */
const MUSAKA: ReminderMeal = {
  id: 'meal-thu',
  date: '2026-11-05',
  title: 'Мусака',
  ingredients: [ONION, KAIMA, PORK],
  thawedAt: null,
};

const ALL_ON = { thaw: true, cook: true, menu: true };

function state(overrides: Partial<ReminderState> = {}): ReminderState {
  return {
    meals: [MUSAKA],
    frozen: [KAIMA.id, PORK.id],
    users: [
      { id: DANI.id, settings: ALL_ON },
      { id: POLI.id, settings: ALL_ON },
    ],
    log: [],
    ...overrides,
  };
}

/** 20:00 in Sofia on Wednesday 4 November (EET, UTC+2). */
const EVENING = new Date('2026-11-04T18:00:00Z');
/** 08:00 in Sofia on Thursday 5 November. */
const MORNING = new Date('2026-11-05T06:00:00Z');

function evening(userId: string): DueReminder {
  return {
    userId,
    kind: 'thaw',
    subjectId: MUSAKA.id,
    onDate: '2026-11-04',
    message: {
      title: 'Извади месото за утре',
      body: 'Мусака: кайма, свинско',
      tag: `thaw-${MUSAKA.id}`,
      url: '/menu?week=2026-11-02',
      actions: [
        {
          action: 'thawed',
          title: 'Извадих',
          post: `/api/menu/meals/${MUSAKA.id}/thawed`,
        },
      ],
    },
  };
}

function morning(userId: string): DueReminder {
  const base = evening(userId);
  return {
    ...base,
    onDate: '2026-11-05',
    message: { ...base.message, title: 'Извади месото за довечера' },
  };
}

describe('dueReminders: „Извади месото“', () => {
  it('reminds both of the frozen products of tomorrow’s dinner at 20:00 the evening before', () => {
    expect(dueReminders(EVENING, state())).toEqual([
      evening(DANI.id),
      evening(POLI.id),
    ]);
  });

  it('reminds both again at 08:00 on the day of the dinner', () => {
    expect(dueReminders(MORNING, state())).toEqual([
      morning(DANI.id),
      morning(POLI.id),
    ]);
  });

  it('is not due before its hour, nor on another day', () => {
    expect(dueReminders(new Date('2026-11-04T17:59:00Z'), state())).toEqual([]);
    expect(dueReminders(new Date('2026-11-05T18:00:00Z'), state())).toEqual([]);
    expect(dueReminders(new Date('2026-11-03T18:00:00Z'), state())).toEqual([]);
  });

  it('keeps an hour in Sofia across the change to winter time', () => {
    // Sunday 25 October 2026 goes from EEST (UTC+3) to EET at 04:00; dinner on the 25th, morning at 08:00 EET.
    const sunday = { ...MUSAKA, date: '2026-10-25' };
    const due = dueReminders(new Date('2026-10-25T06:00:00Z'), {
      ...state(),
      meals: [sunday],
    });
    expect(due.map((reminder) => reminder.onDate)).toEqual([
      '2026-10-25',
      '2026-10-25',
    ]);
    expect(
      dueReminders(new Date('2026-10-25T05:59:00Z'), {
        ...state(),
        meals: [sunday],
      }),
    ).toEqual([]);
  });

  it('sends nothing for a dinner without frozen products', () => {
    expect(dueReminders(EVENING, state({ frozen: ['ing-other'] }))).toEqual([]);
    expect(dueReminders(EVENING, state({ frozen: [] }))).toEqual([]);
  });

  it('sends nothing for a dinner without a recipe', () => {
    const note: ReminderMeal = { ...MUSAKA, title: null, ingredients: [] };
    expect(dueReminders(EVENING, state({ meals: [note] }))).toEqual([]);
  });

  it('skips the morning one once someone answered „Извадих“', () => {
    const thawed = { ...MUSAKA, thawedAt: new Date('2026-11-04T18:05:00Z') };
    expect(dueReminders(MORNING, state({ meals: [thawed] }))).toEqual([]);
  });

  it('skips a reminder more than 2 hours late, but sends one up to 2 hours late', () => {
    expect(
      dueReminders(new Date('2026-11-04T20:00:00Z'), state()),
    ).toHaveLength(2);
    expect(dueReminders(new Date('2026-11-04T20:01:00Z'), state())).toEqual([]);
  });

  it('does not send a reminder in the log again', () => {
    const log = [evening(DANI.id)].map(({ message, ...entry }) => entry);
    expect(dueReminders(EVENING, state({ log }))).toEqual([evening(POLI.id)]);
    // The evening one in the log does not stop the morning one.
    expect(dueReminders(MORNING, state({ log }))).toEqual([
      morning(DANI.id),
      morning(POLI.id),
    ]);
  });

  it('sends only to the other when one has `thaw` off', () => {
    const users = [
      { id: DANI.id, settings: { ...ALL_ON, thaw: false } },
      { id: POLI.id, settings: ALL_ON },
    ];
    expect(dueReminders(EVENING, state({ users }))).toEqual([evening(POLI.id)]);
  });

  it('reads the recipe of the morning after it changed since the evening', () => {
    const changed: ReminderMeal = {
      ...MUSAKA,
      title: 'Пълнени чушки',
      ingredients: [KAIMA],
    };
    const [first] = dueReminders(MORNING, state({ meals: [changed] }));
    expect(first?.message.body).toBe('Пълнени чушки: кайма');
  });
});
