import {
  type CreateIngredient,
  type Ingredient,
  ingredientConflictSchema,
  ingredientResponseSchema,
  ingredientsResponseSchema,
  type MealPlan,
  type PrepTimeRange,
  putRatingSchema,
  type Rating,
  type Recipe,
  type RecipeSummary,
  type RecipesSort,
  type ReplaceRecipeInput,
  recipeResponseSchema,
  recipesResponseSchema,
  type Tag,
} from '@family/shared';
import {
  keepPreviousData,
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { ApiError, apiFetch, JSON_HEADERS } from '../../api/client';
import { menuKeys } from '../menu/queries';

/** Филтрите на регистъра; празните не влизат в query-то. */
export interface RecipesParams {
  q?: string;
  tags?: readonly Tag[];
  times?: readonly PrepTimeRange[];
  includeArchived?: boolean;
  /** Без него — по заглавие. */
  sort?: RecipesSort;
}

export const recipeKeys = {
  all: ['recipes'] as const,
  lists: ['recipes', 'list'] as const,
  /** По query низа: еднаквите филтри (празни или пропуснати) дават едно query. */
  list: (search: string) => ['recipes', 'list', search] as const,
  detail: (id: string) => ['recipes', 'detail', id] as const,
  ingredientSearch: (q: string) => ['ingredients', 'search', q] as const,
};

function recipesSearch(params: RecipesParams): string {
  const search = new URLSearchParams();
  const q = params.q?.trim();
  if (q) {
    search.set('q', q);
  }
  for (const tag of params.tags ?? []) {
    search.append('tag', tag);
  }
  for (const time of params.times ?? []) {
    search.append('time', time);
  }
  if (params.includeArchived) {
    search.set('includeArchived', 'true');
  }
  if (params.sort && params.sort !== 'title') {
    search.set('sort', params.sort);
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

/** Записана рецепта: детайлът е тя, списъците се презареждат. */
export function storeRecipe(queryClient: QueryClient, recipe: Recipe): void {
  queryClient.setQueryData(recipeKeys.detail(recipe.id), recipe);
  void queryClient.invalidateQueries({ queryKey: recipeKeys.lists });
}

export function useRecipes(params: RecipesParams) {
  const search = recipesSearch(params);
  return useQuery({
    queryKey: recipeKeys.list(search),
    queryFn: () =>
      apiFetch(`/recipes${search}`, recipesResponseSchema).then(
        (body) => body.recipes,
      ),
    // Докато се пише в търсенето, старият списък остава на екрана.
    placeholderData: keepPreviousData,
  });
}

export function useRecipe(id: string) {
  return useQuery({
    queryKey: recipeKeys.detail(id),
    queryFn: () =>
      apiFetch(`/recipes/${id}`, recipeResponseSchema).then(
        (body) => body.recipe,
      ),
  });
}

/** Без `id` създава (`POST`), с `id` заменя (`PUT`) цялата рецепта. */
export function useSaveRecipe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: ReplaceRecipeInput }) =>
      apiFetch(id ? `/recipes/${id}` : '/recipes', recipeResponseSchema, {
        method: id ? 'PUT' : 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify(input),
      }).then((body) => body.recipe),
    onSuccess(recipe) {
      storeRecipe(queryClient, recipe);
    },
  });
}

/** `archived: true` архивира, `false` връща рецептата в регистъра. */
export function useArchiveRecipe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) =>
      apiFetch(
        `/recipes/${id}/${archived ? 'archive' : 'unarchive'}`,
        recipeResponseSchema,
        { method: 'POST' },
      ).then((body) => body.recipe),
    onSuccess(recipe) {
      storeRecipe(queryClient, recipe);
    },
  });
}

export interface RatingChange {
  id: string;
  /** `null` маха оценката. */
  rating: Rating | null;
}

