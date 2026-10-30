import { stepPhotoUrl } from '@family/shared';
import { useState } from 'react';
import { PhotoViewer } from './PhotoViewer';
import './step-photos.css';

/** Ширината на миниатюрата, която се иска от api-то (`?w=`): 5rem при плътност до 3. */
export const THUMBNAIL_WIDTH = 240;

interface StepPhotoThumbnailProps {
  photoId: string;
  /** Името на снимката, напр. „Снимката на стъпка 2“. */
  label: string;
}

/** Миниатюра на снимка на стъпка, която при докосване я отваря на цял екран (`PhotoViewer`). */
export function StepPhotoThumbnail({
  photoId,
  label,
}: StepPhotoThumbnailProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="step-photo-thumbnail"
        aria-label={`${label} на цял екран`}
        onClick={() => setOpen(true)}
      >
        <StepPhotoImage photoId={photoId} label={label} />
      </button>
      {open && (
        <PhotoViewer
          photoId={photoId}
          label={label}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

/** Само картината на миниатюрата, без действие (напр. в реда на стъпката във формата). */
export function StepPhotoImage({
  photoId,
  label,
}: {
  photoId: string;
  /** `''` = украса до текст, който вече казва какво е. */
  label: string;
}) {
  return (
    <img
      className="step-photo-thumbnail__image"
      src={stepPhotoUrl(photoId, THUMBNAIL_WIDTH)}
      alt={label}
      loading="lazy"
      decoding="async"
    />
  );
}
