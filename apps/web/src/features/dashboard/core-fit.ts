import { type RefObject, useLayoutEffect, useRef } from 'react';

/*
 * Съдържанието на ядрото се побира в кръга вътре в пръстена: всеки ред (часовник,
 * събитие, ястие, готвач…) е правоъгълник, центриран около средата на ядрото, и
 * най-далечният му ъгъл не трябва да стига пистата и маркерите по нея.
 */
export interface FitRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Мащабът (≤ 1), при който всички редове на съдържанието с размер `content` са
 * в кръг с радиус `radius` около средата му. Редовете са в координатите на
 * съдържанието в естествен размер; мащабът смалява всичко около средата.
 */
export function coreFitScale(
  content: { width: number; height: number },
  radius: number,
  rows: FitRect[],
): number {
  const cx = content.width / 2;
  const cy = content.height / 2;
  let farthest = 0;
  for (const row of rows) {
    const dx = Math.max(
      Math.abs(row.left - cx),
      Math.abs(row.left + row.width - cx),
    );
    const dy = Math.max(
      Math.abs(row.top - cy),
      Math.abs(row.top + row.height - cy),
    );
    farthest = Math.max(farthest, Math.hypot(dx, dy));
  }
  if (radius <= 0 || farthest <= radius) {
    return 1;
  }
  return radius / farthest;
}

/**
 * Радиусът на свободния кръг като дял от ширината на ядрото: вътре от пистата
 * (вътрешният ѝ ръб е на 144/400) и от маркерите на втората писта (до 132/400).
 */
export const CORE_FIT_RADIUS = 0.325;

/** Редовете на съдържанието, които трябва да са в кръга; от реда на ястието — само чертата отгоре. */
const ROWS =
  '.core__chips, .clock, .core__date, .core__note, .core__event, .core__cooking-main > *, .core__cooking-line, .core__stale';

/**
 * Мащабът на `.core__inner` в ядро с ширина `coreWidth`: от измерването на
 * редовете в естествен размер (offset* не зависят от `scale`).
 */
export function measureCoreFit(inner: HTMLElement, coreWidth: number): number {
  const rows: FitRect[] = Array.from(
    inner.querySelectorAll<HTMLElement>(ROWS),
    (row) => ({
      left: row.offsetLeft,
      top: row.offsetTop,
      width: row.offsetWidth,
      height: row.offsetHeight,
    }),
  );
  const cooking = inner.querySelector<HTMLElement>('.core__cooking');
  if (cooking) {
    rows.push({
      left: cooking.offsetLeft,
      top: cooking.offsetTop,
      width: cooking.offsetWidth,
      height: 1,
    });
  }
  return coreFitScale(
    { width: inner.offsetWidth, height: inner.offsetHeight },
    coreWidth * CORE_FIT_RADIUS,
    rows,
  );
}

/**
 * Държи съдържанието на ядрото в кръга: мащабът е в `--core-fit` на `.core__inner`
 * и се мери пак при всяко рендериране и при промяна на размера на ядрото или съдържанието.
 */
export function useCoreFit(): RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const inner = ref.current;
    const core = inner?.parentElement;
    if (!inner || !core) {
      return;
    }
    const refit = () => {
      const scale = measureCoreFit(inner, core.offsetWidth);
      inner.style.setProperty('--core-fit', scale.toFixed(3));
    };
    refit();
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(refit);
    observer.observe(inner);
    observer.observe(core);
    return () => observer.disconnect();
  });

  return ref;
}
