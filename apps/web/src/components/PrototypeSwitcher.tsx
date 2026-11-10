// PROTOTYPE: плаваща лента за превключване на варианти. Не е за production; махни преди merge.
import { useEffect } from 'react';
import { createPortal } from 'react-dom';

export const PROTOTYPE_VARIANTS = ['A', 'B', 'C', 'D'] as const;
export type PrototypeVariant = (typeof PROTOTYPE_VARIANTS)[number];
export const PROTOTYPE_NAMES: Record<PrototypeVariant, string> = {
  A: 'Сега',
  B: 'Секции',
  C: 'Редове',
  D: 'Раздели',
};

export function PrototypeSwitcher({
  current,
  onChange,
}: {
  current: PrototypeVariant;
  onChange: (variant: PrototypeVariant) => void;
}) {
  const index = PROTOTYPE_VARIANTS.indexOf(current);
  const n = PROTOTYPE_VARIANTS.length;
  const prev = PROTOTYPE_VARIANTS[(index - 1 + n) % n] as PrototypeVariant;
  const next = PROTOTYPE_VARIANTS[(index + 1) % n] as PrototypeVariant;

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (
        target?.closest('input, textarea, [contenteditable]') ||
        (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')
      ) {
        return;
      }
      onChange(event.key === 'ArrowLeft' ? prev : next);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [prev, next, onChange]);

  if (import.meta.env.PROD) {
    return null;
  }
  return createPortal(
    <div
      style={{
        position: 'fixed',
        insetBlockStart: 8,
        insetInlineStart: '50%',
        transform: 'translateX(-50%)',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: 4,
        borderRadius: 999,
        background: '#111',
        color: '#ff0',
        font: '600 14px system-ui',
        boxShadow: '0 4px 16px rgba(0,0,0,.4)',
      }}
    >
      <button
        type="button"
        aria-label="Предишен вариант"
        onClick={() => onChange(prev)}
        style={switcherButton}
      >
        ‹
      </button>
      <span style={{ minInlineSize: 110, textAlign: 'center' }}>
        {current} ({PROTOTYPE_NAMES[current]})
      </span>
      <button
        type="button"
        aria-label="Следващ вариант"
        onClick={() => onChange(next)}
        style={switcherButton}
      >
        ›
      </button>
    </div>,
    document.body,
  );
}

const switcherButton = {
  inlineSize: 36,
  blockSize: 36,
  border: 0,
  borderRadius: 999,
  background: '#333',
  color: '#ff0',
  font: 'inherit',
  fontSize: 20,
};
