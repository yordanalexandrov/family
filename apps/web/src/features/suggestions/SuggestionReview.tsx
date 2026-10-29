import {
  type AnyRecipeSuggestion,
  canonicalTitle,
  type DuplicateOf,
  type Ingredient,
  normalizeIngredientName,
  type RecipeSummary,
} from '@family/shared';
import { useQueries } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { useId, useState } from 'react';
import { ActionBar } from '../../components/ActionBar';
import { ErrorBox } from '../../components/ErrorBox';
import { Sheet } from '../../components/Sheet';
import { Spinner } from '../../components/Spinner';
import { useObjectUrl } from '../../lib/use-object-url';
import { ApplianceBadge } from '../recipes/ApplianceBadge';
import { ingredientSearchQuery, useRecipes } from '../recipes/queries';
import { RecipeForm } from '../recipes/RecipeForm';
import {
  useApproveSuggestion,
  useRejectSuggestion,
  useRestoreSuggestion,
  useSuggestionRequest,
} from './queries';
import type { RequestSearch } from './request-search';
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

  function backToRequest(search: RequestSearch = {}) {
    void navigate({
      to: '/recipes/suggest/$requestId',
      params: { requestId },
      search,
    });
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
          // Изборът в прегледа (уред, „… въпреки това“) е за това предложение.
          key={suggestion.id}
          suggestion={suggestion}
          // Обратно към заявката: там са и другите предложения; toast-ът дава „Върни“ или „Отвори“ (към рецептата).
          onApproved={(recipeId) => backToRequest({ approved: recipeId })}
          onRejected={() => backToRequest({ rejected: suggestionId })}
          onCancel={() => backToRequest()}
        />
      )}
    </main>
  );
}

/**
 * Решено предложение (от заявка или от внасяне): какво е решено и връзка към рецептата; отхвърленото има „Върни“ —
 * пак е предложение и прегледът се връща на мястото си.
 */
export function Decided({ suggestion }: { suggestion: AnyRecipeSuggestion }) {
  const restore = useRestoreSuggestion();
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
      {suggestion.status === 'rejected' && (
        <button
          type="button"
          className="button"
          disabled={restore.isPending}
          onClick={() => restore.mutate(suggestion.id)}
        >
          Върни
        </button>
      )}
      {restore.isError && <ErrorBox error={restore.error} />}
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
  /** Внасяне от снимка: снимката, ако още е в паметта на страницата (същото внасяне, без презареждане). */
  photo?: Blob | undefined;
  onApproved: (recipeId: string) => void;
  onRejected: () => void;
  /** „Откажи“: излиза от прегледа, без решение. */
  onCancel: () => void;
}

/** Миниатюрата на внасяната снимка; докосване я отваря в цял размер в лист. */
function SourcePhoto({ photo }: { photo: Blob }) {
  const url = useObjectUrl(photo);
  const [open, setOpen] = useState(false);
  if (!url) {
    return null;
  }
  return (
    <>
      <button
        type="button"
        className="suggestion-photo"
        onClick={() => setOpen(true)}
      >
        <img
          className="suggestion-photo__thumb"
          src={url}
          alt="Снимката на рецептата"
        />
      </button>
      {open && (
        <Sheet title="Снимка" onClose={() => setOpen(false)}>
          <img
            className="suggestion-photo__full"
            src={url}
            alt="Снимката на рецептата"
          />
        </Sheet>
      )}
    </>
  );
}

/**
 * Рецепта със същото заглавие вече е в регистъра: „Отвори“ води към нея, „Внеси въпреки това“ (при внасяне) или
 * „Одобри въпреки това“ (при предложение от заявка) връща „Одобри“.
 */
function DuplicateWarning({
  duplicate,
  anywayLabel,
  onAnyway,
}: {
  duplicate: DuplicateOf;
  anywayLabel: string;
  onAnyway: () => void;
}) {
  const labelId = useId();
  return (
    <section
      className="suggestion-note suggestion-note--warning suggestion-duplicate"
      aria-labelledby={labelId}
    >
      <p id={labelId} className="suggestion-note__label">
        Има рецепта със същото заглавие
      </p>
      <p className="suggestion-duplicate__title">{duplicate.title}</p>
      <div className="recipes__actions">
        <Link
          to="/recipes/$id"
          params={{ id: duplicate.id }}
          className="button"
        >
          Отвори
        </Link>
        <button
          type="button"
          className="button button--quiet"
          onClick={onAnyway}
        >
          {anywayLabel}
        </button>
      </div>
    </section>
  );
}

