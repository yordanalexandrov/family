import { describe, expect, it } from 'vitest';
import { gridTemplateRows, neighbourSlot } from './dashboard-slots';

const PHASE_1 = ['core', 'left-1', 'right-1'] as const;

describe('gridTemplateRows', () => {
  it('TV, Фаза 1: един ред бюджет | ядро | дни между два празни реда', () => {
    expect(gridTemplateRows('wide', PHASE_1)).toBe(
      '". core ." 1fr "left-1 core right-1" auto ". core ." 1fr',
    );
  });

  it('kiosk, Фаза 1: ядрото вляво, бюджетът над дните вдясно', () => {
    expect(gridTemplateRows('narrow', PHASE_1)).toBe(
      '"core ." 1fr "core left-1" auto "core right-1" auto "core ." 1fr',
    );
  });

  it('по-късата колона разтяга последния си слот; менюто е под ядрото', () => {
    expect(
      gridTemplateRows('wide', [...PHASE_1, 'right-2', 'below-core']),
    ).toBe(
      '". core ." 1fr "left-1 core right-1" auto "left-1 below-core right-2" auto ". below-core ." 1fr',
    );
  });
});

describe('neighbourSlot', () => {
  it('TV: от ядрото наляво е бюджетът, надясно са дните', () => {
    expect(neighbourSlot('wide', PHASE_1, 'core', 'left')).toBe('left-1');
    expect(neighbourSlot('wide', PHASE_1, 'core', 'right')).toBe('right-1');
    expect(neighbourSlot('wide', PHASE_1, 'left-1', 'left')).toBeNull();
    expect(neighbourSlot('wide', PHASE_1, 'core', 'down')).toBeNull();
  });

  it('kiosk: надясно от ядрото е бюджетът, под него са дните', () => {
    expect(neighbourSlot('narrow', PHASE_1, 'core', 'right')).toBe('left-1');
    expect(neighbourSlot('narrow', PHASE_1, 'left-1', 'down')).toBe('right-1');
    expect(neighbourSlot('narrow', PHASE_1, 'right-1', 'up')).toBe('left-1');
    expect(neighbourSlot('narrow', PHASE_1, 'right-1', 'left')).toBe('core');
  });
});
