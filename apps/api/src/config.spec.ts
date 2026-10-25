import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

describe('loadConfig', () => {
  it('falls back to loopback defaults when the environment is empty', () => {
    expect(loadConfig({})).toEqual({
      NODE_ENV: 'development',
      API_HOST: '127.0.0.1',
      API_PORT: 18091,
      LOG_LEVEL: 'info',
    });
  });

  it('names the offending variable when a value is invalid', () => {
    expect(() => loadConfig({ API_PORT: 'eighteen' })).toThrow(/API_PORT/);
  });
});
