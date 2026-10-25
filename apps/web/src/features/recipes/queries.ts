import {
  type CreateIngredient,
  type Ingredient,
  ingredientConflictSchema,
  ingredientResponseSchema,
  ingredientsResponseSchema,
  type Recipe,
  type RecipeInput,
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

/** Филтрите на регистъра; празните не влизат в query-то. */
export interface RecipesParams {
  q?: string;
  tag?: Tag;
  includeArchived?: boolean;
}

export const recipeKeys = {
  all: ['recipes'] as const,
  lists: ['recipes', 'list'] as const,
  list: (params: RecipesParams) => ['recipes', 'list', params] as const,
  detail: (id: string) => ['recipes', 'detail', id] as const,
  ingredientSearch: (q: string) => ['ingredients', 'search', q] as const,
};

function recipesSearch(params: RecipesParams): string {
  const search = new URLSearchParams();
  const q = params.q?.trim();
  if (q) {
    search.set('q', q);
  }
  if (params.tag) {
    search.set('tag', params.tag);
  }
  if (params.includeArchived) {
    search.set('includeArchived', 'true');
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
  return useQuery({
    queryKey: recipeKeys.list(params),
    queryFn: () =>
      apiFetch(`/recipes${recipesSearch(params)}`, recipesResponseSchema).then(
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
    mutationFn: ({ id, input }: { id?: string; input: RecipeInput }) =>
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
