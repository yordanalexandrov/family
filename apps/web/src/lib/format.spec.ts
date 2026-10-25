import { describe, expect, it } from 'vitest';
import { formatMoney } from './format';

describe('formatMoney', () => {
  it('закръгля до цяло във валутата на Wallet', () => {
    expect(formatMoney(369.5, 'EUR')).toMatch(/^370\s€$/);
    expect(formatMoney(-50, 'EUR')).toMatch(/^-50\s€$/);
  });

  it('сума, която би се закръглила до 0, е със стотинки, не „-0 €“', () => {
    expect(formatMoney(-0.3, 'EUR')).toMatch(/^-0,30\s€$/);
    expect(formatMoney(0.45, 'EUR')).toMatch(/^0,45\s€$/);
  });

  it('нулата е „0 €“', () => {
    expect(formatMoney(0, 'EUR')).toMatch(/^0\s€$/);
  });
});
