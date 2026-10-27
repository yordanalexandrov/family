import { IMPORT_TEXT_MAX, type RecipeImportParams } from '@family/shared';
import { type FormEvent, useState } from 'react';
import { ErrorBox } from '../../components/ErrorBox';
import { Field } from '../../components/Field';

interface ImportTextFormProps {
  onSubmit: (params: RecipeImportParams) => void;
  isSubmitting?: boolean;
  submitError?: unknown;
}

/** Табът „Текст“: поставен текст на рецепта и, по желание, линкът, от който е. */
export function ImportTextForm({
  onSubmit,
  isSubmitting = false,
  submitError,
}: ImportTextFormProps) {
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [urlError, setUrlError] = useState<string>();

  function submit(event: FormEvent) {
    event.preventDefault();
    const trimmedUrl = url.trim();
    if (trimmedUrl && !URL.canParse(trimmedUrl)) {
      setUrlError('Невалиден линк');
      return;
    }
    setUrlError(undefined);
    onSubmit({
      kind: 'text',
      text: text.trim(),
      ...(trimmedUrl ? { url: trimmedUrl } : {}),
    });
  }

  return (
    <form className="import-form" noValidate onSubmit={submit}>
      <Field label="Текст на рецептата">
        {(props) => (
          <textarea
            {...props}
            className="field__input import-form__text"
            maxLength={IMPORT_TEXT_MAX}
            placeholder="Постави рецептата: продукти и начин на приготвяне"
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
        )}
      </Field>
      <Field label="Линк към източника (по желание)" error={urlError}>
        {(props) => (
          <input
            {...props}
            type="url"
            inputMode="url"
            className="field__input"
            placeholder="https://…"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
          />
        )}
      </Field>
      {submitError !== undefined && submitError !== null && (
        <ErrorBox error={submitError} />
      )}
      <button
        type="submit"
        className="button"
        disabled={text.trim() === '' || isSubmitting}
      >
        Внеси
      </button>
    </form>
  );
}
