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
  useRouter,
} from '@tanstack/react-router';
import { useEffect } from 'react';
import { Aurora } from '../components/Aurora';
import { CalendarScreen } from '../features/calendar/CalendarScreen';
import { DashboardScreen } from '../features/dashboard/DashboardScreen';
import { DeviceScreen } from '../features/device/DeviceScreen';
import { MenuWeek, parseMenuSearch } from '../features/menu/MenuWeek';
import { PantryScreen } from '../features/pantry/PantryScreen';
import {
  EditRecipeScreen,
  NewRecipeScreen,
} from '../features/recipes/RecipeEditor';
import { RecipeList } from '../features/recipes/RecipeList';
import { RecipeView } from '../features/recipes/RecipeView';
import { SettingsScreen } from '../features/settings/SettingsScreen';
import { ShoppingWeek } from '../features/shopping/ShoppingWeek';
import { SuggestionRequestView } from '../features/suggestions/SuggestionRequestView';
import { SuggestionReview } from '../features/suggestions/SuggestionReview';
import { SuggestScreen } from '../features/suggestions/SuggestScreen';
import { WhoScreen } from '../features/who/WhoScreen';
import { useActingUser } from './acting-user';
import { BottomNav } from './BottomNav';
import { type DeviceMode, parseDeviceMode, useDeviceMode } from './device-mode';
import { IdleReturn } from './IdleReturn';
import { useAutoTheme } from './theme';
import { useWakeLock } from './wake-lock';

const WHO_PATH = '/who';
const DEVICE_PATH = '/device';
const DEV_PREFIX = '/dev/';
const DEVICE_PARAM = 'device';

/**
 * Аурората е фонът на всички екрани. `?device=` записва режима на устройството и
 * се маха от адреса. Без режим всичко води към „Какво е това устройство?“; в режим
 * `phone` без действащ потребител — към „Кой си?“. kiosk и TV нямат потребител и
 * държат екрана включен.
 */
function RootLayout() {
  useAutoTheme();
  const { mode } = useDeviceMode();
  useWakeLock(mode === 'kiosk' || mode === 'tv');
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
  if (mode === 'phone' && !hasActingUser) {
    return <Navigate to={WHO_PATH} replace />;
  }
  // Долната навигация е само на телефона; kiosk стига до календара и настройките
  // от дашборда, TV няма навигация (GLOSSARY: kiosk, TV).
  return (
    <>
      <Outlet />
      {mode === 'phone' && <BottomNav />}
      {mode === 'kiosk' && pathname !== '/' && <IdleReturn key={pathname} />}
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

// Регистър рецепти: телефон и таблет; не влиза в kiosk/TV навигацията.
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
});

const suggestionRequestRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/recipes/suggest/$requestId',
  component: SuggestionRequestView,
});

const suggestionReviewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/recipes/suggest/$requestId/$suggestionId',
  component: SuggestionReview,
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
  suggestRoute,
  suggestionRequestRoute,
  suggestionReviewRoute,
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
