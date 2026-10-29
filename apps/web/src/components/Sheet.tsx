import { type ReactNode, useEffect, useRef } from 'react';
import './Sheet.css';
import { useSheetHistory } from './sheet-history';

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
 * Лист отдолу на телефона, прозорец на таблета: заглавие, „Готово“, Escape и фонът го затварят. Съдържанието е в
 * `.sheet__section` (и `.sheet__row` за ред от полета). Отвореният лист е запис в историята: „назад“ го затваря.
 */
export function Sheet({
  title,
  onClose,
  children,
  hideClose,
  closeLabel = 'Готово',
}: SheetProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useSheetHistory(onClose);
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
        className="sheet__panel"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="sheet__header">
          <h2 className="sheet__title">{title}</h2>
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
