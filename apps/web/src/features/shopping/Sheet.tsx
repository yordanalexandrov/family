import { type ReactNode, useEffect, useRef } from 'react';

interface SheetProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/** Лист отдолу (стиловете `.sheet` са в menu.css): заглавие, „Готово“, Escape и фонът го затварят. */
export function Sheet({ title, onClose, children }: SheetProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
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
          <button
            ref={closeRef}
            type="button"
            className="button button--quiet"
            onClick={onClose}
          >
            Готово
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
