import { AISLES, type Recipe, TAG_LABELS_BG } from '@family/shared';
import { Link, useParams } from '@tanstack/react-router';
import { ErrorBox } from '../../components/ErrorBox';
import { Spinner } from '../../components/Spinner';
import { formatMinutes, formatNumber, formatQuantity } from './format';
import { useArchiveRecipe, useRecipe } from './queries';
import './recipes.css';

export function RecipeView() {
  const { id } = useParams({ from: '/recipes/$id' });
  const recipe = useRecipe(id);

  return (
    <main className="screen recipes">
      <Link to="/recipes" className="recipes__back">
        ← Рецепти
      </Link>
      {recipe.isPending ? (
        <Spinner />
      ) : recipe.isError ? (
        <ErrorBox error={recipe.error} onRetry={() => void recipe.refetch()} />
      ) : (
        <RecipeDetails recipe={recipe.data} />
      )}
    </main>
  );
}

/** Продуктите по щандове, в реда на обхождане на магазина. */
function groupByAisle(lines: Recipe['ingredients']) {
  return AISLES.map((aisle) => ({
    ...aisle,
    lines: lines.filter((line) => line.ingredient.aisle === aisle.key),
  })).filter((group) => group.lines.length > 0);
}

function RecipeDetails({ recipe }: { recipe: Recipe }) {
  const archive = useArchiveRecipe();
  const archived = recipe.archivedAt !== null;
  const nutrition = recipe.nutritionPer100g;

  return (
    <article className="recipe-view">
      <header className="recipe-view__wide recipes__filters">
        <h1 className="recipes__title">{recipe.title}</h1>
        <p className="recipe-view__meta">
          <span>{recipe.servings} порции</span>
          {recipe.prepMinutes !== undefined && (
            <span>{formatMinutes(recipe.prepMinutes)}</span>
          )}
          {recipe.tags.map((tag) => (
            <span key={tag} className="badge">
              {TAG_LABELS_BG[tag]}
            </span>
          ))}
          {archived && <span className="badge">Архивирана</span>}
        </p>
        <div className="recipes__actions">
          <Link
            to="/recipes/$id/edit"
            params={{ id: recipe.id }}
            className="button"
          >
            Редактирай
          </Link>
          <button
            type="button"
            className="button button--quiet"
            disabled={archive.isPending}
            onClick={() =>
              archive.mutate({ id: recipe.id, archived: !archived })
            }
          >
            {archived ? 'Върни' : 'Архивирай'}
          </button>
        </div>
        {archive.isError && <ErrorBox error={archive.error} />}
      </header>

      <section className="recipe-view__section" aria-labelledby="ingredients">
        <h2 id="ingredients">Продукти</h2>
        {recipe.ingredients.length === 0 && (
          <p className="recipe-view__meta">Няма въведени продукти.</p>
        )}
        {groupByAisle(recipe.ingredients).map((group) => (
          <div key={group.key}>
            <h3 id={`aisle-${group.key}`}>{group.labelBg}</h3>
            <ul
              className="recipe-view__lines"
              aria-labelledby={`aisle-${group.key}`}
            >
              {group.lines.map((line) => (
                <li key={line.ingredientId} className="recipe-view__line">
                  <span>{line.ingredient.name}</span>
                  <span>{formatQuantity(line)}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section className="recipe-view__section" aria-labelledby="steps">
        <h2 id="steps">Стъпки</h2>
        <ol className="recipe-view__steps" aria-labelledby="steps">
          {recipe.steps.map((step, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: стъпките нямат id, а редът им е смисълът.
            <li key={index}>{step}</li>
          ))}
        </ol>
      </section>

      {(recipe.sourceUrl || nutrition) && (
        <footer className="recipe-view__wide recipe-view__meta">
          {recipe.sourceUrl && (
            <a href={recipe.sourceUrl} target="_blank" rel="noreferrer">
              Източник
            </a>
          )}
          {nutrition && (
            <span>
              ≈ хранителна стойност на 100 г: {formatNumber(nutrition.kcal)}{' '}
              kcal · белтъчини {formatNumber(nutrition.proteinG)} г · мазнини{' '}
              {formatNumber(nutrition.fatG)} г · въглехидрати{' '}
              {formatNumber(nutrition.carbsG)} г
            </span>
          )}
        </footer>
      )}
    </article>
  );
}
