import { useEffect, useRef } from 'react';
import './ActionBar.css';

interface Action {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

interface ActionBarProps {
  primary: Action;
  secondary?: Action;
  /** Кратко пояснение до действията, напр. „3 продукта за свързване“. */
  text?: string;
}

/** Височината на лентата за Toast.css: на телефона toast-ът се вдига над нея. Една лента на екран. */
const SPACE_PROPERTY = '--action-bar-space';

/**
 * Лента с основното действие на екрана. Стои последна в съдържанието му: на
 * телефона залепва над долната лента, на таблета и в браузъра остава в края.
 */
export function ActionBar({ primary, secondary, text }: ActionBarProps) {
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = barRef.current;
    if (!element || typeof ResizeObserver === 'undefined') {
      return;
    }
    const root = document.documentElement;
    const observer = new ResizeObserver(() => {
      root.style.setProperty(SPACE_PROPERTY, `${element.offsetHeight}px`);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      root.style.removeProperty(SPACE_PROPERTY);
    };
  }, []);

  return (
    <div className="action-bar" ref={barRef}>
      {text && <p className="action-bar__text">{text}</p>}
      <div className="action-bar__actions">
        {secondary && <ActionButton action={secondary} quiet />}
        <ActionButton action={primary} />
      </div>
    </div>
  );
}

function ActionButton({ action, quiet }: { action: Action; quiet?: boolean }) {
  return (
    <button
      type="button"
      className={`button${quiet ? ' button--quiet' : ''} action-bar__button`}
      onClick={action.onClick}
      disabled={action.disabled}
    >
      {action.label}
    </button>
  );
}
