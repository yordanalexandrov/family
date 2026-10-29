import { useSyncExternalStore } from 'react';

/**
 * Колко px по-нисък от прозореца трябва да е видимият viewport, за да е отворена клавиатурата. Лентата на адреса
 * и лентата за превод местят височината с по-малко; клавиатурата на телефон е поне ~250 px.
 */
const KEYBOARD_MIN_HEIGHT = 150;

function subscribe(onChange: () => void): () => void {
  const viewport = window.visualViewport;
  viewport?.addEventListener('resize', onChange);
  viewport?.addEventListener('scroll', onChange);
  return () => {
    viewport?.removeEventListener('resize', onChange);
    viewport?.removeEventListener('scroll', onChange);
  };
}

/** Колко px от долния край на прозореца закрива клавиатурата; `null`, ако е затворена. */
function keyboardInset(): number | null {
  const viewport = window.visualViewport;
  if (
    !viewport ||
    window.innerHeight - viewport.height <= KEYBOARD_MIN_HEIGHT
  ) {
    return null;
  }
  return Math.max(
    0,
    Math.round(window.innerHeight - viewport.height - viewport.offsetTop),
  );
}

/**
 * Екранната клавиатура: `null`, докато е затворена; отворена — колко px от долния край на прозореца закрива
 * (`visualViewport` е значително по-нисък от прозореца). Лепкавото и фиксираното се мерят от долния край на
 * прозореца, затова лентата над клавиатурата се вдига с толкова.
 */
export function useKeyboardInset(): number | null {
  return useSyncExternalStore(subscribe, keyboardInset, () => null);
}
