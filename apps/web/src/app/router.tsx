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
import {
  EditRecipeScreen,
  NewRecipeScreen,
} from '../features/recipes/RecipeEditor';
import { RecipeList } from '../features/recipes/RecipeList';
import { RecipeView } from '../features/recipes/RecipeView';
import { SuggestionRequestView } from '../features/suggestions/SuggestionRequestView';
import { SuggestionReview } from '../features/suggestions/SuggestionReview';
import { SuggestScreen } from '../features/suggestions/SuggestScreen';
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

const routeTree = rootRoute.addChildren([
  homeRoute,
  whoRoute,
  recipesRoute,
  newRecipeRoute,
  recipeRoute,
  editRecipeRoute,
  suggestRoute,
  suggestionRequestRoute,
  suggestionReviewRoute,
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
