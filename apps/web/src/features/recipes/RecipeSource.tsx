import { displaySourceUrl, sourcePhotoUrl } from '@family/shared';
import { useState } from 'react';
import { Sheet } from '../../components/Sheet';
import { PhotoViewer } from '../step-photos/PhotoViewer';
import { THUMBNAIL_WIDTH } from '../step-photos/StepPhotoThumbnail';

interface RecipeSourceProps {
  /** Линкът на източника, ако има. */
  url?: string | undefined;
  /** Поставеният текст на внасянето, ако има (`null` без него). */
  text?: string | null | undefined;
  /** Id-тата на снимките на внасянето, поред (`[]` без снимки). */
  photos?: readonly string[] | undefined;
  /** Надписът на връзката или бутона („Източник“, „Отвори източника“). */
  label: string;
  className?: string;
}

/** Името на изгледа със снимките на източника. */
export const SOURCE_PHOTOS_LABEL = 'Снимките на източника';

/** Снимките на източника за `PhotoViewer`: в пълния им размер, с номер в името. */
export function sourceViewerPhotos(photos: readonly string[]) {
  return photos.map((id, index) => ({
    src: sourcePhotoUrl(id),
    alt: `Снимка ${index + 1} на източника`,
  }));
}

/**
 * GLOSSARY: Източник на рецепта. Само линк се отваря в нов таб; текстът се отваря в лист само за четене (със запазените
 * редове), а линкът, ако има, е в листа под него; снимките се отварят на цял екран една след друга (`PhotoViewer`).
 * Без линк, текст и снимки — нищо.
 */
export function RecipeSource({
  url,
  text,
  photos = [],
  label,
  className,
}: RecipeSourceProps) {
  const [open, setOpen] = useState(false);
  if (!text && photos.length > 0) {
    return (
      <>
        <button
          type="button"
          className={className}
          onClick={() => setOpen(true)}
        >
          {label}
        </button>
        {open && (
          <PhotoViewer
            photos={sourceViewerPhotos(photos)}
            label={SOURCE_PHOTOS_LABEL}
            onClose={() => setOpen(false)}
          />
        )}
      </>
    );
  }
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

/**
 * GLOSSARY: Източник на рецепта. Миниатюрите на снимките на източника в реда им; докосване отваря снимката на цял екран,
 * откъдето се превърта към другите.
 */
export function SourcePhotoThumbnails({
  photos,
}: {
  photos: readonly string[];
}) {
  const [open, setOpen] = useState<number>();
  return (
    <>
      <ul className="source-photos" aria-label="Снимките на източника">
        {photos.map((id, index) => (
          <li key={id}>
            <button
              type="button"
              className="step-photo-thumbnail"
              aria-label={`Снимка ${index + 1} на източника на цял екран`}
              onClick={() => setOpen(index)}
            >
              <img
                className="step-photo-thumbnail__image"
                src={sourcePhotoUrl(id, THUMBNAIL_WIDTH)}
                alt={`Снимка ${index + 1} на източника`}
                loading="lazy"
                decoding="async"
              />
            </button>
          </li>
        ))}
      </ul>
      {open !== undefined && (
        <PhotoViewer
          photos={sourceViewerPhotos(photos)}
          label={SOURCE_PHOTOS_LABEL}
          initialIndex={open}
          onClose={() => setOpen(undefined)}
        />
      )}
    </>
  );
}
