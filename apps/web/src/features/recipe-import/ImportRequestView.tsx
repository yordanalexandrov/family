import type { RecipeImportDetail, RecipeImportParams } from '@family/shared';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { ErrorBox } from '../../components/ErrorBox';
import { Spinner } from '../../components/Spinner';
import { requestErrorFor } from '../../lib/ai-requests';
import { sourceDomain } from '../recipes/format';
import { SourcePhotoThumbnails } from '../recipes/RecipeSource';
import { Decided, ReviewSuggestion } from '../suggestions/SuggestionReview';
import { importFailureMessage, textLead } from './messages';
import { useImport, useRequestImport } from './queries';
import '../recipes/recipes.css';
import '../suggestions/suggestions.css';

/** `/recipes/import/:requestId`: изчакване докато е `pending`, после прегледът на предложението или грешката. */
export function ImportRequestView() {
  const { requestId } = useParams({ from: '/recipes/import/$requestId' });
  const detail = useImport(requestId);
  const title = detail.data?.suggestion?.payload.title ?? 'Внасяне';
  return (
    <main className="screen recipes">
      <header className="recipes__header">
        <Link
          to="/recipes/import"
          className="recipes__back recipes__back--block"
        >
          ← Внеси рецепта
        </Link>
        <h1 className="recipes__title">{title}</h1>
      </header>
      {detail.isPending ? (
        <Spinner />
      ) : detail.isError ? (
        <ErrorBox error={detail.error} onRetry={() => void detail.refetch()} />
      ) : (
        <ImportResult detail={detail.data} />
      )}
    </main>
  );
}

function ImportResult({ detail }: { detail: RecipeImportDetail }) {
  const navigate = useNavigate();
  const { request, suggestion } = detail;
  if (request.status === 'pending') {
    return (
      <div className="suggestions__waiting">
        <Spinner label="Изчакване…" />
        <p>Чета рецептата… обикновено отнема до минута</p>
        <ImportSubject detail={detail} />
      </div>
    );
  }
  if (request.status === 'failed' || !suggestion) {
    return <ImportFailed detail={detail} />;
  }
  if (suggestion.status !== 'proposed') {
    return <Decided suggestion={suggestion} />;
  }
  const backToImport = () => void navigate({ to: '/recipes/import' });
  // „Отхвърли“ води към „Внеси рецепта“ с toast „Отхвърлено · Върни“ (`DecisionToast`).
  const rejected = () =>
    void navigate({
      to: '/recipes/import',
      search: { rejected: suggestion.id },
    });
  return (
    <ReviewSuggestion
      suggestion={suggestion}
      sourcePhotos={detail.photos}
      linked={detail.ingredients}
      sourceUrl={request.url}
      sourceText={detail.text}
      onApproved={(recipeId) =>
        void navigate({ to: '/recipes/$id', params: { id: recipeId } })
      }
      onRejected={rejected}
      onCancel={backToImport}
    />
  );
}

/**
 * Какво се внася, под изчакването и грешката: първите 2 реда на текста, домейнът на линка или миниатюрите на
 * записаните снимки (`detail.photos`, затова и след презареждане).
 */
function ImportSubject({ detail }: { detail: RecipeImportDetail }) {
  const { request, text, photos = [] } = detail;
  if (request.source === 'photo') {
    return (
      <div className="suggestions__searched suggestions__searched--photos">
        <p>{photos.length > 1 ? 'Снимки' : 'Снимка'}</p>
        {photos.length > 0 && <SourcePhotoThumbnails photos={photos} />}
      </div>
    );
  }
  const subject =
    text !== undefined
      ? `Текст: ${textLead(text)}`
      : request.url
        ? `Линк: ${sourceDomain(request.url)}`
        : undefined;
  return subject ? <p className="suggestions__searched">{subject}</p> : null;
}

/**
 * Същото внасяне наново: същият текст, същият линк или същите записани снимки (по реда им, без ново качване);
 * `undefined`, ако няма какво да се повтори.
 */
function retryParams({
  request,
  text,
  photos = [],
}: RecipeImportDetail): RecipeImportParams | undefined {
  if (request.source === 'photo') {
    return photos.length > 0 ? { kind: 'photo', photos } : undefined;
  }
  if (text !== undefined) {
    return { kind: 'text', text, ...(request.url ? { url: request.url } : {}) };
  }
  if (request.source === 'url' && request.url) {
    return { kind: 'url', url: request.url, force: true };
  }
  return undefined;
}

/**
 * Съобщение по кода (при `no_results` причината на агента) и „Опитай пак“: ново внасяне на същия текст, линк или
 * записаните снимки. Страница, която не се прочете, води към таба „Текст“ с пренесен линк: човекът поставя текста сам.
 * При снимка има и „Нова снимка“ (табът „Снимка“).
 */
function ImportFailed({ detail }: { detail: RecipeImportDetail }) {
  const retry = useRequestImport();
  const navigate = useNavigate();
  const { request } = detail;
  const unreadable =
    request.error === 'fetch_blocked' || request.error === 'fetch_failed';
  const again = unreadable ? undefined : retryParams(detail);
  return (
    <>
      <div className="error-box" role="alert">
        <p className="error-box__message">{importFailureMessage(request)}</p>
        <ImportSubject detail={detail} />
        {unreadable && (
          <button
            type="button"
            className="button"
            onClick={() =>
              void navigate({
                to: '/recipes/import',
                search: { tab: 'text', url: request.url },
              })
            }
          >
            Постави текста
          </button>
        )}
        {request.source === 'photo' && (
          <button
            type="button"
            className="button"
            onClick={() =>
              void navigate({
                to: '/recipes/import',
                search: { tab: 'photo' },
              })
            }
          >
            Нова снимка
          </button>
        )}
        {detail.text !== undefined && (
          <button
            type="button"
            className="button button--quiet"
            onClick={() =>
              void navigate({
                to: '/recipes/import',
                search: { tab: 'text', text: detail.text, url: request.url },
              })
            }
          >
            Редактирай и опитай пак
          </button>
        )}
        {again && (
          <button
            type="button"
            className="button"
            disabled={retry.isPending}
            onClick={() =>
              retry.mutate(again, {
                onSuccess(next) {
                  void navigate({
                    to: '/recipes/import/$requestId',
                    params: { requestId: next.id },
                  });
                },
              })
            }
          >
            Опитай пак
          </button>
        )}
      </div>
      {retry.isError && <ErrorBox error={requestErrorFor(retry.error)} />}
    </>
  );
}
