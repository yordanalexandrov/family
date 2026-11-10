import { displaySourceUrl } from '@family/shared';
import { useState } from 'react';
import { Sheet } from '../../components/Sheet';

interface RecipeSourceProps {
  /** Линкът на източника, ако има. */
  url?: string | undefined;
  /** Поставеният текст на внасянето, ако има (`null` без него). */
  text?: string | null | undefined;
  /** Надписът на връзката или бутона („Източник“, „Отвори източника“). */
  label: string;
  className?: string;
}

/**
 * GLOSSARY: Източник на рецепта. Само линк се отваря в нов таб; текстът се отваря в лист само за четене (със запазените
 * редове), а линкът, ако има, е в листа под него. Без линк и без текст — нищо.
 */
export function RecipeSource({
  url,
  text,
  label,
  className,
}: RecipeSourceProps) {
  const [open, setOpen] = useState(false);
  if (!text) {
    return url ? (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
      >
        {label}
      </a>
    ) : null;
  }
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {label}
      </button>
      {open && (
        <Sheet title="Източник" onClose={() => setOpen(false)}>
          <blockquote className="recipe-source__text">{text}</blockquote>
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="recipe-source__link"
            >
              {displaySourceUrl(url)}
            </a>
          )}
        </Sheet>
      )}
    </>
  );
}
