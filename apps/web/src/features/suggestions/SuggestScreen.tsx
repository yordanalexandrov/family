import {
  type DateKey,
  dateKeySchema,
  type RecipeSuggestParams,
  recipeSuggestParamsSchema,
} from '@family/shared';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { requestErrorFor } from '../../lib/ai-requests';
import { useRequestSuggestions } from './queries';
import { RecentRequests } from './RecentRequests';
import { SuggestForm } from './SuggestForm';
import '../recipes/recipes.css';
import './suggestions.css';

/**
 * Search на `/recipes/suggest`: входът на заявка за „Промени заявката“ или от „Нищо не става? Поискай нови рецепти“
 * в листа на ястие, за да попълни формата; `mealDate` е денят на ястието `mealId`, за реда над бутона.
 */
export type SuggestSearch = Partial<RecipeSuggestParams> & {
  mealDate?: DateKey;
};

/**
 * Само цял валиден вход попълва формата; иначе всеки ключ е изрично `undefined` (router-ът слива резултата върху
 * суровия search, виж `parseImportSearch`). Ястие има само с деня си.
 */
export function parseSuggestSearch(
  search: Record<string, unknown>,
): SuggestSearch {
  const parsed = recipeSuggestParamsSchema.safeParse(search);
  const params = parsed.success ? parsed.data : undefined;
  const mealDate = dateKeySchema.safeParse(search.mealDate);
  const meal =
    params?.mealId !== undefined && mealDate.success
      ? { mealId: params.mealId, mealDate: mealDate.data }
      : undefined;
  return {
    slots: params?.slots,
    times: params?.times,
    tags: params?.tags,
    hint: params?.hint,
    mealId: meal?.mealId,
    mealDate: meal?.mealDate,
  };
}

/** `/recipes/suggest`: формата за заявка (попълнена от „Промени заявката“) и последните заявки под нея. */
export function SuggestScreen() {
  const initial = useSearch({ from: '/recipes/suggest' });
  const requestSuggestions = useRequestSuggestions();
  const navigate = useNavigate();
  return (
    <main className="screen recipes">
      <header className="recipes__header">
        <Link to="/recipes" className="recipes__back recipes__back--block">
          ← Рецепти
        </Link>
        <h1 className="recipes__title">Поискай предложения</h1>
      </header>
      <SuggestForm
        initial={initial}
        isSubmitting={requestSuggestions.isPending}
        submitError={
          requestSuggestions.error
            ? requestErrorFor(requestSuggestions.error)
            : undefined
        }
        onSubmit={(params) =>
          requestSuggestions.mutate(params, {
            onSuccess(request) {
              void navigate({
                to: '/recipes/suggest/$requestId',
                params: { requestId: request.id },
              });
            },
          })
        }
      />
      <RecentRequests />
    </main>
  );
}
