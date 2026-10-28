import {
  IMPORT_PHOTO_MAX_BYTES,
  IMPORT_PHOTOS_MAX_BYTES,
} from '@family/shared';
import { type ChangeEvent, type FormEvent, useEffect, useState } from 'react';
import { ErrorBox } from '../../components/ErrorBox';
import type { PhotoImport } from './queries';
import { resizePhoto } from './resize-photo';

interface ImportPhotoFormProps {
  onSubmit: (params: PhotoImport) => void;
  isSubmitting?: boolean;
  submitError?: unknown;
  /** Already chosen and made smaller outside: a photo shared to the app. */
  initialPhotos?: Blob[] | undefined;
}

const megabytes = (bytes: number) => Math.round(bytes / (1024 * 1024));

/** Защо снимката не може да отиде: част над 10 MB или всички над 20 MB (както отказва api-то). */
function tooLargeMessage(photos: Blob[]): string | undefined {
  if (photos.some((photo) => photo.size > IMPORT_PHOTO_MAX_BYTES)) {
    return `Снимката е над ${megabytes(IMPORT_PHOTO_MAX_BYTES)} MB. Опитай с по-малка.`;
  }
  const total = photos.reduce((sum, photo) => sum + photo.size, 0);
  return total > IMPORT_PHOTOS_MAX_BYTES
    ? `Снимките са над ${megabytes(IMPORT_PHOTOS_MAX_BYTES)} MB общо. Опитай с по-малка.`
    : undefined;
}

/**
 * Табът „Снимка“: „Снимай“ (камерата на телефона) или „Избери от галерията“, после преглед на снимката и „Внеси“.
 * Снимката се смалява тук (`resizePhoto`; дълъг скрийншот — на части, всички в прегледа) и не се пази никъде: api-то
 * я държи в паметта до края на AI заявката.
 */
export function ImportPhotoForm({
  onSubmit,
  isSubmitting = false,
  submitError,
  initialPhotos,
}: ImportPhotoFormProps) {
  const [photos, setPhotos] = useState<Blob[] | undefined>(initialPhotos);
  const [preparing, setPreparing] = useState(false);
  const previews = usePreviewUrls(photos);
  const tooLarge = photos && tooLargeMessage(photos);

  async function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Същата снимка може да се избере пак (напр. след грешка).
    event.target.value = '';
    if (!file) {
      return;
    }
    setPreparing(true);
    try {
      setPhotos(await resizePhoto(file));
    } finally {
      setPreparing(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (photos && !tooLarge) {
      onSubmit({ kind: 'photo', photos });
    }
  }

  return (
    <form className="import-form" noValidate onSubmit={submit}>
      <div className="import-form__actions">
        <label className="button button--quiet import-photo__pick">
          Снимай
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="visually-hidden"
            onChange={(event) => void choose(event)}
          />
        </label>
        <label className="button button--quiet import-photo__pick">
          Избери от галерията
          <input
            type="file"
            accept="image/*"
            className="visually-hidden"
            onChange={(event) => void choose(event)}
          />
        </label>
      </div>
      {preparing && <p className="recipes__empty">Подготвям снимката…</p>}
      {previews.length > 0 ? (
        <div className="import-photo__previews">
          {previews.map((preview, index) => (
            <img
              // biome-ignore lint/suspicious/noArrayIndexKey: частите нямат id, а редът им е смисълът.
              key={index}
              className="import-photo__preview"
              src={preview}
              alt={
                previews.length === 1
                  ? 'Снимката за внасяне'
                  : `Снимката за внасяне, част ${index + 1} от ${previews.length}`
              }
            />
          ))}
        </div>
      ) : (
        !preparing && (
          <p className="recipes__empty">
            Снимай страница от книга, ръкописна рецепта или избери скрийншот.
          </p>
        )
      )}
      {tooLarge && (
        <p className="field__error" role="alert">
          {tooLarge}
        </p>
      )}
      {submitError !== undefined && submitError !== null && (
        <ErrorBox error={submitError} />
      )}
      <button
        type="submit"
        className="button"
        disabled={!photos || Boolean(tooLarge) || preparing || isSubmitting}
      >
        Внеси
      </button>
    </form>
  );
}

/** Адресите за `<img>` на частите на снимката, освободени при смяна или напускане. */
function usePreviewUrls(photos: Blob[] | undefined): string[] {
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    if (!photos) {
      setUrls([]);
      return;
    }
    const created = photos.map((photo) => URL.createObjectURL(photo));
    setUrls(created);
    return () => {
      for (const url of created) {
        URL.revokeObjectURL(url);
      }
    };
  }, [photos]);
  return urls;
}
