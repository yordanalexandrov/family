import { type ChangeEvent, useEffect, useRef } from 'react';
import { ErrorBox } from '../../components/ErrorBox';
import { useNeedsConnection } from '../../components/NeedsConnection';
import { useOnline } from '../../lib/use-online';
import { useUploadStepPhoto } from './queries';
import { StepPhotoImage } from './StepPhotoThumbnail';
import './step-photos.css';

interface StepPhotoFieldProps {
  /** Номерът на стъпката, от 1, за името на снимката. */
  number: number;
  photoId: string | undefined;
  /** Новата снимка (вече качена) или `undefined` при „Махни“. */
  onChange: (photoId: string | undefined) => void;
}

/**
 * Снимката на една стъпка в редакцията (GLOSSARY: Снимка на стъпка): „Снимка“ отваря камерата или галерията и качва
 * избраната веднага; със снимка — миниатюра, „Смени“ и „Махни“. Стъпката се свързва със снимката чак при „Запази“ на
 * формата. Качването иска връзка, затова без мрежа изборът е изключен.
 */
export function StepPhotoField({
  number,
  photoId,
  onChange,
}: StepPhotoFieldProps) {
  const upload = useUploadStepPhoto();
  const online = useOnline();
  const connection = useNeedsConnection(online);
  const label = `Снимката на стъпка ${number}`;
  // Отговор за стъпка, чийто лист вече е затворен, не бива да пише в друга.
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Същата снимка може да се избере пак (напр. след грешка).
    event.target.value = '';
    if (!file) {
      return;
    }
    upload.mutate(file, {
      onSuccess(id) {
        if (mounted.current) {
          onChange(id);
        }
      },
    });
  }

  const disabled = connection.disabled || upload.isPending;
  const pick = (text: string) => (
    <label
      className={
        disabled
          ? 'button button--quiet step-photo-field__pick step-photo-field__pick--disabled'
          : 'button button--quiet step-photo-field__pick'
      }
    >
      {text}
      <input
        type="file"
        accept="image/*"
        className="visually-hidden"
        disabled={disabled}
        aria-describedby={connection.describedBy}
        onChange={choose}
      />
    </label>
  );

  return (
    <div className="step-photo-field">
      {photoId && <StepPhotoImage photoId={photoId} label={label} />}
      <div className="step-photo-field__actions">
        {photoId ? (
          <>
            {pick('Смени')}
            <button
              type="button"
              className="button button--quiet"
              disabled={upload.isPending}
              onClick={() => onChange(undefined)}
            >
              Махни
            </button>
          </>
        ) : (
          pick('Снимка')
        )}
      </div>
      {upload.isPending && (
        <p className="step-photo-field__status" role="status">
          Качвам снимката…
        </p>
      )}
      {connection.hint}
      {upload.isError && <ErrorBox error={upload.error} />}
    </div>
  );
}
