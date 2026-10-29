import { describe, expect, it } from 'vitest';
import {
  formatAge,
  formatDataAge,
  freshness,
  STALE_AFTER_MS,
} from './freshness.js';

const now = new Date('2026-10-25T12:00:00.000Z');

function minutesAgo(minutes: number): string {
  return new Date(now.getTime() - minutes * 60_000).toISOString();
}

describe('STALE_AFTER_MS', () => {
  it('is 20 minutes for the calendar and 3 hours for the budget', () => {
    expect(STALE_AFTER_MS).toEqual({
      calendar: 20 * 60_000,
      budget: 3 * 3_600_000,
    });
  });
});

describe('freshness', () => {
  it('is ok when the last success is younger than the source threshold', () => {
    expect(freshness(minutesAgo(19), 'ok', 'calendar', now)).toBe('ok');
    expect(freshness(minutesAgo(179), 'ok', 'budget', now)).toBe('ok');
  });

  it('is stale once the last success is older than the threshold', () => {
    expect(freshness(minutesAgo(21), 'ok', 'calendar', now)).toBe('stale');
    expect(freshness(minutesAgo(181), 'ok', 'budget', now)).toBe('stale');
  });

  it('the same age is fresh for the budget but stale for the calendar', () => {
    expect(freshness(minutesAgo(60), 'ok', 'budget', now)).toBe('ok');
    expect(freshness(minutesAgo(60), 'ok', 'calendar', now)).toBe('stale');
  });

  it('is failed when the last attempt failed, however recent the last success', () => {
    expect(freshness(minutesAgo(5), 'failed', 'calendar', now)).toBe('failed');
    expect(freshness(null, 'failed', 'calendar', now)).toBe('failed');
  });

  it('while a run is in progress judges by the last success', () => {
    expect(freshness(minutesAgo(5), 'running', 'calendar', now)).toBe('ok');
    expect(freshness(minutesAgo(30), 'running', 'calendar', now)).toBe('stale');
  });

  it('is stale when nothing has succeeded yet', () => {
    expect(freshness(null, null, 'budget', now)).toBe('stale');
    expect(freshness(null, 'running', 'budget', now)).toBe('stale');
  });

  it('is unconfigured when the source is not configured, whatever ran before', () => {
    expect(freshness(minutesAgo(1), 'unconfigured', 'budget', now)).toBe(
      'unconfigured',
    );
  });

  it('accepts the last success as a Date', () => {
    expect(freshness(new Date(minutesAgo(1)), 'ok', 'calendar', now)).toBe(
      'ok',
    );
  });
});

describe('formatAge', () => {
  it.each([
    [0.5, 'току-що'],
    [3, 'преди 3 мин'],
    [59, 'преди 59 мин'],
    [60, 'преди 1 ч'],
    [150, 'преди 2 ч'],
    [24 * 60, 'преди 1 д'],
    [3 * 24 * 60 + 5, 'преди 3 д'],
  ])('%s minutes ago is „%s“', (minutes, text) => {
    expect(formatAge(minutesAgo(minutes), now)).toBe(text);
  });
});

describe('formatDataAge', () => {
  // now е 14:00 в София (EET, часовете по-рано са още EEST).
  it.each([
    [0.5, 'от 1 мин'],
    [25, 'от 25 мин'],
    [3 * 60, 'от 3 ч'],
    [13 * 60 + 59, 'от 13 ч'],
    [16 * 60, 'от вчера'],
    [38 * 60, 'от вчера'],
    [41 * 60, 'от 2 дни'],
    [5 * 24 * 60, 'от 5 дни'],
  ])('%s minutes ago is „%s“', (minutes, text) => {
    expect(formatDataAge(minutesAgo(minutes), now)).toBe(text);
  });
});
