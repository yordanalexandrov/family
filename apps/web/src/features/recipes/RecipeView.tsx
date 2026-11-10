import {
  AISLES,
  linesByComponent,
  type Recipe,
  TAG_LABELS_BG,
} from '@family/shared';
import { Link, useParams } from '@tanstack/react-router';
import { useState } from 'react';
import { useWritingUserId } from '../../app/acting-user';
import { isInteractiveDevice, useDeviceMode } from '../../app/device-mode';
import { AisleGroup, AisleGroups } from '../../components/AisleGroup';
import { ErrorBox } from '../../components/ErrorBox';
import { Spinner } from '../../components/Spinner';
import { formatNumber, formatQuantity } from '../../lib/format';
import { PreparationList } from '../preparation/PreparationList';
import { StepPhotoThumbnail } from '../step-photos/StepPhotoThumbnail';
import { ApplianceBadge } from './ApplianceBadge';
import { CookingFeedbackSheet } from './CookingFeedbackSheet';
import { componentHeading, formatMinutes } from './format';
import { OpenRevisionBadge } from './OpenRevisionBadge';
import { useArchiveRecipe, useRateRecipe, useRecipe } from './queries';
import { RecipeSource } from './RecipeSource';
import { RatingStars, StarsBadge } from './Stars';
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

function IngredientLines({
  lines,
  labelledBy,
}: {
  lines: Recipe['ingredients'];
  labelledBy: string;
}) {
  return (
    <ul className="recipe-view__lines" aria-labelledby={labelledBy}>
      {lines.map((line, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: един продукт може да е на два реда (за блата и за крема), а редовете нямат id.
        <li key={index} className="recipe-view__line">
          <span>{line.ingredient.name}</span>
          <span>{formatQuantity(line)}</span>
        </li>
      ))}
    </ul>
  );
}

function RecipeDetails({ recipe }: { recipe: Recipe }) {
  const archive = useArchiveRecipe();
  const rate = useRateRecipe();
  const archived = recipe.archivedAt !== null;
  const nutrition = recipe.nutritionPer100g;
  // Оценката, редакцията и архивът пишат от името на потребител; kiosk и TV нямат такъв.
  const canWrite = useWritingUserId() !== null;
  // Готвене (GLOSSARY), „Как мина?“ и снимките на стъпките са на kiosk, телефона и браузъра, но не и на TV.
  const interactive = isInteractiveDevice(useDeviceMode().mode);
  const canCook = interactive;
  // „Как мина?“ (GLOSSARY: Обратна връзка след готвене) и по-късно, след като е опитал.
  const [feedback, setFeedback] = useState(false);
  // GLOSSARY: Източник на рецепта. На TV не се показва: там няма какво да се отвори.
  const hasSource =
    interactive &&
    (recipe.sourceUrl !== undefined || recipe.sourceText !== null);
  const lines = linesByComponent(
    recipe.ingredients,
    recipe.components.length,
    (line) => line.component,
  );

  return (
    <article className="recipe-view">
      <header className="recipe-view__wide recipes__filters">
        <h1 className="recipes__title recipe-view__title">{recipe.title}</h1>
        {canWrite ? (
          <RatingStars
            rating={recipe.rating}
            onRate={(rating) => rate.mutate({ id: recipe.id, rating })}
          />
        ) : (
          <StarsBadge rating={recipe.rating} />
        )}
        {rate.isError && <ErrorBox error={rate.error} />}
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
          {recipe.appliance && <ApplianceBadge name={recipe.appliance} />}
          {archived && <span className="badge">Архивирана</span>}
          {recipe.openRevision && (
            <OpenRevisionBadge recipeId={recipe.id} canEdit={canWrite} />
          )}
        </p>
        {canCook && (
          <div className="recipes__actions recipes__actions--fill">
            <Link
              to="/recipes/$id/cook"
              params={{ id: recipe.id }}
              className="button recipe-view__cook"
            >
              Готви
            </Link>
            <button
              type="button"
              className="button button--quiet"
              onClick={() => setFeedback(true)}
            >
              Как мина?
            </button>
          </div>
        )}
        {feedback && (
          <CookingFeedbackSheet
            recipe={recipe}
            onDone={() => setFeedback(false)}
            onClose={() => setFeedback(false)}
          />
        )}
        {canWrite && (
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
        )}
        {archive.isError && <ErrorBox error={archive.error} />}
      </header>

      {recipe.preparation.length > 0 && (
        <section
          className="recipe-view__section recipe-view__wide"
          aria-labelledby="preparation"
        >
          <h2 id="preparation">Подготовка</h2>
          <PreparationList
            preparation={recipe.preparation}
            labelledBy="preparation"
          />
        </section>
      )}

      <section className="recipe-view__section" aria-labelledby="ingredients">
        <h2 id="ingredients">Продукти</h2>
        {recipe.ingredients.length === 0 && (
          <p className="recipe-view__meta">Няма въведени продукти.</p>
        )}
        {lines.main.length > 0 && (
          <AisleGroups>
            {groupByAisle(lines.main).map((group) => (
              <AisleGroup
                key={group.key}
                aisle={group.key}
                headingLevel={3}
                headingId={`aisle-${group.key}`}
              >
                <IngredientLines
                  lines={group.lines}
                  labelledBy={`aisle-${group.key}`}
                />
              </AisleGroup>
            ))}
          </AisleGroups>
        )}
        {recipe.components.map((component, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: компонентите нямат id; редът им е идентичността им.
          <div key={index}>
            <h3 id={`component-${index}`}>{componentHeading(component)}</h3>
            <IngredientLines
              lines={lines.components[index] ?? []}
              labelledBy={`component-${index}`}
            />
          </div>
        ))}
      </section>

      <section className="recipe-view__section" aria-labelledby="steps">
        <h2 id="steps">Стъпки</h2>
        <ol className="recipe-view__steps" aria-labelledby="steps">
          {recipe.steps.map((step, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: стъпките нямат id, а редът им е смисълът.
            <li key={index}>
              {/* Флексът е вътре: `li` остава ред от списъка и пази номера си. */}
              <div className="recipe-view__step">
                <span className="recipe-view__step-text">{step.text}</span>
                {interactive && step.photoId && (
                  <StepPhotoThumbnail
                    photoId={step.photoId}
                    label={`Снимката на стъпка ${index + 1}`}
                  />
                )}
              </div>
            </li>
          ))}
        </ol>
      </section>

      {(hasSource || nutrition) && (
        <footer className="recipe-view__wide recipe-view__meta">
          {hasSource && (
            <RecipeSource
              url={recipe.sourceUrl}
              text={recipe.sourceText}
              label="Източник"
              className="recipe-view__source"
            />
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
