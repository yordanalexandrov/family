import {
  type Ingredient,
  normalizeIngredientName,
  type RecipeSuggestion,
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
import { suggestionToFormValues } from './suggestion-form-values';
import '../recipes/recipes.css';
import './suggestions.css';

const ROUTE = '/recipes/suggest/$requestId/$suggestionId';

/** `/recipes/suggest/:requestId/:suggestionId`: преглед, редакция и одобрение на едно предложение. */
export function SuggestionReview() {
  const { requestId, suggestionId } = useParams({ from: ROUTE });
  const detail = useSuggestionRequest(requestId);
  const suggestion = detail.data?.suggestions.find(
    (s) => s.id === suggestionId,
  );
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
        <Review suggestion={suggestion} />
      )}
    </main>
  );
}

function Decided({ suggestion }: { suggestion: RecipeSuggestion }) {
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
 * Продуктите, които агентът смята за познати, по име от регистъра (точно съвпадение на каноничното име). Търсенето
 * връща точното съвпадение първо, така че лимитът от 50 реда не го изрязва.
 */
function useResolvedIngredients(suggestion: RecipeSuggestion) {
  const names = [
    ...new Set(
      suggestion.payload.ingredients
        .filter((line) => !line.isNew)
        .map((line) => line.name),
    ),
  ];
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

function Review({ suggestion }: { suggestion: RecipeSuggestion }) {
  const { isPending, resolved } = useResolvedIngredients(suggestion);
  const approve = useApproveSuggestion();
  const reject = useRejectSuggestion();
  const navigate = useNavigate();
  const { payload } = suggestion;

  function backToRequest() {
    void navigate({
      to: '/recipes/suggest/$requestId',
      params: { requestId: suggestion.requestId },
    });
  }

  return (
    <>
      <section className="suggestions__section">
        <p className="suggestion-card__why">{payload.why}</p>
        <div className="recipes__actions">
          <a
            href={payload.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="button button--quiet"
          >
            Отвори източника
          </a>
          <button
            type="button"
            className="button button--quiet"
            disabled={reject.isPending}
            onClick={() =>
              reject.mutate(suggestion.id, { onSuccess: backToRequest })
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
          initialValues={suggestionToFormValues(payload, resolved)}
          submitLabel="Одобри"
          requireResolvedIngredients
          isSubmitting={approve.isPending}
          submitError={approve.error}
          onSubmit={(input) =>
            approve.mutate(
              { id: suggestion.id, input },
              {
                onSuccess({ recipe }) {
                  void navigate({
                    to: '/recipes/$id',
                    params: { id: recipe.id },
                  });
                },
              },
            )
          }
          onCancel={backToRequest}
        />
      )}
    </>
  );
}
