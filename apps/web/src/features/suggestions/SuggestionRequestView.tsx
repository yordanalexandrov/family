import type { SuggestionRequestDetail } from '@family/shared';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { ErrorBox } from '../../components/ErrorBox';
import { Spinner } from '../../components/Spinner';
import { failureMessage, requestErrorFor } from '../../lib/ai-requests';
import {
  paramsOf,
  useRequestSuggestions,
  useSuggestionRequest,
} from './queries';
import { SuggestionCard } from './SuggestionCard';
import '../recipes/recipes.css';
import './suggestions.css';

/** `/recipes/suggest/:requestId`: изчакване докато е `pending`, после предложенията или грешката. */
export function SuggestionRequestView() {
  const { requestId } = useParams({ from: '/recipes/suggest/$requestId' });
  const detail = useSuggestionRequest(requestId);
  return (
    <main className="screen recipes">
      <header className="recipes__header">
        <Link
          to="/recipes/suggest"
          className="recipes__back recipes__back--block"
        >
          ← Нова заявка
        </Link>
        <h1 className="recipes__title">Предложения</h1>
      </header>
      {detail.isPending ? (
        <Spinner />
      ) : detail.isError ? (
        <ErrorBox error={detail.error} onRetry={() => void detail.refetch()} />
      ) : (
        <RequestResult detail={detail.data} />
      )}
    </main>
  );
}

function RequestResult({ detail }: { detail: SuggestionRequestDetail }) {
  const { request, suggestions } = detail;
  if (request.status === 'pending') {
    return (
      <div className="suggestions__waiting">
        <Spinner label="Изчакване…" />
        <p>Търся рецепти… обикновено отнема до минута</p>
      </div>
    );
  }
  if (request.status === 'failed') {
    return <RequestFailed detail={detail} />;
  }
  return (
    <ul className="suggestion-cards">
      {suggestions.map((suggestion) => (
        <li key={suggestion.id}>
          <SuggestionCard suggestion={suggestion} />
        </li>
      ))}
    </ul>
  );
}

/** Съобщение по кода и „Опитай пак“: нова заявка със същия вход. */
function RequestFailed({ detail }: { detail: SuggestionRequestDetail }) {
  const retry = useRequestSuggestions();
  const navigate = useNavigate();
  return (
    <>
      <div className="error-box" role="alert">
        <p className="error-box__message">
          {failureMessage(detail.request.error)}
        </p>
        <button
          type="button"
          className="button"
          disabled={retry.isPending}
          onClick={() =>
            retry.mutate(paramsOf(detail.request), {
              onSuccess(request) {
                void navigate({
                  to: '/recipes/suggest/$requestId',
                  params: { requestId: request.id },
                });
              },
            })
          }
        >
          Опитай пак
        </button>
      </div>
      {retry.isError && <ErrorBox error={requestErrorFor(retry.error)} />}
    </>
  );
}
