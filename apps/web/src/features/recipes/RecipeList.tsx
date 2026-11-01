import { TAG_LABELS_BG } from '@family/shared';
import { Link } from '@tanstack/react-router';
import { useCallback, useState } from 'react';
import { isPersonalDevice, useDeviceMode } from '../../app/device-mode';
import { ScreenHeader } from '../../app/ScreenHeader';
import { BackLink } from '../../components/BackLink';
import { ErrorBox } from '../../components/ErrorBox';
import { Spinner } from '../../components/Spinner';
import { formatMinutes } from './format';
import { useRecipes } from './queries';
import {
  clearedFilters,
  countFilters,
  RecipeFiltersSheet,
} from './RecipeFiltersSheet';
import { StarsBadge } from './Stars';
import { useStoredRecipeFilters } from './stored-filters';
import { useDebouncedValue } from './useDebouncedValue';
import './recipes.css';

const SEARCH_DEBOUNCE_MS = 300;

/** „141 рецепти“, „1 рецепта“; при търсене или филтър „12 от 141“. */
function resultCount(shown: number, total: number | undefined): string {
  if (total !== undefined) {
    return `${shown} от ${total}`;
  }
  return shown === 1 ? '1 рецепта' : `${shown} рецепти`;
}

export function RecipeList() {
  // kiosk чете регистъра, без действията, които пишат от името на потребител.
  const personal = isPersonalDevice(useDeviceMode().mode);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useStoredRecipeFilters();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const closeFilters = useCallback(() => setFiltersOpen(false), []);
  const selectedCount = countFilters(filters);
  const q = useDebouncedValue(search, SEARCH_DEBOUNCE_MS).trim();
  const recipes = useRecipes({ ...filters, q });
  // Целият регистър заедно с архивираните: „Няма рецепти“ и знаменателят на „12 от 141“.
  // С „Покажи архивираните“ и без търсене и етикети е същото query като списъка.
  const registry = useRecipes({ includeArchived: true, sort: filters.sort });
  const registryEmpty = registry.data?.length === 0;
  // Архивираните разширяват списъка, не го стесняват.
  const narrowed = q !== '' || selectedCount > Number(filters.includeArchived);
  const total = filters.includeArchived
    ? registry.data?.length
    : registry.data?.filter((recipe) => !recipe.archivedAt).length;

  return (
    <main className="screen recipes">
      <ScreenHeader title="Рецепти" start={!personal && <BackLink />}>
        {personal && (
          <>
            <Link to="/recipes/suggest" className="button button--quiet">
              Поискай предложения
            </Link>
            <Link to="/recipes/import" className="button button--quiet">
              Внеси
            </Link>
            <Link
              to="/recipes/new"
              className="button"
              aria-label="Нова рецепта"
            >
              + Нова
            </Link>
          </>
        )}
      </ScreenHeader>

      {!registryEmpty && (
        <div className="recipes__search">
          <input
            type="search"
            className="field__input"
            aria-label="Търси"
            placeholder="Търси по заглавие"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <button
            type="button"
            className="button button--quiet"
            onClick={() => setFiltersOpen(true)}
          >
            {selectedCount > 0 ? `Филтри (${selectedCount})` : 'Филтри'}
          </button>
          {selectedCount > 0 && (
            <button
              type="button"
              className="button button--quiet recipes__search-clear"
              aria-label="Изчисти"
              title="Изчисти филтрите"
              onClick={() => setFilters(clearedFilters(filters))}
            >
              ✕
            </button>
          )}
        </div>
      )}

      {filtersOpen && (
        <RecipeFiltersSheet
          filters={filters}
          onChange={setFilters}
          onClose={closeFilters}
        />
      )}

      {recipes.isPending ? (
        <Spinner />
      ) : recipes.isError ? (
        <ErrorBox
          error={recipes.error}
          onRetry={() => void recipes.refetch()}
        />
      ) : registryEmpty ? (
        <div className="recipes__empty">
          {personal ? (
            <>
              <p>Няма рецепти. Добави първата или поискай предложения.</p>
              <div className="recipes__actions">
                <Link to="/recipes/new" className="button">
                  Добави рецепта
                </Link>
                <Link to="/recipes/suggest" className="button button--quiet">
                  Поискай предложения
                </Link>
              </div>
            </>
          ) : (
            <p>Няма рецепти.</p>
          )}
        </div>
      ) : (
        <>
          <p className="recipes__count" aria-live="polite">
            {resultCount(recipes.data.length, narrowed ? total : undefined)}
          </p>
          {recipes.data.length === 0 ? (
            <p className="recipes__empty">Няма рецепти по този избор.</p>
          ) : (
            <ul className="recipe-cards">
              {recipes.data.map((recipe) => (
                <li key={recipe.id}>
                  <Link
                    to="/recipes/$id"
                    params={{ id: recipe.id }}
                    className="recipe-card"
                  >
                    <span className="recipe-card__title">
                      {recipe.title} <StarsBadge rating={recipe.rating} />
                    </span>
                    <span className="recipe-card__meta">
                      {recipe.prepMinutes !== undefined && (
                        <span>{formatMinutes(recipe.prepMinutes)}</span>
                      )}
                      {recipe.archivedAt && (
                        <span className="badge">архивирана</span>
                      )}
                      {recipe.openRevision && (
                        <span className="badge badge--revision">
                          Поправка чака преглед
                        </span>
                      )}
                    </span>
                    {recipe.tags.length > 0 && (
                      <span className="recipe-card__tags">
                        {recipe.tags.map((t) => TAG_LABELS_BG[t]).join(' · ')}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </main>
  );
}
