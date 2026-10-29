import { describe, expect, it } from 'vitest';
import { nonEmptyLines } from './lines.js';

describe('nonEmptyLines', () => {
  it('keeps the lines with text, trimmed, in order', () => {
    expect(
      nonEmptyLines('\n  Баница с тиква \n\n\t2 яйца\r\n   \nсол'),
    ).toEqual(['Баница с тиква', '2 яйца', 'сол']);
  });

  it('has none for empty or blank text', () => {
    expect(nonEmptyLines('')).toEqual([]);
    expect(nonEmptyLines(' \n\t\n')).toEqual([]);
  });
});
