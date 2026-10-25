import { describe, expect, it } from 'vitest';
import { dashboardResponseSchema } from './dashboard.js';
import { healthSchema } from './health.js';

const unconfigured = (source: 'calendar' | 'budget') => ({
  source,
  status: 'unconfigured',
  lastSuccessAt: null,
  lastError: null,
});

const dashboard = {
  today: '2026-10-25',
  now: '2026-10-25T09:00:00.000Z',
  days: [
    { date: '2026-10-25', events: [] },
    { date: '2026-10-26', events: [] },
    { date: '2026-10-27', events: [] },
    { date: '2026-10-28', events: [] },
  ],
  budget: null,
  cooking: { lunch: null, dinner: null },
  sync: { calendar: unconfigured('calendar'), budget: unconfigured('budget') },
};

describe('dashboardResponseSchema', () => {
  it('accepts a dashboard with nothing configured yet (Phase 1 cooking is empty)', () => {
    expect(dashboardResponseSchema.parse(dashboard)).toEqual(dashboard);
  });

  it('accepts a meal with its cook', () => {
    const cooking = {
      lunch: null,
      dinner: {
        title: 'Мусака',
        cookUserId: '22222222-2222-4222-8222-222222222222',
      },
    };

    expect(
      dashboardResponseSchema.parse({ ...dashboard, cooking }).cooking,
    ).toEqual(cooking);
  });

  it('accepts a meal nobody cooks yet', () => {
    const cooking = {
      lunch: null,
      dinner: { title: 'ядем навън', cookUserId: null },
    };

    expect(
      dashboardResponseSchema.parse({ ...dashboard, cooking }).cooking,
    ).toEqual(cooking);
  });

  it('rejects anything other than four days (today and the next three)', () => {
    expect(
      dashboardResponseSchema.safeParse({
        ...dashboard,
        days: dashboard.days.slice(0, 3),
      }).success,
    ).toBe(false);
  });
});

describe('healthSchema', () => {
  it('still accepts the Foundation answer without sync', () => {
    expect(healthSchema.safeParse({ status: 'ok', db: 'ok' }).success).toBe(
      true,
    );
  });

  it('accepts the freshness of both sources', () => {
    const health = {
      status: 'ok',
      db: 'ok',
      sync: { calendar: 'stale', budget: 'unconfigured' },
    };

    expect(healthSchema.parse(health)).toEqual(health);
  });

  it('rejects a sync value that is not a freshness', () => {
    expect(
      healthSchema.safeParse({
        status: 'ok',
        db: 'ok',
        sync: { calendar: 'running', budget: 'ok' },
      }).success,
    ).toBe(false);
  });
});
