import {
  type PrepTimeRange,
  type RecipesSort,
  TAG_LABELS_BG,
  type Tag,
} from '@family/shared';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { ScreenHeader } from '../../app/ScreenHeader';
import { ErrorBox } from '../../components/ErrorBox';
import { Spinner } from '../../components/Spinner';
import { formatMinutes } from './format';
import { useRecipes } from './queries';
import { StarsBadge } from './Stars';
import { TagChips, TimeChips, toggled } from './TagChips';
import { useDebouncedValue } from './useDebouncedValue';
import './recipes.css';

const SEARCH_DEBOUNCE_MS = 300;

const SORT_LABELS: Record<RecipesSort, string> = {
  title: 'по име',
  rating: 'по оценка',
};

export function RecipeList() {
  const [search, setSearch] = useState('');
  const [tags, setTags] = useState<Tag[]>([]);
  const [times, setTimes] = useState<PrepTimeRange[]>([]);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [sort, setSort] = useState<RecipesSort>('title');
  const q = useDebouncedValue(search, SEARCH_DEBOUNCE_MS).trim();
  const recipes = useRecipes({
    ...(q ? { q } : {}),
    ...(tags.length > 0 ? { tags } : {}),
    ...(times.length > 0 ? { times } : {}),
    includeArchived,
    sort,
  });

  return (
    <main className="screen recipes">
      <ScreenHeader title="Рецепти">
        <Link to="/recipes/suggest" className="button button--quiet">
          Поискай предложение
        </Link>
        <Link to="/recipes/import" className="button button--quiet">
          Внеси
        </Link>
        <Link to="/recipes/new" className="button">
          Нова рецепта
        </Link>
      </ScreenHeader>

      <div className="recipes__filters">
        <input
          type="search"
          className="field__input"
          aria-label="Търси"
          placeholder="Търси по заглавие"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <TagChips
          label="Таг"
          selected={tags}
          onToggle={(tag) => setTags((current) => toggled(current, tag))}
        />
        <TimeChips
          label="Време"
          selected={times}
          onToggle={(time) => setTimes((current) => toggled(current, time))}
        />
        <label className="checkbox">
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(event) => setIncludeArchived(event.target.checked)}
          />
          Покажи архивираните
        </label>
        <fieldset className="chips" aria-label="Подреди">
          {(['title', 'rating'] as const).map((value) => (
            <label key={value} className="chip chip--radio">
              <input
                type="radio"
                name="recipes-sort"
                className="visually-hidden"
                checked={sort === value}
                onChange={() => setSort(value)}
              />
              {SORT_LABELS[value]}
            </label>
          ))}
        </fieldset>
      </div>

      {recipes.isPending ? (
        <Spinner />
      ) : recipes.isError ? (
        <ErrorBox
          error={recipes.error}
          onRetry={() => void recipes.refetch()}
        />
      ) : recipes.data.length === 0 ? (
        <div className="recipes__empty">
          <p>Няма рецепти. Добави първата или поискай предложение.</p>
          <Link to="/recipes/suggest" className="button">
            Поискай предложение
          </Link>
        </div>
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
    </main>
  );
}
