import { describe, expect, it } from 'vitest';
import { contractFailureSchema } from './failure.js';

describe('contractFailureSchema', () => {
  it('accepts the failure codes of a run and http_<status>', () => {
    for (const code of [
      'timeout',
      'invalid_output',
      'no_results',
      'aborted',
      'stale',
      'error',
      'fetch_blocked',
      'fetch_failed',
      'http_502',
    ]) {
      expect(contractFailureSchema.parse(code)).toBe(code);
    }
  });

  it('rejects codes no run produces', () => {
    for (const code of ['openclaw_unavailable', 'http_', 'http_abc', '']) {
      expect(contractFailureSchema.safeParse(code).success).toBe(false);
    }
  });
});
