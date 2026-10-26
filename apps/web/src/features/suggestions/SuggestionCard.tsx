import {
  type RecipeSuggestion,
  type Suggestion,
  TAG_LABELS_BG,
} from '@family/shared';
import { Link } from '@tanstack/react-router';
import { useId, useState } from 'react';
import { formatQuantity } from '../../lib/format';
import { formatMinutes, productCount, sourceDomain } from '../recipes/format';

/** Едно предложение в резултатите: отхвърлените са избледнели, одобрените водят към рецептата. */
export function SuggestionCard({
  suggestion,
}: {
  suggestion: RecipeSuggestion;
}) {
  const titleId = useId();
  const previewId = useId();
  const [previewOpen, setPreviewOpen] = useState(false);
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
        <button
          type="button"
          className="button button--quiet"
          aria-expanded={previewOpen}
          aria-controls={previewId}
          onClick={() => setPreviewOpen((open) => !open)}
        >
          Съставки и стъпки
        </button>
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
      <div id={previewId} hidden={!previewOpen}>
        {previewOpen && <SuggestionPreview suggestion={payload} />}
      </div>
    </article>
  );
}

/** Бърз преглед само за четене: продуктите и стъпките, за да се прецени дали предложението си струва. */
function SuggestionPreview({ suggestion }: { suggestion: Suggestion }) {
  const ingredientsId = useId();
  const stepsId = useId();
  return (
    <div className="suggestion-preview">
      <h3 className="suggestion-preview__title" id={ingredientsId}>
        Продукти
      </h3>
      <ul className="suggestion-preview__lines" aria-labelledby={ingredientsId}>
        {suggestion.ingredients.map((line) => (
          <li key={line.name} className="suggestion-preview__line">
            <span>{line.name}</span>{' '}
            <span className="suggestion-preview__quantity">
              {formatQuantity(line)}
            </span>
            {line.isNew && (
              <>
                {' '}
                <span className="suggestion-card__new">нов</span>
              </>
            )}
          </li>
        ))}
      </ul>
      <h3 className="suggestion-preview__title" id={stepsId}>
        Стъпки
      </h3>
      <ol
        className="recipe-view__steps suggestion-preview__steps"
        aria-labelledby={stepsId}
      >
        {suggestion.steps.map((step, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: стъпките нямат id, а редът им е смисълът.
          <li key={index}>{step}</li>
        ))}
      </ol>
    </div>
  );
}
