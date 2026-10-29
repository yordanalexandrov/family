import { type ReactNode, useEffect, useRef } from 'react';
import './ActionBar.css';

export type Action = {
  label: string;
  disabled?: boolean;
} & (
  | { onClick: () => void; form?: never }
  | {
      /** Бутонът праща формата с това `id` (и е неин по подразбиране: Enter в поле я праща през него). */
      form: string;
      onClick?: never;
    }
);

interface ActionBarProps {
  primary: Action;
  /** Тихите действия преди основното, напр. „Отхвърли“ и „Откажи“. */
  secondary?: readonly Action[];
  /** Кратко пояснение до действията, напр. „3 продукта за свързване“. */
  text?: string | undefined;
  /** Съобщение над действията, напр. грешка от записа; стои в лентата, за да се вижда от всяко място на екрана. */
  children?: ReactNode;
}

/** Височината на лентата за Toast.css: на телефона toast-ът се вдига над нея. Една лента на екран. */
const SPACE_PROPERTY = '--action-bar-space';

/**
 * Лента с основното действие на екрана. Стои последна в съдържанието му: на
 * телефона залепва над долната лента, на таблета и в браузъра остава в края.
 */
export function ActionBar({
  primary,
  secondary = [],
  text,
  children,
}: ActionBarProps) {
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
    // biome-ignore lint/a11y/useSemanticElements: група бутони, не полета на форма; fieldset носи рамка и min-content ширина.
    <div className="action-bar" ref={barRef} role="group" aria-label="Действия">
      {children && <div className="action-bar__message">{children}</div>}
      {text && <p className="action-bar__text">{text}</p>}
      <div className="action-bar__actions">
        {secondary.map((action) => (
          <ActionButton key={action.label} action={action} quiet />
        ))}
        <ActionButton action={primary} />
      </div>
    </div>
  );
}

function ActionButton({ action, quiet }: { action: Action; quiet?: boolean }) {
  return (
    <button
      type={action.form === undefined ? 'button' : 'submit'}
      form={action.form}
      className={`button${quiet ? ' button--quiet' : ''} action-bar__button`}
      onClick={action.onClick}
      disabled={action.disabled}
    >
      {action.label}
    </button>
  );
}
