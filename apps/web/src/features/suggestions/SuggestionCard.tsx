import { type RecipeSuggestion, TAG_LABELS_BG } from '@family/shared';
import { Link } from '@tanstack/react-router';
import { useId } from 'react';
import { formatMinutes, productCount, sourceDomain } from '../recipes/format';

/** Едно предложение в резултатите: отхвърлените са избледнели, одобрените водят към рецептата. */
export function SuggestionCard({
  suggestion,
}: {
  suggestion: RecipeSuggestion;
}) {
  const titleId = useId();
  const { payload, status } = suggestion;
  const newCount = payload.ingredients.filter((i) => i.isNew).length;
  return (
    <article
      className={`suggestion-card suggestion-card--${status}`}
      aria-labelledby={titleId}
    >
      <h2 className="suggestion-card__title" id={titleId}>
        {payload.title}
      </h2>
      <p className="suggestion-card__meta">
        <span>{formatMinutes(payload.prepMinutes)}</span>
        {payload.tags.length > 0 && (
          <span>{payload.tags.map((t) => TAG_LABELS_BG[t]).join(' · ')}</span>
        )}
      </p>
      <p className="suggestion-card__why">{payload.why}</p>
      <p className="suggestion-card__meta">
        <span>{sourceDomain(payload.sourceUrl)}</span>
        <span>{productCount(payload.ingredients.length)}</span>
        {newCount > 0 && (
          <span className="suggestion-card__new">
            {newCount === 1 ? '1 нов продукт' : `${newCount} нови продукта`}
          </span>
        )}
      </p>
      <div className="recipes__actions">
        {status === 'proposed' && (
          <Link
            to="/recipes/suggest/$requestId/$suggestionId"
            params={{
              requestId: suggestion.requestId,
              suggestionId: suggestion.id,
            }}
            className="button"
          >
            Прегледай
          </Link>
        )}
        {status === 'rejected' && <span className="badge">Отхвърлено</span>}
        {status === 'approved' && (
          <>
            <span className="badge badge--done">Одобрено</span>
            {suggestion.recipeId && (
              <Link
                to="/recipes/$id"
                params={{ id: suggestion.recipeId }}
                className="button button--quiet"
              >
                Към рецептата
              </Link>
            )}
          </>
        )}
      </div>
    </article>
  );
}
