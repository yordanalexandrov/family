import {
  useCanGoBack,
  useNavigate,
  useParams,
  useRouter,
  useSearch,
} from '@tanstack/react-router';
import { isPersonalDevice, useDeviceMode } from '../../app/device-mode';
import { useWakeLock } from '../../app/wake-lock';
import { ErrorBox } from '../../components/ErrorBox';
import { Spinner } from '../../components/Spinner';
import { useRecipe } from '../recipes/queries';
import { CookingView } from './CookingView';

export interface CookingSearch {
  /** Порциите при влизане, напр. на ястието от менюто; без тях се ползват порциите на рецептата. */
  servings?: number;
}

export function parseCookingSearch(
  search: Record<string, unknown>,
): CookingSearch {
  const servings = Number(search.servings);
  return Number.isInteger(servings) && servings >= 1 ? { servings } : {};
}

/** `/recipes/$id/cook`: Готвене (GLOSSARY) за рецептата. */
export function CookingScreen() {
  const { id } = useParams({ from: '/recipes/$id/cook' });
  const { servings } = useSearch({ from: '/recipes/$id/cook' });
  const recipe = useRecipe(id);
  const router = useRouter();
  const navigate = useNavigate();
  const canGoBack = useCanGoBack();
  // Телефон и браузър държат екрана включен само в Готвене; kiosk го държи навсякъде (RootLayout).
  const { mode } = useDeviceMode();
  useWakeLock(isPersonalDevice(mode));
  // „Готово“ връща там, откъдето си влязъл; без предишен екран (отворено по адрес) — към изгледа на рецептата.
  const exit = () => {
    if (canGoBack) {
      router.history.back();
    } else {
      void navigate({ to: '/recipes/$id', params: { id }, replace: true });
    }
  };

  if (recipe.isPending) {
    return (
      <main className="screen">
        <Spinner />
      </main>
    );
  }
  if (recipe.isError) {
    return (
      <main className="screen">
        <ErrorBox error={recipe.error} onRetry={() => void recipe.refetch()} />
      </main>
    );
  }
  return <CookingView recipe={recipe.data} servings={servings} onExit={exit} />;
}
