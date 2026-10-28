import {
  type AnyRecipeSuggestion,
  type Ingredient,
  normalizeIngredientName,
} from '@family/shared';
import { useQueries } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { ErrorBox } from '../../components/ErrorBox';
import { Spinner } from '../../components/Spinner';
import { ingredientSearchQuery } from '../recipes/queries';
import { RecipeForm } from '../recipes/RecipeForm';
import {
  useApproveSuggestion,
  useRejectSuggestion,
  useSuggestionRequest,
} from './queries';
import {
  importToFormValues,
  suggestionToFormValues,
} from './suggestion-form-values';
import '../recipes/recipes.css';
import './suggestions.css';

const ROUTE = '/recipes/suggest/$requestId/$suggestionId';

/** `/recipes/suggest/:requestId/:suggestionId`: преглед, редакция и одобрение на едно предложение. */
export function SuggestionReview() {
  const { requestId, suggestionId } = useParams({ from: ROUTE });
  const detail = useSuggestionRequest(requestId);
  const navigate = useNavigate();
  const suggestion = detail.data?.suggestions.find(
    (s) => s.id === suggestionId,
  );

  function backToRequest() {
    void navigate({ to: '/recipes/suggest/$requestId', params: { requestId } });
  }

  return (
    <main className="screen recipes">
      <header className="recipes__header">
        <Link
          to="/recipes/suggest/$requestId"
          params={{ requestId }}
          className="recipes__back recipes__back--block"
        >
          ← Предложения
        </Link>
        <h1 className="recipes__title">
          {suggestion ? suggestion.payload.title : 'Предложение'}
        </h1>
      </header>
      {detail.isPending ? (
        <Spinner />
      ) : detail.isError ? (
        <ErrorBox error={detail.error} onRetry={() => void detail.refetch()} />
      ) : !suggestion ? (
        <p className="recipes__empty">Няма такова предложение.</p>
      ) : suggestion.status !== 'proposed' ? (
        <Decided suggestion={suggestion} />
      ) : (
        <ReviewSuggestion
          suggestion={suggestion}
          // Обратно към заявката: там са и другите предложения, а одобреното води към рецептата.
          onApproved={backToRequest}
          onRejected={backToRequest}
          onCancel={backToRequest}
        />
      )}
    </main>
  );
}

/** Решено предложение (от заявка или от внасяне): какво е решено и връзка към рецептата. */
export function Decided({ suggestion }: { suggestion: AnyRecipeSuggestion }) {
  return (
    <div className="recipes__empty">
      <p>
        {suggestion.status === 'approved'
          ? 'Предложението е одобрено.'
          : 'Предложението е отхвърлено.'}
      </p>
      {suggestion.recipeId && (
        <Link
          to="/recipes/$id"
          params={{ id: suggestion.recipeId }}
          className="button"
        >
          Към рецептата
        </Link>
      )}
    </div>
  );
}

/**
 * Продуктите на предложение от `recipe.suggest`, които агентът смята за познати, по име от регистъра (точно
 * съвпадение на каноничното име). Търсенето връща точното съвпадение първо, така че лимитът от 50 реда не го изрязва.
 * Предложението от внасяне идва със свързани продукти и не търси нищо.
 */
function useResolvedIngredients(suggestion: AnyRecipeSuggestion) {
  const names =
    suggestion.origin === 'suggest'
      ? [
          ...new Set(
            suggestion.payload.ingredients
              .filter((line) => !line.isNew)
              .map((line) => line.name),
          ),
        ]
      : [];
  return useQueries({
    queries: names.map((name) => ingredientSearchQuery(name)),
    combine(results) {
      const resolved = new Map<string, Ingredient>();
      names.forEach((name, index) => {
        const canonical = normalizeIngredientName(name);
        const match = results[index]?.data?.find((i) => i.name === canonical);
        if (match) {
          resolved.set(name, match);
        }
      });
      return {
        // Неуспешно търсене не спира прегледа: редът просто остава за свързване.
        isPending: results.some((result) => result.isPending),
        resolved,
      };
    },
  });
}

interface ReviewSuggestionProps {
  suggestion: AnyRecipeSuggestion;
  /** Внасяне: продуктите от регистъра, с които са свързани редовете му. */
  linked?: readonly Ingredient[];
  /** Внасяне: линкът към източника от заявката (предложението от `recipe.suggest` носи своя). */
  sourceUrl?: string | undefined;
  onApproved: (recipeId: string) => void;
  onRejected: () => void;
  /** „Откажи“: излиза от прегледа, без решение. */
  onCancel: () => void;
}

/**
 * Преглед, редакция и одобрение на едно предложение за рецепта, от заявка за предложения или от внасяне. На мястото на
 * „защо“ при внасянето са допусканията на агента; новите продукти се свързват или създават в листа на реда, преди „Одобри“.
 */
export function ReviewSuggestion({
  suggestion,
  linked = [],
  sourceUrl,
  onApproved,
  onRejected,
  onCancel,
}: ReviewSuggestionProps) {
  const { isPending, resolved } = useResolvedIngredients(suggestion);
  const approve = useApproveSuggestion();
  const reject = useRejectSuggestion();
  const imported = suggestion.origin === 'import';
  const note = imported
    ? suggestion.payload.assumptions
    : suggestion.payload.why;
  const source = imported ? sourceUrl : suggestion.payload.sourceUrl;

  return (
    <>
      <section className="suggestions__section">
        {note && <p className="suggestion-card__why">{note}</p>}
        <div className="recipes__actions">
          {source && (
            <a
              href={source}
              target="_blank"
              rel="noopener noreferrer"
              className="button button--quiet"
            >
              Отвори източника
            </a>
          )}
          <button
            type="button"
            className="button button--quiet"
            disabled={reject.isPending}
            onClick={() =>
              reject.mutate(suggestion.id, { onSuccess: () => onRejected() })
            }
          >
            Отхвърли
          </button>
        </div>
        {reject.isError && <ErrorBox error={reject.error} />}
      </section>
      {isPending ? (
        <Spinner />
      ) : (
        <RecipeForm
          key={suggestion.id}
          initialValues={
            suggestion.origin === 'import'
              ? importToFormValues(suggestion.payload, linked, sourceUrl)
              : suggestionToFormValues(suggestion.payload, resolved)
          }
          submitLabel="Одобри"
          requireResolvedIngredients
          isSubmitting={approve.isPending}
          submitError={approve.error}
          onSubmit={(input) =>
            approve.mutate(
              { id: suggestion.id, input },
              { onSuccess: ({ recipe }) => onApproved(recipe.id) },
            )
          }
          onCancel={onCancel}
        />
      )}
    </>
  );
}
