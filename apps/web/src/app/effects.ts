import { useSyncExternalStore } from 'react';
import { storedSetting } from './stored-setting';

/*
 * Ниво на ефектите (GLOSSARY: effects level), настройка на устройството.
 * `family.effects` в localStorage → `data-effects` на <html>; CSS-ът реагира на атрибута.
 *   full: размазване зад картите, анимирана аурора, пружини при поява, наклон при hover.
 *   lite: полупрозрачни карти без размазване, статична аурора, само преходите при поява.
 * Без поддръжка на backdrop-filter нивото е винаги lite. Иначе изричната настройка
 * печели; без нея prefers-reduced-motion дава lite. Непрекъснатите анимации спират при
 * reduced-motion и на full (в CSS). UI-ят за настройката е в /settings.
 */
export type EffectsLevel = 'full' | 'lite';
export type EffectsSetting = EffectsLevel | 'auto';

export const EFFECTS_KEY = 'family.effects';

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

const effects = storedSetting<EffectsSetting>({
  key: EFFECTS_KEY,
  parse: (raw) => (raw === 'full' || raw === 'lite' ? raw : 'auto'),
  unset: 'auto',
  onChange: () => applyStoredEffects(),
});

/** Дали браузърът размазва зад елемент; без това нивото е винаги lite. */
export function supportsBlur(): boolean {
  if (typeof CSS === 'undefined' || typeof CSS.supports !== 'function') {
    return false;
  }
  return (
    CSS.supports('backdrop-filter', 'blur(1px)') ||
    CSS.supports('-webkit-backdrop-filter', 'blur(1px)')
  );
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia(REDUCED_MOTION).matches;
}

function resolveLevel(setting: EffectsSetting): EffectsLevel {
  if (!supportsBlur()) {
    return 'lite';
  }
  if (setting !== 'auto') {
    return setting;
  }
  return prefersReducedMotion() ? 'lite' : 'full';
}

function apply(setting: EffectsSetting): void {
  document.documentElement.dataset.effects = resolveLevel(setting);
}

export function applyStoredEffects(): void {
  apply(effects.read());
}

function subscribe(listener: () => void): () => void {
  const unsubscribe = effects.subscribe(listener);
  // И смяна на системното предпочитание за движение.
  const media =
    typeof matchMedia === 'function' ? matchMedia(REDUCED_MOTION) : null;
  media?.addEventListener('change', effects.notify);
  return () => {
    unsubscribe();
    media?.removeEventListener('change', effects.notify);
  };
}

export function useEffectsLevel() {
  const setting = useSyncExternalStore(subscribe, effects.read);
  return {
    /** Действащото ниво след автоматичните правила. */
    level: resolveLevel(setting),
    /** Какво е избрано на устройството; `auto` = без изрична настройка. */
    setting,
    setEffects: effects.write,
  };
}
