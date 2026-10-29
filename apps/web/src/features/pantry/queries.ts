import {
  type CreatePantryItem,
  createPantryItemSchema,
  type Ingredient,
  type PantryItem,
  type PantryKind,
  pantryItemResponseSchema,
  pantryResponseSchema,
  type UpdatePantryItem,
  updatePantryItemSchema,
} from '@family/shared';
import {
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { apiFetch, JSON_HEADERS } from '../../api/client';
import { shoppingKeys } from '../shopping/queries';

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

/** `POST /api/pantry`: нов продукт в килера. */
function postPantryItem(body: CreatePantryItem) {
  return apiFetch('/pantry', pantryItemResponseSchema, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(createPantryItemSchema.parse(body)),
  });
}

/** `PATCH /api/pantry/:id`: видът, бележката или „Във фризера“. */
function patchPantryItem(id: string, changes: UpdatePantryItem) {
  return apiFetch(`/pantry/${id}`, pantryItemResponseSchema, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify(updatePantryItemSchema.parse(changes)),
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
  /** „Във фризера“ (GLOSSARY: Във фризера) за целия избор. */
  frozen: boolean;
}

/**
 * „Добави“: един `POST /api/pantry` на продукт, всички с един вид, една бележка и една отметка „Във фризера“. Оптимистично: продуктите са в
 * килера веднага; ако някой `POST` не мине, килерът се връща и се чете наново, а грешката е на първия неуспешен.
 */
export function useAddPantryItems() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ ingredients, kind, note, frozen }: AddPantryItems) => {
      const results = await Promise.allSettled(
        ingredients.map((ingredient) =>
          postPantryItem({
            ingredientId: ingredient.id,
            kind,
            ...(note.trim() ? { note } : {}),
            frozen,
          }),
        ),
      );
      const failed = results.find((result) => result.status === 'rejected');
      if (failed) {
        throw failed.reason;
      }
    },
    onMutate: ({ ingredients, kind, note, frozen }) => {
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
          frozen,
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
      patchPantryItem(item.id, { kind }),
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

/** „Във фризера“ включено или изключено (`PATCH /api/pantry/:id`); видът и бележката остават. */
export function useSetPantryFrozen() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ item, frozen }: { item: PantryItem; frozen: boolean }) =>
      patchPantryItem(item.id, { frozen }),
    onMutate: ({ item, frozen }) =>
      applyOptimistic(queryClient, (items) =>
        items.map((other) =>
          other.id === item.id ? { ...other, frozen } : other,
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
        // `keepalive`: заявката стига до api-то и когато страницата се затваря (#209).
        { method: 'DELETE', keepalive: true },
      ),
    onMutate: (item) =>
      applyOptimistic(queryClient, (items) =>
        items.filter((other) => other.id !== item.id),
      ),
    ...rollbackAndRefresh(queryClient),
  });
}

/** Промяна на килера от списъка за пазаруване: после се четат наново и килерът, и всеки списък. */
function useChangeFromShopping<T>(change: (input: T) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: change,
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: pantryKeys.all }),
        queryClient.invalidateQueries({ queryKey: shoppingKeys.all }),
      ]),
  });
}

/** „Свърши“ (`POST /api/pantry/:id/ran-out`): постоянният продукт е във всеки списък, докато не се купи. */
export function useMarkRanOut() {
  return useChangeFromShopping((pantryId: string) =>
    apiFetch(`/pantry/${pantryId}/ran-out`, pantryItemResponseSchema, {
      method: 'POST',
    }),
  );
}

/**
 * „Имаме го винаги“: продуктът става постоянен — нов в килера (`POST /api/pantry`) или временен, който се сменя
 * (`PATCH /api/pantry/:id`).
 */
export function useMakeStaple() {
  return useChangeFromShopping(
    (target: { ingredientId: string } | { pantryId: string }) =>
      'pantryId' in target
        ? patchPantryItem(target.pantryId, { kind: 'staple' })
        : postPantryItem({
            ingredientId: target.ingredientId,
            kind: 'staple',
            frozen: false,
          }),
  );
}
