import { IMPORT_TEXT_MAX, type RecipeImportParams } from '@family/shared';
import { type FormEvent, useRef, useState } from 'react';
import { ErrorBox } from '../../components/ErrorBox';
import { Field } from '../../components/Field';
import { canReadClipboard, readClipboard } from './clipboard';

interface ImportTextFormProps {
  onSubmit: (params: RecipeImportParams) => void;
  isSubmitting?: boolean;
  submitError?: unknown;
  /** Попълнени отвън: линкът на страница, която не се прочете („постави текста“), или споделен текст. */
  initialText?: string | undefined;
  initialUrl?: string | undefined;
  /** Текстът и линкът при всяка промяна: екранът ги пази, докато табът е друг, и ги връща като `initial…`. */
  onDraftChange?: (draft: ImportTextDraft) => void;
  /** Фокус в полето за текста при отваряне; без него след „Отхвърли“, за да не отваря клавиатурата под toast-а. */
  autoFocus?: boolean;
}

/** Поставеното в таба „Текст“, преди „Внеси“. */
export interface ImportTextDraft {
  text: string;
  url: string;
}

/** Табът „Текст“: поставен текст на рецепта и, по желание, линкът, от който е. */
export function ImportTextForm({
  onSubmit,
  isSubmitting = false,
  submitError,
  initialText = '',
  initialUrl = '',
  onDraftChange,
  autoFocus = true,
}: ImportTextFormProps) {
  const [text, setTextState] = useState(initialText);
  const [url, setUrlState] = useState(initialUrl);
  // Последната чернова: поставеното след асинхронното четене на клипборда не връща линка отпреди него.
  const draft = useRef<ImportTextDraft>({ text: initialText, url: initialUrl });
  function changeDraft(change: Partial<ImportTextDraft>) {
    draft.current = { ...draft.current, ...change };
    onDraftChange?.(draft.current);
  }
  function setText(next: string) {
    setTextState(next);
    changeDraft({ text: next });
  }
  function setUrl(next: string) {
    setUrlState(next);
    changeDraft({ url: next });
  }
  const [urlError, setUrlError] = useState<string>();

  async function paste() {
    const pasted = await readClipboard();
    if (pasted) {
      setText(pasted);
    }
  }

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
            // biome-ignore lint/a11y/noAutofocus: табът е само за поставяне на текст; отворен (и след „Постави текста“) е готов за него
            autoFocus={autoFocus}
            maxLength={IMPORT_TEXT_MAX}
            placeholder="Постави рецептата: продукти и начин на приготвяне"
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
        )}
      </Field>
      {canReadClipboard() && (
        <button
          type="button"
          className="button button--quiet"
          onClick={() => void paste()}
        >
          Постави от клипборда
        </button>
      )}
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
