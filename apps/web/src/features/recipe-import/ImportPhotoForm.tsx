import { IMPORT_PHOTO_MAX_BYTES } from '@family/shared';
import { type ChangeEvent, type FormEvent, useEffect, useState } from 'react';
import { ErrorBox } from '../../components/ErrorBox';
import type { PhotoImport } from './queries';
import { resizePhoto } from './resize-photo';

interface ImportPhotoFormProps {
  onSubmit: (params: PhotoImport) => void;
  isSubmitting?: boolean;
  submitError?: unknown;
  /** Already chosen and made smaller outside: a photo shared to the app. */
  initialPhoto?: Blob | undefined;
}

const TOO_LARGE = 'Снимката е над 10 MB. Опитай с по-малка.';

/**
 * Табът „Снимка“: „Снимай“ (камерата на телефона) или „Избери от галерията“, после преглед на снимката и „Внеси“.
 * Снимката се смалява тук (`resizePhoto`) и не се пази никъде: api-то я държи в паметта до края на AI заявката.
 */
export function ImportPhotoForm({
  onSubmit,
  isSubmitting = false,
  submitError,
  initialPhoto,
}: ImportPhotoFormProps) {
  const [photo, setPhoto] = useState<Blob | undefined>(initialPhoto);
  const [preparing, setPreparing] = useState(false);
  const preview = usePreviewUrl(photo);
  const tooLarge = photo !== undefined && photo.size > IMPORT_PHOTO_MAX_BYTES;

  async function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Същата снимка може да се избере пак (напр. след грешка).
    event.target.value = '';
    if (!file) {
      return;
    }
    setPreparing(true);
    try {
      setPhoto(await resizePhoto(file));
    } finally {
      setPreparing(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (photo && !tooLarge) {
      onSubmit({ kind: 'photo', photo });
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
      {preview ? (
        <img
          className="import-photo__preview"
          src={preview}
          alt="Снимката за внасяне"
        />
      ) : (
        !preparing && (
          <p className="recipes__empty">
            Снимай страница от книга, ръкописна рецепта или избери скрийншот.
          </p>
        )
      )}
      {tooLarge && (
        <p className="field__error" role="alert">
          {TOO_LARGE}
        </p>
      )}
      {submitError !== undefined && submitError !== null && (
        <ErrorBox error={submitError} />
      )}
      <button
        type="submit"
        className="button"
        disabled={!photo || tooLarge || preparing || isSubmitting}
      >
        Внеси
      </button>
    </form>
  );
}

/** Адрес за `<img>` на снимката, освободен при смяна или напускане. */
function usePreviewUrl(photo: Blob | undefined): string | undefined {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!photo) {
      setUrl(undefined);
      return;
    }
    const created = URL.createObjectURL(photo);
    setUrl(created);
    return () => URL.revokeObjectURL(created);
  }, [photo]);
  return url;
}
