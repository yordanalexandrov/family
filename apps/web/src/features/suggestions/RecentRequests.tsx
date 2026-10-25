import { Link } from '@tanstack/react-router';
import { ErrorBox } from '../../components/ErrorBox';
import { Spinner } from '../../components/Spinner';
import { formatDateTime, REQUEST_STATUS_LABELS, slotLabel } from './messages';
import { useRecentRequests } from './queries';

/** Последните 10 заявки, за да се върне човек към стара. */
export function RecentRequests() {
  const requests = useRecentRequests();
  return (
    <section className="suggestions__section" aria-label="Последни заявки">
      <h2 className="suggestions__subtitle">Последни заявки</h2>
      {requests.isPending ? (
        <Spinner />
      ) : requests.isError ? (
        <ErrorBox
          error={requests.error}
          onRetry={() => void requests.refetch()}
        />
      ) : requests.data.length === 0 ? (
        <p className="recipes__empty">Още няма заявки.</p>
      ) : (
        <ul className="suggestions__recent">
          {requests.data.map((request) => (
            <li key={request.id}>
              <Link
                to="/recipes/suggest/$requestId"
                params={{ requestId: request.id }}
                className="suggestions__recent-link"
              >
                <span>
                  {slotLabel(request.slot).toLowerCase()}
                  {request.hint ? ` · ${request.hint}` : ''}
                </span>
                <span className={`badge badge--${request.status}`}>
                  {REQUEST_STATUS_LABELS[request.status]}
                </span>
                <span className="suggestions__date">
                  {formatDateTime(request.createdAt)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
