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
} from '@tanstack/react-router';
import { Aurora } from '../components/Aurora';
import { HomeScreen } from '../features/home/HomeScreen';
import { WhoScreen } from '../features/who/WhoScreen';
import { useActingUser } from './acting-user';

const WHO_PATH = '/who';
const DEV_PREFIX = '/dev/';

/**
 * Аурората е фонът на всички екрани. Без избран действащ потребител всичко освен
 * „Кой си?“ (и dev страниците) води към „Кой си?“.
 */
function RootLayout() {
  const { actingUserId } = useActingUser();
  const pathname = useLocation({ select: (location) => location.pathname });

  const needsActingUser =
    pathname !== WHO_PATH &&
    !(import.meta.env.DEV && pathname.startsWith(DEV_PREFIX));
  return (
    <>
      <Aurora />
      {actingUserId === null && needsActingUser ? (
        <Navigate to={WHO_PATH} replace />
      ) : (
        <Outlet />
      )}
    </>
  );
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

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: HomeScreen,
});

const whoRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: WHO_PATH,
  component: WhoScreen,
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

const routeTree = rootRoute.addChildren([homeRoute, whoRoute, ...devRoutes]);

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
