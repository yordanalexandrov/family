import { Link } from '@tanstack/react-router';
import { ErrorBox } from '../../components/ErrorBox';
import { Spinner } from '../../components/Spinner';
import { formatDateTime } from '../recipes/format';
import { REQUEST_STATUS_LABELS } from '../suggestions/messages';
import { importLabel } from './messages';
import { useRecentImports } from './queries';

/** Последните 10 внасяния, за да се върне човек към едно от тях. */
export function RecentImports() {
  const imports = useRecentImports();
  return (
    <section className="suggestions__section" aria-label="Последни внасяния">
      <h2 className="suggestions__subtitle">Последни внасяния</h2>
      {imports.isPending ? (
        <Spinner />
      ) : imports.isError ? (
        <ErrorBox
          error={imports.error}
          onRetry={() => void imports.refetch()}
        />
      ) : imports.data.length === 0 ? (
        <p className="recipes__empty">Още няма внасяния.</p>
      ) : (
        <ul className="suggestions__recent">
          {imports.data.map((request) => (
            <li key={request.id}>
              <Link
                to="/recipes/import/$requestId"
                params={{ requestId: request.id }}
                className="suggestions__recent-link"
              >
                <span>{importLabel(request)}</span>
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
