import { stepPhotoUrl } from '@family/shared';
import { useEffect, useRef } from 'react';
import { useSheetHistory } from '../../components/sheet-history';
import './step-photos.css';

interface PhotoViewerProps {
  photoId: string;
  /** Името на снимката, напр. „Снимката на стъпка 2“: и на прозореца, и на картината. */
  label: string;
  onClose: () => void;
}

/**
 * Снимка на стъпка на цял екран, в пълния ѝ размер. Затваря се с „Затвори“, с докосване където и да е, с Escape и с
 * „назад“ на телефона (запис в историята като листовете).
 */
export function PhotoViewer({ photoId, label, onClose }: PhotoViewerProps) {
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
    <div
      className="photo-viewer"
      role="dialog"
      aria-modal="true"
      aria-label={label}
    >
      <button
        type="button"
        className="photo-viewer__backdrop"
        aria-label="Затвори снимката"
        tabIndex={-1}
        onClick={onClose}
      />
      <img
        className="photo-viewer__image"
        src={stepPhotoUrl(photoId)}
        alt={label}
      />
      <button
        ref={closeRef}
        type="button"
        className="button button--quiet photo-viewer__close"
        onClick={onClose}
      >
        Затвори
      </button>
    </div>
  );
}
