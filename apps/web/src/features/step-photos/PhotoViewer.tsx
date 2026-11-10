import { useEffect, useRef, useState } from 'react';
import { useSheetHistory } from '../../components/sheet-history';
import './step-photos.css';

/** Една снимка в изгледа: адресът в пълен размер и името на картината. */
export interface ViewerPhoto {
  src: string;
  alt: string;
}

interface PhotoViewerProps {
  /** Снимките една след друга; при повече от една има номер („1/3“) и превъртане. */
  photos: readonly ViewerPhoto[];
  /** Името на прозореца, напр. „Снимката на стъпка 2“ или „Снимките на източника“. */
  label: string;
  /** Коя снимка се показва първа (по подразбиране първата). */
  initialIndex?: number;
  onClose: () => void;
}

/** Колко пиксела встрани трябва да е плъзгането, за да превърти. */
const SWIPE_DISTANCE = 50;

/**
 * Снимки на цял екран, в пълния им размер (GLOSSARY: Снимка на стъпка, Източник на рецепта). Затваря се с „Затвори“, с
 * докосване където и да е, с Escape и с „назад“ на телефона (запис в историята като листовете). Няколко снимки се
 * превъртат с ‹ ›, със стрелките и с плъзгане встрани; номерът „1/3“ казва коя е.
 */
export function PhotoViewer({
  photos,
  label,
  initialIndex = 0,
  onClose,
}: PhotoViewerProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const count = photos.length;
  const [index, setIndex] = useState(() =>
    Math.min(Math.max(initialIndex, 0), Math.max(count - 1, 0)),
  );
  // Началото на плъзгането и дали последното докосване беше плъзгане (тогава не затваря).
  const swipeStart = useRef<number | undefined>(undefined);
  const swiped = useRef(false);
  const many = count > 1;
  useSheetHistory(onClose);
  useEffect(() => {
    closeRef.current?.focus();
  }, []);
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      } else if (event.key === 'ArrowRight') {
        setIndex((current) => Math.min(current + 1, count - 1));
      } else if (event.key === 'ArrowLeft') {
        setIndex((current) => Math.max(current - 1, 0));
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, count]);

  const photo = photos[index];
  if (!photo) {
    return null;
  }
  return (
    <div
      className={many ? 'photo-viewer photo-viewer--many' : 'photo-viewer'}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onPointerDown={(event) => {
        swipeStart.current = event.clientX;
        swiped.current = false;
      }}
      onPointerUp={(event) => {
        const start = swipeStart.current;
        swipeStart.current = undefined;
        if (!many || start === undefined) {
          return;
        }
        const distance = event.clientX - start;
        if (Math.abs(distance) < SWIPE_DISTANCE) {
          return;
        }
        swiped.current = true;
        setIndex((current) =>
          distance < 0
            ? Math.min(current + 1, count - 1)
            : Math.max(current - 1, 0),
        );
      }}
    >
      <button
        type="button"
        className="photo-viewer__backdrop"
        aria-label="Затвори снимката"
        tabIndex={-1}
        onClick={() => {
          if (!swiped.current) {
            onClose();
          }
        }}
      />
      <img
        key={photo.src}
        className="photo-viewer__image"
        src={photo.src}
        alt={photo.alt}
      />
      <button
        ref={closeRef}
        type="button"
        className="button button--quiet photo-viewer__close"
        onClick={onClose}
      >
        Затвори
      </button>
      {many && (
        <div className="photo-viewer__nav">
          <button
            type="button"
            className="button button--quiet photo-viewer__step"
            aria-label="Предишна снимка"
            disabled={index === 0}
            onClick={() => setIndex(index - 1)}
          >
            ‹
          </button>
          <span className="photo-viewer__count">
            {index + 1}/{count}
          </span>
          <button
            type="button"
            className="button button--quiet photo-viewer__step"
            aria-label="Следваща снимка"
            disabled={index === count - 1}
            onClick={() => setIndex(index + 1)}
          >
            ›
          </button>
        </div>
      )}
    </div>
  );
}
