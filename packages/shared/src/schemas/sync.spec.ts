import { describe, expect, it } from 'vitest';
import { syncRunResultSchema, syncStatusSchema } from './sync.js';

describe('syncStatusSchema', () => {
  it('accepts a source that has never succeeded', () => {
    const status = {
      source: 'calendar',
      status: 'failed',
      lastSuccessAt: null,
      lastError: 'Google Calendar отговори с 403',
    };

    expect(syncStatusSchema.parse(status)).toEqual(status);
  });

  it('rejects a status that is not one of ok, stale, failed, unconfigured', () => {
    expect(
      syncStatusSchema.safeParse({
        source: 'budget',
        status: 'running',
        lastSuccessAt: null,
        lastError: null,
      }).success,
    ).toBe(false);
  });
});

describe('syncRunResultSchema', () => {
  it('accepts a finished run with its duration', () => {
    const result = { source: 'budget', status: 'ok', durationMs: 840 };

    expect(syncRunResultSchema.parse(result)).toEqual(result);
  });

  it('rejects an unknown source', () => {
    expect(
      syncRunResultSchema.safeParse({ source: 'menu', status: 'ok' }).success,
    ).toBe(false);
  });
});
