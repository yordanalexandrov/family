import type { DashboardResponse } from '@family/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../api/client';
import { queryKeys } from '../../api/queries';
import { menuKeys } from '../menu/queries';

/** `POST` с 204 без тяло; клиентът иска schema, затова тялото се приема каквото е. */
function post(path: string) {
  return apiFetch(path, { parse: () => undefined }, { method: 'POST' });
}

/**
 * Действие от дашборда върху днешно ястие: при успех отговорът на дашборда се поправя веднага (`patch`), после
 * дашбордът и менюто се презареждат; при отказ (напр. 409 `cook_taken`) само се презареждат.
 */
function useMealAction(
  path: (mealId: string) => string,
  patch: (data: DashboardResponse, mealId: string) => DashboardResponse,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (mealId: string) => post(path(mealId)),
    onSuccess(_, mealId) {
      queryClient.setQueryData<DashboardResponse>(
        queryKeys.dashboard,
        (data) => (data ? patch(data, mealId) : data),
      );
    },
    onSettled() {
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
      void queryClient.invalidateQueries(menuKeys.plans);
    },
  });
}

/** „Аз“ (готвя днес): `POST /api/menu/meals/:id/cook-claim` с действащия потребител. */
export function useClaimCook(actingUserId: string | null) {
  return useMealAction(
    (mealId) => `/menu/meals/${mealId}/cook-claim`,
    (data, mealId) => {
      const dinner = data.cooking.dinner;
      return dinner?.mealId === mealId && actingUserId
        ? {
            ...data,
            cooking: {
              ...data.cooking,
              dinner: { ...dinner, cookUserId: actingUserId },
            },
          }
        : data;
    },
  );
}

/** „Извадих“: `POST /api/menu/meals/:id/thawed`. */
export function useMarkThawed() {
  return useMealAction(
    (mealId) => `/menu/meals/${mealId}/thawed`,
    (data, mealId) => ({
      ...data,
      thaw: data.thaw?.map((item) =>
        item.mealId === mealId && item.thawedAt === null
          ? { ...item, thawedAt: new Date().toISOString() }
          : item,
      ),
    }),
  );
}