/**
 * Рецептата в регистъра със заглавието от формата (канонично). Докато то е това на агента, отговорът е `duplicateOf`
 * от api-то; иначе се търси в списъка на рецептите (без архивираните).
 */
function duplicateOf(
  title: string,
  suggestion: AnyRecipeSuggestion,
  registry: readonly RecipeSummary[] | undefined,
): DuplicateOf | undefined {
  const key = canonicalTitle(title);
  if (key === canonicalTitle(suggestion.payload.title)) {
    return suggestion.duplicateOf;
  }
  const recipe =
    key === ''
      ? undefined
      : registry?.find((r) => canonicalTitle(r.title) === key);
  return recipe && { id: recipe.id, title: recipe.title };
}

/**
 * Преглед, редакция и одобрение на едно предложение за рецепта, от заявка за предложения или от внасяне. На мястото на
 * „защо“ при внасянето са допусканията на агента; новите продукти се свързват или създават в листа на реда, преди „Одобри“.
 */
export function ReviewSuggestion({
  suggestion,
  linked = [],
  sourceUrl,
  photo,
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
  // Значката следва избора в „Уред“ във формата; до първата смяна е уредът на предложението.
  const [chosenAppliance, setChosenAppliance] = useState<string>();
  const appliance = imported
    ? undefined
    : chosenAppliance === undefined
      ? suggestion.payload.appliance
      : chosenAppliance || undefined;
  const navigate = useNavigate();
  // Като при линк, който вече е в регистъра: „Отвори“, докато човекът не избере „… въпреки това“ за тази рецепта.
  const [title, setTitle] = useState(suggestion.payload.title);
  const registry = useRecipes({});
  const [importedAnyway, setImportedAnyway] = useState<string>();
  const sameTitle = duplicateOf(title, suggestion, registry.data);
  const duplicate = sameTitle?.id === importedAnyway ? undefined : sameTitle;
  const rejectAction = {
    label: 'Отхвърли',
    disabled: reject.isPending,
    onClick: () => {
      // В лентата е грешката от последното действие.
      approve.reset();
      reject.mutate(suggestion.id, { onSuccess: () => onRejected() });
    },
  };

  return (
    <>
      {duplicate && (
        <DuplicateWarning
          duplicate={duplicate}
          anywayLabel={imported ? 'Внеси въпреки това' : 'Одобри въпреки това'}
          onAnyway={() => setImportedAnyway(duplicate.id)}
        />
      )}
      {(photo || appliance || note || source) && (
        <section className="suggestions__section">
          {photo && <SourcePhoto photo={photo} />}
          {appliance && (
            <p className="suggestion-card__meta">
              <ApplianceBadge name={appliance} />
            </p>
          )}
          {note && (
            <p
              className={
                imported
                  ? 'suggestion-note suggestion-note--warning'
                  : 'suggestion-note'
              }
            >
              <strong className="suggestion-note__label">
                {imported ? 'AI допусна:' : 'Защо:'}
              </strong>{' '}
              {note}
            </p>
          )}
          {source && (
            <div className="recipes__actions">
              <a
                href={source}
                target="_blank"
                rel="noopener noreferrer"
                className="button button--quiet"
              >
                Отвори източника
              </a>
            </div>
          )}
        </section>
      )}
      {isPending ? (
        <>
          <Spinner />
          {/* Отхвърлянето не чака продуктите; одобрението чака формата. */}
          <ActionBar
            primary={{ label: 'Одобри', onClick: () => {}, disabled: true }}
            secondary={[rejectAction, { label: 'Откажи', onClick: onCancel }]}
          >
            {reject.error !== null && <ErrorBox error={reject.error} />}
          </ActionBar>
        </>
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
          // Грешката от „Одобри“ или „Отхвърли“: и двете са в лентата, а всяко нулира другото.
          submitError={reject.error ?? approve.error}
          onSubmit={(input) => {
            reject.reset();
            approve.mutate(
              // „Без уред“ е `null`: без поле API-то би взело уреда на предложението.
              {
                id: suggestion.id,
                input: { ...input, appliance: input.appliance ?? null },
              },
              { onSuccess: ({ recipe }) => onApproved(recipe.id) },
            );
          }}
          onCancel={onCancel}
          primaryAction={
            duplicate && {
              label: 'Отвори',
              onClick: () =>
                void navigate({
                  to: '/recipes/$id',
                  params: { id: duplicate.id },
                }),
            }
          }
          extraActions={[rejectAction]}
          onTitleChange={setTitle}
          onApplianceChange={setChosenAppliance}
        />
      )}
    </>
  );
}
