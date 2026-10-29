import { describe, expect, it } from 'vitest';
import { coreFitScale } from './core-fit';

describe('coreFitScale', () => {
  it('оставя съдържанието в естествен размер, когато всеки ред е вътре в кръга', () => {
    const scale = coreFitScale({ width: 200, height: 100 }, 150, [
      { left: 0, top: 0, width: 200, height: 40 },
      { left: 50, top: 60, width: 100, height: 40 },
    ]);
    expect(scale).toBe(1);
  });

  it('смалява съдържанието, докато най-далечният ъгъл на ред опре в кръга', () => {
    // Средата е (100, 150); горният ред стига до (150, 0): 50 и 150 от средата → √25000 ≈ 158,1.
    const scale = coreFitScale({ width: 200, height: 300 }, 150, [
      { left: 50, top: 0, width: 100, height: 20 },
      { left: 90, top: 140, width: 20, height: 20 },
    ]);
    expect(scale).toBeCloseTo(0.9487, 4);
  });

  it('гледа ъгъла на всеки ред: широк ред по средата и тесен най-долу', () => {
    // Широкият ред: (0|200, 140|160) → 100 и 10 → √10100 ≈ 100,5; долният: (80|120, 280|300) → 20 и 150 → √22900 ≈ 151,3.
    const scale = coreFitScale({ width: 200, height: 300 }, 100, [
      { left: 0, top: 140, width: 200, height: 20 },
      { left: 80, top: 280, width: 40, height: 20 },
    ]);
    expect(scale).toBeCloseTo(100 / Math.sqrt(22900), 4);
  });

  it('без размери (преди първото измерване) не смалява', () => {
    expect(coreFitScale({ width: 0, height: 0 }, 0, [])).toBe(1);
  });
});
