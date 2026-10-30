import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  lazyRouteComponent,
  Navigate,
  Outlet,
  type RouterHistory,
  useLocation,
  useMatch,
  useRouter,
} from '@tanstack/react-router';
import { useEffect } from 'react';
import { Aurora } from '../components/Aurora';
import { CalendarScreen } from '../features/calendar/CalendarScreen';
import {
  CookingScreen,
  parseCookingSearch,
} from '../features/cooking/CookingScreen';
import { DashboardScreen } from '../features/dashboard/DashboardScreen';
import { DeviceScreen } from '../features/device/DeviceScreen';
import { MenuWeek, parseMenuSearch } from '../features/menu/MenuWeek';
import { PantryScreen } from '../features/pantry/PantryScreen';
import { ImportRequestView } from '../features/recipe-import/ImportRequestView';
import {
  ImportScreen,
  parseImportSearch,
} from '../features/recipe-import/ImportScreen';
import {
  EditRecipeScreen,
  NewRecipeScreen,
} from '../features/recipes/RecipeEditor';
import { RecipeList } from '../features/recipes/RecipeList';
import { RecipeView } from '../features/recipes/RecipeView';
import { SettingsScreen } from '../features/settings/SettingsScreen';
import { ShoppingWeek } from '../features/shopping/ShoppingWeek';
import { parseRequestSearch } from '../features/suggestions/request-search';
import { SuggestionRequestView } from '../features/suggestions/SuggestionRequestView';
import { SuggestionReview } from '../features/suggestions/SuggestionReview';
import {
  parseSuggestSearch,
  SuggestScreen,
} from '../features/suggestions/SuggestScreen';
import { WhoScreen } from '../features/who/WhoScreen';
import { ActingUserToast } from './ActingUserAvatar';
import { useActingUser } from './acting-user';

import {
  type DeviceMode,
  isPersonalDevice,
  parseDeviceMode,
  useDeviceMode,
} from './device-mode';
import { COOKING_IDLE_RETURN_MS, IdleReturn } from './IdleReturn';
import { MainNav } from './MainNav';
import { useAutoTheme } from './theme';
import { UpdateBar } from './UpdateBar';
import { useWakeLock } from './wake-lock';

const WHO_PATH = '/who';
const DEVICE_PATH = '/device';
const DEV_PREFIX = '/dev/';
const DEVICE_PARAM = 'device';

/**
 * Аурората е фонът на всички екрани. `?device=` записва режима на устройството и
 * се маха от адреса. Без режим всичко води към „Какво е това устройство?“; в режим
 * `phone` или `browser` без действащ потребител — към „Кой си?“. kiosk и TV нямат
 * потребител и държат екрана включен. Режимът стои и в `data-device` на <html> за CSS-а.
 */
function RootLayout() {
  useAutoTheme();
  const { mode } = useDeviceMode();
  useWakeLock(mode === 'kiosk' || mode === 'tv');
  useEffect(() => {
    if (mode) {
      document.documentElement.dataset.device = mode;
    } else {
      delete document.documentElement.dataset.device;
    }
  }, [mode]);
  const { actingUserId } = useActingUser();
  const { pathname, searchStr } = useLocation({
    select: ({ pathname, searchStr }) => ({ pathname, searchStr }),
  });
  const queryMode = parseDeviceMode(
    new URLSearchParams(searchStr).get(DEVICE_PARAM),
  );

  return (
    <>
      <Aurora />
      <UpdateBar />
      {isPersonalDevice(mode) && <ActingUserToast />}
      {queryMode ? (
        <ApplyDeviceQuery mode={queryMode} />
      ) : (
        <Screen
          pathname={pathname}
          mode={mode}
          hasActingUser={actingUserId !== null}
        />
      )}
    </>
  );
}

function Screen({
  pathname,
  mode,
  hasActingUser,
}: {
  pathname: string;
  mode: DeviceMode | null;
  hasActingUser: boolean;
}) {
  const cooking = useMatch({ from: '/recipes/$id/cook', shouldThrow: false });
  if (
    pathname === DEVICE_PATH ||
    (import.meta.env.DEV && pathname.startsWith(DEV_PREFIX))
  ) {
    return <Outlet />;
  }
  if (mode === null) {
    return <Navigate to={DEVICE_PATH} replace />;
  }
  if (pathname === WHO_PATH) {
    return <Outlet />;
  }
  if (isPersonalDevice(mode) && !hasActingUser) {
    return <Navigate to={WHO_PATH} replace />;
  }
  // Навигацията е долу на телефона и горе в браузъра; kiosk стига до календара и
  // настройките от дашборда, TV няма навигация (GLOSSARY: kiosk, TV). kiosk се връща
  // сам на дашборда след 60 с без докосване, а от Готвене — след 2 часа.
  return (
    <>
      {mode === 'browser' && <MainNav placement="top" />}
      <Outlet />
      {mode === 'phone' && <MainNav placement="bottom" />}
      {mode === 'kiosk' && pathname !== '/' && (
        <IdleReturn
          key={pathname}
          timeoutMs={cooking ? COOKING_IDLE_RETURN_MS : undefined}
        />
      )}
    </>
  );
}

