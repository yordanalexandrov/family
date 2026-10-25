import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

const DATABASE_URL = 'postgres://family:secret@127.0.0.1:5432/family';

describe('loadConfig', () => {
  it('falls back to loopback defaults when only DATABASE_URL is given', () => {
    expect(loadConfig({ DATABASE_URL })).toEqual({
      NODE_ENV: 'development',
      API_HOST: '127.0.0.1',
      API_PORT: 18091,
      LOG_LEVEL: 'info',
      DATABASE_URL,
    });
  });

  it('requires DATABASE_URL', () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL/);
  });

  it('rejects a DATABASE_URL that is not a postgres url', () => {
    expect(() =>
      loadConfig({ DATABASE_URL: 'mysql://family@127.0.0.1/family' }),
    ).toThrow(/DATABASE_URL/);
  });

  it('names the offending variable when a value is invalid', () => {
    expect(() => loadConfig({ DATABASE_URL, API_PORT: 'eighteen' })).toThrow(
      /API_PORT/,
    );
  });
});
