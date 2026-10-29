import type { SuggestionRequestDetail } from '@family/shared';
import {
  Link,
  useNavigate,
  useParams,
  useSearch,
} from '@tanstack/react-router';
import { useCallback } from 'react';
import { ErrorBox } from '../../components/ErrorBox';
import { Spinner } from '../../components/Spinner';
import { failureMessage, requestErrorFor } from '../../lib/ai-requests';
import { DecisionToast } from './DecisionToast';
import { requestLabel, searchedLabel } from './messages';
import {
  paramsOf,
  useRequestSuggestions,
  useSuggestionRequest,
} from './queries';
import { SuggestionCard } from './SuggestionCard';
import '../recipes/recipes.css';
import './suggestions.css';

const ROUTE = '/recipes/suggest/$requestId';

/** `/recipes/suggest/:requestId`: изчакване докато е `pending`, после предложенията или грешката. */
export function SuggestionRequestView() {
  const { requestId } = useParams({ from: ROUTE });
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
      <RequestDecisionToast />
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
        <p className="suggestions__searched">{searchedLabel(request)}</p>
      </div>
    );
  }
  if (request.status === 'failed') {
    return <RequestFailed detail={detail} />;
  }
  return (
    <>
      <p className="suggestions__request">
        <span>{requestLabel(request)}</span>{' '}
        <Link
          to="/recipes/suggest"
          search={paramsOf(request)}
          className="suggestions__request-edit"
        >
          <span aria-hidden="true">✎ </span>Промени заявката
        </Link>
      </p>
      <ul className="suggestion-cards">
        {suggestions.map((suggestion) => (
          <li key={suggestion.id}>
            <SuggestionCard suggestion={suggestion} />
          </li>
        ))}
      </ul>
    </>
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
          {failureMessage('suggest', detail.request)}
        </p>
        <p className="suggestions__searched">{searchedLabel(detail.request)}</p>
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

/** Toast-ът след решение в прегледа, по search-а на екрана. */
function RequestDecisionToast() {
  const { rejected, approved } = useSearch({ from: ROUTE });
  const navigate = useNavigate({ from: ROUTE });
  const clear = useCallback(
    () => void navigate({ search: {}, replace: true }),
    [navigate],
  );
  return (
    <DecisionToast rejected={rejected} approved={approved} onClear={clear} />
  );
}
