import {
  createPantryItemSchema,
  type Ingredient,
  type PantryItem,
  type PantryKind,
  pantryItemResponseSchema,
  pantryResponseSchema,
  updatePantryItemSchema,
} from '@family/shared';
import {
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { apiFetch, JSON_HEADERS } from '../../api/client';

export const pantryKeys = {
  all: ['pantry'] as const,
};

/** Килерът (GLOSSARY: Килер), както го пази api-то. */
export function usePantry() {
  return useQuery({
    queryKey: pantryKeys.all,
    queryFn: () =>
      apiFetch('/pantry', pantryResponseSchema).then((body) => body.items),
  });
}

type Snapshot = { previous: PantryItem[] | undefined };

/** Оптимистична промяна: спира четенето, прилага `change` и връща предишния килер за връщане при грешка. */
async function applyOptimistic(
  queryClient: QueryClient,
  change: (items: PantryItem[]) => PantryItem[],
): Promise<Snapshot> {
  await queryClient.cancelQueries({ queryKey: pantryKeys.all });
  const previous = queryClient.getQueryData<PantryItem[]>(pantryKeys.all);
  if (previous) {
    queryClient.setQueryData(pantryKeys.all, change(previous));
  }
  return { previous };
}

/** Общото на мутациите: при грешка килерът се връща, после винаги се чете наново. */
function rollbackAndRefresh(queryClient: QueryClient) {
  return {
    onError(_error: unknown, _input: unknown, context: Snapshot | undefined) {
      if (context?.previous) {
        queryClient.setQueryData(pantryKeys.all, context.previous);
      }
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: pantryKeys.all }),
  };
}

export interface AddPantryItems {
  ingredients: Ingredient[];
  kind: PantryKind;
  note: string;
}

/**
 * „Добави“: един `POST /api/pantry` на продукт, всички с един вид и една бележка. Оптимистично: продуктите са в
 * килера веднага; ако някой `POST` не мине, килерът се връща и се чете наново, а грешката е на първия неуспешен.
 */
export function useAddPantryItems() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ ingredients, kind, note }: AddPantryItems) => {
      const results = await Promise.allSettled(
        ingredients.map((ingredient) =>
          apiFetch('/pantry', pantryItemResponseSchema, {
            method: 'POST',
            headers: JSON_HEADERS,
            body: JSON.stringify(
              createPantryItemSchema.parse({
                ingredientId: ingredient.id,
                kind,
                ...(note.trim() ? { note } : {}),
              }),
            ),
          }),
        ),
      );
      const failed = results.find((result) => result.status === 'rejected');
      if (failed) {
        throw failed.reason;
      }
    },
    onMutate: ({ ingredients, kind, note }) => {
      const createdAt = new Date().toISOString();
      return applyOptimistic(queryClient, (items) => [
        ...items,
        ...ingredients.map((ingredient) => ({
          id: `pending:${ingredient.id}`,
          ingredient: {
            id: ingredient.id,
            name: ingredient.name,
            aisle: ingredient.aisle,
          },
          kind,
          note: note.trim() || null,
          ranOutAt: null,
          createdAt,
        })),
      ]);
    },
    ...rollbackAndRefresh(queryClient),
  });
}

/** Постоянен ↔ временен (`PATCH /api/pantry/:id`); временен продукт не е „свършил“. */
export function useSetPantryKind() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ item, kind }: { item: PantryItem; kind: PantryKind }) =>
      apiFetch(`/pantry/${item.id}`, pantryItemResponseSchema, {
        method: 'PATCH',
        headers: JSON_HEADERS,
        body: JSON.stringify(updatePantryItemSchema.parse({ kind })),
      }),
    onMutate: ({ item, kind }) =>
      applyOptimistic(queryClient, (items) =>
        items.map((other) =>
          other.id === item.id
            ? {
                ...other,
                kind,
                ranOutAt: kind === 'use_up' ? null : other.ranOutAt,
              }
            : other,
        ),
      ),
    ...rollbackAndRefresh(queryClient),
  });
}

/** „Използвано“ или махане на постоянен продукт (`DELETE /api/pantry/:id`, 204 без тяло). */
export function useRemovePantryItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (item: PantryItem) =>
      apiFetch(
        `/pantry/${item.id}`,
        { parse: () => undefined },
        { method: 'DELETE' },
      ),
    onMutate: (item) =>
      applyOptimistic(queryClient, (items) =>
        items.filter((other) => other.id !== item.id),
      ),
    ...rollbackAndRefresh(queryClient),
  });
}
