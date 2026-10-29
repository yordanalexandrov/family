import {
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

/** Search на `/recipes/suggest`: входът на заявка за „Промени заявката“, за да попълни формата. */
export type SuggestSearch = Partial<RecipeSuggestParams>;

/**
 * Само цял валиден вход попълва формата; иначе всеки ключ е изрично `undefined` (router-ът слива резултата върху
 * суровия search, виж `parseImportSearch`).
 */
export function parseSuggestSearch(
  search: Record<string, unknown>,
): SuggestSearch {
  const parsed = recipeSuggestParamsSchema.safeParse(search);
  const params = parsed.success ? parsed.data : undefined;
  return {
    slots: params?.slots,
    times: params?.times,
    tags: params?.tags,
    hint: params?.hint,
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
