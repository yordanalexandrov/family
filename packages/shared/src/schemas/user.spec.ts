import { describe, expect, it } from 'vitest';
import { meResponseSchema, userSchema } from './user.js';

const dani = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Дани',
  role: 'parent',
  initial: 'Д',
  color: 'person-1',
};

describe('userSchema', () => {
  it('accepts a parent with a one-letter initial and a colour token', () => {
    expect(userSchema.parse(dani)).toEqual(dani);
  });

  it('rejects an initial longer than one letter', () => {
    const result = userSchema.safeParse({ ...dani, initial: 'Да' });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path.join('.'))).toEqual([
      'initial',
    ]);
  });
});

describe('meResponseSchema', () => {
  it('accepts the acting user together with the Access e-mail', () => {
    const me = { user: dani, accessEmail: 'dani@example.com' };

    expect(meResponseSchema.parse(me)).toEqual(me);
  });

  it('rejects an accessEmail that is not an e-mail address', () => {
    expect(
      meResponseSchema.safeParse({ user: dani, accessEmail: 'not-an-email' })
        .success,
    ).toBe(false);
  });
});
