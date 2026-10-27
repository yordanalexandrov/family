import type { RecipeImportDetail } from '@family/shared';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { ErrorBox } from '../../components/ErrorBox';
import { Spinner } from '../../components/Spinner';
import { requestErrorFor } from '../../lib/ai-requests';
import { Decided, ReviewSuggestion } from '../suggestions/SuggestionReview';
import { importFailureMessage } from './messages';
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
  return (
    <ReviewSuggestion
      suggestion={suggestion}
      linked={detail.ingredients}
      sourceUrl={request.url}
      onApproved={(recipeId) =>
        void navigate({ to: '/recipes/$id', params: { id: recipeId } })
      }
      onRejected={backToImport}
      onCancel={backToImport}
    />
  );
}

/** Съобщение по кода (при `no_results` причината на агента) и „Опитай пак“: ново внасяне на същия текст. */
function ImportFailed({ detail }: { detail: RecipeImportDetail }) {
  const retry = useRequestImport();
  const navigate = useNavigate();
  const { request, text } = detail;
  return (
    <>
      <div className="error-box" role="alert">
        <p className="error-box__message">{importFailureMessage(request)}</p>
        {text !== undefined && (
          <button
            type="button"
            className="button"
            disabled={retry.isPending}
            onClick={() =>
              retry.mutate(
                {
                  kind: 'text',
                  text,
                  ...(request.url ? { url: request.url } : {}),
                },
                {
                  onSuccess(next) {
                    void navigate({
                      to: '/recipes/import/$requestId',
                      params: { requestId: next.id },
                    });
                  },
                },
              )
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