/**
 * Оценка на рецепта (GLOSSARY: Оценка): `PUT` поставя, `DELETE` маха. Оптимистично в рецептата, в списъците и в
 * ястията на менюто с нея; при грешка всичко се връща, а накрая рецептите и менюто се презареждат.
 */
export function useRateRecipe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, rating }: RatingChange) =>
      apiFetch(
        `/recipes/${id}/rating`,
        recipeResponseSchema,
        rating === null
          ? { method: 'DELETE' }
          : {
              method: 'PUT',
              headers: JSON_HEADERS,
              body: JSON.stringify(putRatingSchema.parse({ rating })),
            },
      ).then((body) => body.recipe),
    async onMutate({ id, rating }) {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: recipeKeys.all }),
        queryClient.cancelQueries(menuKeys.plans),
      ]);
      const previous = [
        ...queryClient.getQueriesData({ queryKey: recipeKeys.all }),
        ...queryClient.getQueriesData(menuKeys.plans),
      ];
      queryClient.setQueryData<Recipe>(recipeKeys.detail(id), (recipe) =>
        recipe ? { ...recipe, rating } : recipe,
      );
      queryClient.setQueriesData<RecipeSummary[]>(
        { queryKey: recipeKeys.lists },
        (list) =>
          list?.map((recipe) =>
            recipe.id === id ? { ...recipe, rating } : recipe,
          ),
      );
      queryClient.setQueriesData<MealPlan | null>(menuKeys.plans, (plan) =>
        plan
          ? {
              ...plan,
              meals: plan.meals.map((meal) =>
                meal.recipeId === id && meal.recipe
                  ? { ...meal, recipe: { ...meal.recipe, rating } }
                  : meal,
              ),
            }
          : plan,
      );
      return { previous };
    },
    onError(_error, _change, context) {
      for (const [key, data] of context?.previous ?? []) {
        queryClient.setQueryData(key, data);
      }
    },
    onSuccess(recipe) {
      queryClient.setQueryData(recipeKeys.detail(recipe.id), recipe);
    },
    onSettled() {
      void queryClient.invalidateQueries({ queryKey: recipeKeys.lists });
      void queryClient.invalidateQueries(menuKeys.plans);
    },
  });
}

/** Търсене на продукти по `q` (без празни места отстрани); общо за autocomplete и за прегледа на предложение. */
export function ingredientSearchQuery(q: string) {
  const query = q.trim();
  return {
    queryKey: recipeKeys.ingredientSearch(query),
    queryFn: () =>
      apiFetch(
        `/ingredients?${new URLSearchParams({ q: query })}`,
        ingredientsResponseSchema,
      ).then((body) => body.ingredients),
  };
}

/** Autocomplete на продукти; празен `q` не пита. */
export function useIngredientSearch(q: string) {
  return useQuery({
    ...ingredientSearchQuery(q),
    enabled: q.trim().length > 0,
    placeholderData: keepPreviousData,
  });
}

/** Резултат от „Нов продукт“: създаден или вече съществуващ със същото канонично име (409). */
export type CreateIngredientResult =
  | { status: 'created'; ingredient: Ingredient }
  | { status: 'exists'; ingredient: Ingredient };

export function useCreateIngredient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: CreateIngredient,
    ): Promise<CreateIngredientResult> => {
      try {
        const body = await apiFetch('/ingredients', ingredientResponseSchema, {
          method: 'POST',
          headers: JSON_HEADERS,
          body: JSON.stringify(input),
        });
        return { status: 'created', ingredient: body.ingredient };
      } catch (error) {
        const conflict =
          error instanceof ApiError && error.status === 409
            ? ingredientConflictSchema.safeParse(error.body)
            : undefined;
        if (conflict?.success) {
          return { status: 'exists', ingredient: conflict.data.ingredient };
        }
        throw error;
      }
    },
    onSuccess() {
      void queryClient.invalidateQueries({ queryKey: ['ingredients'] });
    },
  });
}
