import { describe, expect, it } from 'vitest';
import type { ReminderMeal } from '../db/repositories/reminders.js';
import { DANI, POLI } from '../test/users.js';
import {
  type DueReminder,
  dueReminders,
  type ReminderState,
} from './reminders.js';

const KAIMA = { id: 'ing-kaima', name: 'кайма' };
const PORK = { id: 'ing-pork', name: 'свинско' };
const ONION = { id: 'ing-onion', name: 'лук' };

/** Musaka for dinner on Thursday 5 November 2026. */
const MUSAKA: ReminderMeal = {
  id: 'meal-thu',
  date: '2026-11-05',
  recipeId: 'recipe-musaka',
  title: 'Мусака',
  ingredients: [ONION, KAIMA, PORK],
  note: null,
  cookUserId: null,
  thawedAt: null,
};

function state(overrides: Partial<ReminderState> = {}): ReminderState {
  return {
    meals: [MUSAKA],
    frozen: [KAIMA.id, PORK.id],
    users: [DANI, POLI],
    log: [],
    ...overrides,
  };
}

/** 20:00 in Sofia on Wednesday 4 November (EET, UTC+2). */
const EVENING = new Date('2026-11-04T18:00:00Z');
/** 08:00 in Sofia on Thursday 5 November. */
const MORNING = new Date('2026-11-05T06:00:00Z');
/** Friday 00:00 in Sofia. */
const END_OF_THURSDAY = new Date('2026-11-05T22:00:00Z');

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
      url: `/menu?week=2026-11-02&meal=${MUSAKA.id}`,
      details: [
        { text: 'Във фризера: кайма', url: '/pantry' },
        { text: 'Във фризера: свинско', url: '/pantry' },
        {
          text: 'Вечеря: Мусака, четвъртък',
          url: `/menu?week=2026-11-02&meal=${MUSAKA.id}`,
        },
      ],
      actions: [
        {
          action: 'thawed',
          title: 'Извадих',
          post: `/api/menu/meals/${MUSAKA.id}/thawed`,
        },
      ],
      // The buttons stay in the inbox until the end of Thursday in Sofia.
      actionUntil: END_OF_THURSDAY,
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

/** 16:00 in Sofia on Thursday 5 November, the day of the dinner. */
const AFTERNOON = new Date('2026-11-05T14:00:00Z');

function cookReminders(at: Date, overrides: Partial<ReminderState> = {}) {
  return dueReminders(at, state(overrides)).filter(
    (reminder) => reminder.kind === 'cook',
  );
}

function youCook(userId: string): DueReminder {
  return {
    userId,
    kind: 'cook',
    subjectId: MUSAKA.id,
    onDate: '2026-11-05',
    message: {
      title: 'Довечера готвиш ти',
      body: 'Мусака',
      tag: `cook-${MUSAKA.id}`,
      url: `/menu?week=2026-11-02&meal=${MUSAKA.id}`,
      details: [{ text: 'Рецепта: Мусака', url: '/recipes/recipe-musaka' }],
    },
  };
}

const MUSAKA_RECIPE = [
  { text: 'Рецепта: Мусака', url: '/recipes/recipe-musaka' },
];

function whoCooks(
  userId: string,
  body = 'Мусака',
  details = MUSAKA_RECIPE,
): DueReminder {
  return {
    userId,
    kind: 'cook',
    subjectId: MUSAKA.id,
    onDate: '2026-11-05',
    message: {
      title: 'Кой готви довечера?',
      body,
      tag: `cook-${MUSAKA.id}`,
      url: `/menu?week=2026-11-02&meal=${MUSAKA.id}`,
      details,
      actions: [
        {
          action: 'cook-claim',
          title: 'Аз',
          post: `/api/menu/meals/${MUSAKA.id}/cook-claim`,
        },
      ],
      // The buttons stay in the inbox until the end of Thursday in Sofia.
      actionUntil: END_OF_THURSDAY,
    },
  };
}

describe('dueReminders: „Кой готви довечера“', () => {
  it('tells the cook of today’s dinner at 16:00, and no one else', () => {
    const meals = [{ ...MUSAKA, cookUserId: POLI.id }];
    expect(cookReminders(AFTERNOON, { meals })).toEqual([youCook(POLI.id)]);
  });

  it('asks both who cooks, with „Аз“, when the dinner has no cook', () => {
    expect(cookReminders(AFTERNOON)).toEqual([
      whoCooks(DANI.id),
      whoCooks(POLI.id),
    ]);
  });

  it('names the note of a dinner without a recipe', () => {
    const note: ReminderMeal = {
      ...MUSAKA,
      recipeId: null,
      title: null,
      ingredients: [],
      note: 'Пица от Мама Миа',
    };
    expect(cookReminders(AFTERNOON, { meals: [note] })).toEqual([
      whoCooks(DANI.id, 'Пица от Мама Миа', []),
      whoCooks(POLI.id, 'Пица от Мама Миа', []),
    ]);
  });

  it('sends nothing for an empty dinner', () => {
    const empty: ReminderMeal = {
      ...MUSAKA,
      title: null,
      ingredients: [],
      cookUserId: POLI.id,
    };
    expect(cookReminders(AFTERNOON, { meals: [empty] })).toEqual([]);
  });

  it('is due from 16:00 for 2 hours, only for today’s dinner, and once', () => {
    expect(cookReminders(new Date('2026-11-05T13:59:00Z'))).toEqual([]);
    expect(cookReminders(new Date('2026-11-05T16:00:00Z'))).toHaveLength(2);
    expect(cookReminders(new Date('2026-11-05T16:01:00Z'))).toEqual([]);
    expect(cookReminders(new Date('2026-11-04T14:00:00Z'))).toEqual([]);
    const log = [whoCooks(DANI.id)].map(({ message, ...entry }) => entry);
    expect(cookReminders(AFTERNOON, { log })).toEqual([whoCooks(POLI.id)]);
  });
});
