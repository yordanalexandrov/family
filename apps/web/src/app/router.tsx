import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Navigate,
  Outlet,
  type RouterHistory,
  useLocation,
} from '@tanstack/react-router';
import { HomeScreen } from '../features/home/HomeScreen';
import { WhoScreen } from '../features/who/WhoScreen';
import { useActingUser } from './acting-user';

const WHO_PATH = '/who';

/** Без избран действащ потребител всичко освен „Кой си?“ води към „Кой си?“. */
function RootLayout() {
  const { actingUserId } = useActingUser();
  const pathname = useLocation({ select: (location) => location.pathname });

  if (actingUserId === null && pathname !== WHO_PATH) {
    return <Navigate to={WHO_PATH} replace />;
  }
  return <Outlet />;
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

const routeTree = rootRoute.addChildren([homeRoute, whoRoute]);

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
