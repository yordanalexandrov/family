import { describe, expect, it } from 'vitest';
import { withHint } from './hint.js';

describe('withHint', () => {
  it('puts the hint after the label, in quotes', () => {
    expect(withHint('Предложено от Дани', 'повече риба')).toBe(
      'Предложено от Дани · „повече риба“',
    );
  });

  it('leaves the label alone without a hint', () => {
    expect(withHint('Предложено от Дани', undefined)).toBe(
      'Предложено от Дани',
    );
    expect(withHint('Предложено от Дани', null)).toBe('Предложено от Дани');
    expect(withHint('Предложено от Дани', '')).toBe('Предложено от Дани');
  });
});
