import {
  type AlreadyImported,
  alreadyImportedSchema,
  type RecipeImportParams,
} from '@family/shared';
import { Link } from '@tanstack/react-router';
import { type FormEvent, useState } from 'react';
import { ApiError } from '../../api/client';
import { ErrorBox } from '../../components/ErrorBox';
import { Field } from '../../components/Field';

interface ImportLinkFormProps {
  onSubmit: (params: RecipeImportParams) => void;
  isSubmitting?: boolean;
  submitError?: unknown;
  /** Попълнен отвън: споделен линк или `?tab=url&url=`. */
  initialUrl?: string | undefined;
}

/** 409 `already_imported` от api-то: рецептата или предложението, което вече има този линк. */
function alreadyImported(error: unknown): AlreadyImported | undefined {
  if (!(error instanceof ApiError) || error.code !== 'already_imported') {
    return undefined;
  }
  const body = alreadyImportedSchema.safeParse(error.body);
  return body.success ? body.data : undefined;
}

function canReadClipboard(): boolean {
  return typeof navigator.clipboard?.readText === 'function';
}

/**
 * Табът „Линк“: линк към страница с рецепта; api-то я тегли и чете. Линк, който вече е в регистъра, се хваща преди
 * AI заявката: „Отвори“ води към рецептата или чакащото предложение, „Внеси пак“ го внася въпреки това.
 */
export function ImportLinkForm({
  onSubmit,
  isSubmitting = false,
  submitError,
  initialUrl = '',
}: ImportLinkFormProps) {
  const [url, setUrl] = useState(initialUrl);
  const [urlError, setUrlError] = useState<string>();
  const duplicate = alreadyImported(submitError);

  function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = url.trim();
    if (!/^https?:\/\//i.test(trimmed) || !URL.canParse(trimmed)) {
      setUrlError('Невалиден линк');
      return;
    }
    setUrlError(undefined);
    onSubmit({ kind: 'url', url: trimmed });
  }

  async function paste() {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (text) {
        setUrl(text);
      }
    } catch {
      // No permission or nothing to read: the person pastes by hand.
    }
  }

  return (
    <form className="import-form" noValidate onSubmit={submit}>
      <Field label="Линк към рецептата" error={urlError}>
        {(props) => (
          <input
            {...props}
            type="url"
            inputMode="url"
            autoComplete="off"
            className="field__input"
            placeholder="https://…"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
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
      {duplicate ? (
        <div className="error-box" role="alert">
          <p className="error-box__message">{duplicate.message}</p>
          <div className="import-form__actions">
            <DuplicateLink duplicate={duplicate} />
            <button
              type="button"
              className="button button--quiet"
              disabled={isSubmitting}
              onClick={() =>
                onSubmit({ kind: 'url', url: url.trim(), force: true })
              }
            >
              Внеси пак
            </button>
          </div>
        </div>
      ) : (
        submitError !== undefined &&
        submitError !== null && <ErrorBox error={submitError} />
      )}
      <button
        type="submit"
        className="button"
        disabled={url.trim() === '' || isSubmitting}
      >
        Внеси
      </button>
    </form>
  );
}

/** „Отвори“: рецептата в регистъра, а ако я няма — чакащото предложение (от внасяне или от „Предложи“). */
function DuplicateLink({ duplicate }: { duplicate: AlreadyImported }) {
  const { recipe, suggestion } = duplicate;
  if (recipe) {
    return (
      <Link to="/recipes/$id" params={{ id: recipe.id }} className="button">
        Отвори
      </Link>
    );
  }
  if (suggestion?.importRequestId) {
    return (
      <Link
        to="/recipes/import/$requestId"
        params={{ requestId: suggestion.importRequestId }}
        className="button"
      >
        Отвори
      </Link>
    );
  }
  if (suggestion?.requestId) {
    return (
      <Link
        to="/recipes/suggest/$requestId/$suggestionId"
        params={{
          requestId: suggestion.requestId,
          suggestionId: suggestion.id,
        }}
        className="button"
      >
        Отвори
      </Link>
    );
  }
  return null;
}
