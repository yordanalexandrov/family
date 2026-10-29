import { useLocation } from '@tanstack/react-router';
import { useEffect } from 'react';

/** Колко дълго котвата се държи горе, ако човекът не превърти сам. */
const HOLD_MS = 2000;

/** Горният ръб на елемента в документа по оформление, без transform-а на анимацията за поява. */
function layoutTop(element: HTMLElement): number {
  let top = 0;
  for (
    let node: HTMLElement | null = element;
    node;
    node = node.offsetParent as HTMLElement | null
  ) {
    top += node.offsetTop;
  }
  return top;
}

/**
 * Котвата от адреса (напр. `/settings#appliances`) остава горе на екрана, докато картите над нея се зареждат: рутерът
 * превърта до нея веднага, а спинерите над нея после се свиват и я изпращат над екрана. Държи я, докато нещо над нея
 * сменя размера си, до първото превъртане или докосване на човека или до `HOLD_MS`.
 */
export function useKeepHashTargetInView(): void {
  const hash = useLocation({ select: (location) => location.hash });
  useEffect(() => {
    const target = hash ? document.getElementById(hash) : null;
    if (!target || typeof ResizeObserver === 'undefined') {
      return;
    }
    const align = () => {
      const margin = parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
      window.scrollTo({ top: layoutTop(target) - margin });
    };
    const observer = new ResizeObserver(align);
    for (
      let sibling = target.parentElement?.firstElementChild;
      sibling && sibling !== target;
      sibling = sibling.nextElementSibling
    ) {
      observer.observe(sibling);
    }
    const release = () => {
      observer.disconnect();
      window.clearTimeout(timer);
      for (const event of RELEASE_EVENTS) {
        window.removeEventListener(event, release);
      }
    };
    const timer = window.setTimeout(release, HOLD_MS);
    for (const event of RELEASE_EVENTS) {
      window.addEventListener(event, release, { passive: true });
    }
    return release;
  }, [hash]);
}

const RELEASE_EVENTS = ['wheel', 'touchstart', 'pointerdown', 'keydown'];
