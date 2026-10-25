import { describe, expect, it } from 'vitest';
import { testDb } from '../../test/db.js';
import { finishRun, lastRuns, pruneRuns, startRun } from './sync-runs.js';

const at = (iso: string) => new Date(iso);

describe('sync runs', () => {
  it('know nothing about a source that never ran', async () => {
    expect(await lastRuns(testDb())).toEqual({
      calendar: { lastSuccess: null, lastAttempt: null },
      budget: { lastSuccess: null, lastAttempt: null },
    });
  });

  it('report a run in progress as the last attempt', async () => {
    await startRun(testDb(), 'calendar', at('2026-10-25T09:00:00Z'));

    const { calendar } = await lastRuns(testDb());

    expect(calendar.lastSuccess).toBeNull();
    expect(calendar.lastAttempt).toMatchObject({
      status: 'running',
      startedAt: at('2026-10-25T09:00:00Z'),
      finishedAt: null,
    });
  });

  it('keep the last success when a later attempt fails, per source', async () => {
    const ok = await startRun(testDb(), 'calendar', at('2026-10-25T09:00:00Z'));
    await finishRun(testDb(), ok, 'ok', undefined, at('2026-10-25T09:00:02Z'));
    const failed = await startRun(
      testDb(),
      'calendar',
      at('2026-10-25T09:05:00Z'),
    );
    await finishRun(
      testDb(),
      failed,
      'failed',
      'Google Calendar отговори с 503',
      at('2026-10-25T09:05:01Z'),
    );
    const budget = await startRun(
      testDb(),
      'budget',
      at('2026-10-25T08:00:00Z'),
    );
    await finishRun(
      testDb(),
      budget,
      'ok',
      undefined,
      at('2026-10-25T08:00:01Z'),
    );

    const runs = await lastRuns(testDb());

    expect(runs.calendar.lastSuccess).toMatchObject({
      status: 'ok',
      finishedAt: at('2026-10-25T09:00:02Z'),
    });
    expect(runs.calendar.lastAttempt).toMatchObject({
      status: 'failed',
      error: 'Google Calendar отговори с 503',
    });
    expect(runs.budget.lastSuccess).toMatchObject({
      finishedAt: at('2026-10-25T08:00:01Z'),
    });
    expect(runs.budget.lastAttempt).toEqual(runs.budget.lastSuccess);
  });

  it('prune runs older than a week but keep the last success of each source', async () => {
    const now = at('2026-10-25T12:00:00Z');
    const oldSuccess = await startRun(
      testDb(),
      'budget',
      at('2026-10-10T12:00:00Z'),
    );
    await finishRun(
      testDb(),
      oldSuccess,
      'ok',
      undefined,
      at('2026-10-10T12:00:01Z'),
    );
    const oldFailure = await startRun(
      testDb(),
      'budget',
      at('2026-10-11T12:00:00Z'),
    );
    await finishRun(
      testDb(),
      oldFailure,
      'failed',
      'timeout',
      at('2026-10-11T12:00:30Z'),
    );
    const olderSuccess = await startRun(
      testDb(),
      'calendar',
      at('2026-10-01T12:00:00Z'),
    );
    await finishRun(
      testDb(),
      olderSuccess,
      'ok',
      undefined,
      at('2026-10-01T12:00:01Z'),
    );
    const recent = await startRun(
      testDb(),
      'calendar',
      at('2026-10-25T11:55:00Z'),
    );
    await finishRun(
      testDb(),
      recent,
      'ok',
      undefined,
      at('2026-10-25T11:55:01Z'),
    );

    await pruneRuns(testDb(), 7, now);

    const runs = await lastRuns(testDb());
    // The old failure is gone, so the last attempt of the budget is its old success again.
    expect(runs.budget.lastAttempt).toMatchObject({
      id: oldSuccess,
      status: 'ok',
    });
    expect(runs.budget.lastSuccess).toMatchObject({ id: oldSuccess });
    expect(runs.calendar.lastSuccess).toMatchObject({ id: recent });
  });
});
