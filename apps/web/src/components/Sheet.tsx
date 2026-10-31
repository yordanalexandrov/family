import { type ReactNode, useEffect, useRef } from 'react';
import './Sheet.css';
import { useSheetDrag } from './sheet-drag';
import { useSheetHistory } from './sheet-history';

/**
 * Заглавието за окото: непрекъсваем интервал преди „·“ („Пиле с ориз · Стъпка 2 · 15 мин“), за да не почва
 * пренесеният ред с точката. Името на листа за екранния четец остава както е.
 */
function noLeadingDot(title: string): string {
  return title.replaceAll(' · ', '\u00a0· ');
}

interface SheetProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Без „Готово“ в заглавието: листът сам носи бутоните си (напр. потвърждение) и сам слага фокуса. */
  hideClose?: boolean;
  /** Надписът на бутона в заглавието, ако не е „Готово“ (напр. „Затвори“, когато записът е отделен бутон в листа). */
  closeLabel?: string;
}

/**
 * Лист отдолу на телефона, прозорец на таблета: „Готово“ в лепкавото заглавие, Escape и фонът го затварят, а на телефона
 * и плъзгане надолу за дръжката (или съдържанието, превъртяно до горе). Съдържанието е в `.sheet__section` (и
 * `.sheet__row` за ред от полета). Отвореният лист е запис в историята: „назад“ го затваря.
 */
export function Sheet({
  title,
  onClose,
  children,
  hideClose,
  closeLabel = 'Готово',
}: SheetProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  useSheetHistory(onClose);
  useSheetDrag(panelRef, onClose);
  useEffect(() => {
    closeRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="sheet">
      <button
        type="button"
        className="sheet__backdrop"
        aria-label="Затвори"
        tabIndex={-1}
        onClick={onClose}
      />
      <section
        ref={panelRef}
        className="sheet__panel"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="sheet__header">
          <span className="sheet__handle" aria-hidden="true" />
          <h2 className="sheet__title">{noLeadingDot(title)}</h2>
          {!hideClose && (
            <button
              ref={closeRef}
              type="button"
              className="button button--quiet"
              onClick={onClose}
            >
              {closeLabel}
            </button>
          )}
        </header>
        {children}
      </section>
    </div>
  );
}