/** Записва режима от `?device=` и подменя адреса със същия без параметъра. */
function ApplyDeviceQuery({ mode }: { mode: DeviceMode }) {
  const { setMode } = useDeviceMode();
  const router = useRouter();
  useEffect(() => {
    setMode(mode);
    const { pathname, searchStr, hash } = router.state.location;
    const search = new URLSearchParams(searchStr);
    search.delete(DEVICE_PARAM);
    const query = search.toString();
    void router.navigate({
      href: `${pathname}${query ? `?${query}` : ''}${hash ? `#${hash}` : ''}`,
      replace: true,
    });
  }, [mode, setMode, router]);
  return null;
}

function NotFound() {
  return (
    <main className="screen">
      <h1 className="screen__title">Няма такава страница</h1>
      <Link to="/" className="button">
        Към началото
      </Link>
    </main>
  );
}

const rootRoute = createRootRoute({
  component: RootLayout,
  notFoundComponent: NotFound,
});

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: DashboardScreen,
});

const calendarRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/calendar',
  component: CalendarScreen,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: SettingsScreen,
});

const whoRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: WHO_PATH,
  component: WhoScreen,
});

const deviceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: DEVICE_PATH,
  component: DeviceScreen,
});

// Регистър рецепти: телефон и браузър; kiosk го отваря за четене от „Рецепти“ на дашборда, TV го няма.
const recipesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/recipes',
  component: RecipeList,
});

const recipeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/recipes/$id',
  component: RecipeView,
});

const newRecipeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/recipes/new',
  component: NewRecipeScreen,
});

const editRecipeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/recipes/$id/edit',
  component: EditRecipeScreen,
});

// Готвене (GLOSSARY): kiosk, телефон и браузър; влиза се от изгледа на рецептата.
const cookingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/recipes/$id/cook',
  component: CookingScreen,
  validateSearch: parseCookingSearch,
});

// Седмично меню: телефон и таблет; не влиза в kiosk/TV навигацията.
const menuRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/menu',
  component: MenuWeek,
  validateSearch: parseMenuSearch,
});

// Списък за пазаруване: телефон и таблет; не влиза в kiosk/TV навигацията.
const shoppingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/shopping',
  component: ShoppingWeek,
});

// Килер: само телефонът; не влиза в kiosk/TV навигацията.
const pantryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/pantry',
  component: PantryScreen,
});

// Предложения за рецепти: заявка, изчакване и резултати, преглед и одобрение.
const suggestRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/recipes/suggest',
  component: SuggestScreen,
  validateSearch: parseSuggestSearch,
});

const suggestionRequestRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/recipes/suggest/$requestId',
  component: SuggestionRequestView,
  validateSearch: parseRequestSearch,
});

const suggestionReviewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/recipes/suggest/$requestId/$suggestionId',
  component: SuggestionReview,
});

const importRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/recipes/import',
  component: ImportScreen,
  validateSearch: parseImportSearch,
});

const importRequestRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/recipes/import/$requestId',
  component: ImportRequestView,
});

// Временна витрина на дизайн системата (#46), само в dev; production build-ът я изрязва.
const devRoutes = import.meta.env.DEV
  ? [
      createRoute({
        getParentRoute: () => rootRoute,
        path: '/dev/glass',
        component: lazyRouteComponent(
          () => import('../features/dev/GlassScreen'),
          'GlassScreen',
        ),
      }),
    ]
  : [];

const routeTree = rootRoute.addChildren([
  dashboardRoute,
  calendarRoute,
  settingsRoute,
  whoRoute,
  deviceRoute,
  recipesRoute,
  newRecipeRoute,
  recipeRoute,
  editRecipeRoute,
  cookingRoute,
  suggestRoute,
  suggestionRequestRoute,
  suggestionReviewRoute,
  importRoute,
  importRequestRoute,
  menuRoute,
  shoppingRoute,
  pantryRoute,
  ...devRoutes,
]);

export function createAppRouter(history?: RouterHistory) {
  return createRouter({
    routeTree,
    ...(history ? { history } : {}),
    scrollRestoration: true,
  });
}

export type AppRouter = ReturnType<typeof createAppRouter>;

declare module '@tanstack/react-router' {
  interface Register {
    router: AppRouter;
  }
}
