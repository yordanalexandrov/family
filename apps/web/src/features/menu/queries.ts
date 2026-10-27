import {
  type CreateMenuProposal,
  createMealPlanSchema,
  createMenuProposalSchema,
  type DateKey,
  type Meal,
  type MealPlan,
  mealPlanResponseSchema,
  mealResponseSchema,
  menuProposalResponseSchema,
  type NotEnoughRecipes,
  notEnoughRecipesSchema,
  type UpdateMeal,
  updateMealSchema,
} from '@family/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, apiFetch, JSON_HEADERS } from '../../api/client';
import { queryKeys } from '../../api/queries';
import { POLL_INTERVAL_MS } from '../../lib/ai-requests';

export const menuKeys = {
  all: ['menu'] as const,
  plan: (weekStart: DateKey) => ['menu', 'plan', weekStart] as const,
  proposal: (id: string) => ['menu', 'proposal', id] as const,
};

/** Планът на седмицата или `null`, ако няма (api връща 404). */
export function usePlan(weekStart: DateKey, enabled = true) {
  return useQuery({
    queryKey: menuKeys.plan(weekStart),
    queryFn: async (): Promise<MealPlan | null> => {
      try {
        const body = await apiFetch(
          `/menu/plans?${new URLSearchParams({ weekStart })}`,
          mealPlanResponseSchema,
        );
        return body.plan;
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) {
          return null;
        }
        throw error;
      }
    },
    enabled,
  });
}

/** „Започни празно“: 7 празни вечери. */
export function useCreatePlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (weekStart: DateKey) =>
      apiFetch('/menu/plans', mealPlanResponseSchema, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify(createMealPlanSchema.parse({ weekStart })),
      }).then((body) => body.plan),
    onSuccess(plan) {
      queryClient.setQueryData(menuKeys.plan(plan.weekStart), plan);
    },
  });
}

export function useDeletePlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (plan: MealPlan) => {
      await fetchNoContent(`/menu/plans/${plan.id}`);
      return plan;
    },
    onSuccess(plan) {
      queryClient.setQueryData(menuKeys.plan(plan.weekStart), null);
    },
  });
}

/** `DELETE` отговаря с 204 без тяло; клиентът иска schema, затова тялото се приема каквото е. */
function fetchNoContent(path: string) {
  return apiFetch(path, { parse: () => undefined }, { method: 'DELETE' });
}

/**
 * Една промяна на ястие (рецепта, бележка, готвач или порции) е един `PATCH`; ястието се подменя в плана, а
 * „Днес се готви“ на дашборда се презарежда.
 */
export function useUpdateMeal(weekStart: DateKey) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateMeal }) =>
      apiFetch(`/menu/meals/${id}`, mealResponseSchema, {
        method: 'PATCH',
        headers: JSON_HEADERS,
        body: JSON.stringify(updateMealSchema.parse(patch)),
      }).then((body) => body.meal),
    onSuccess(meal: Meal) {
      queryClient.setQueryData<MealPlan | null>(
        menuKeys.plan(weekStart),
        (plan) =>
          plan && {
            ...plan,
            meals: plan.meals.map((m) => (m.id === meal.id ? meal : m)),
          },
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
    },
  });
}

/** „Предложи меню“ → `202` с `pending`; работата тече във фона на api. */
export function useProposeMenu() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateMenuProposal) =>
      apiFetch('/menu/proposals', menuProposalResponseSchema, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify(createMenuProposalSchema.parse(input)),
      }).then((body) => body.proposal),
    onSuccess(proposal) {
      queryClient.setQueryData(menuKeys.proposal(proposal.id), proposal);
    },
  });
}

/** Предложението; пита отново на 3 s, докато е `pending`. При `done` презарежда плана на седмицата и дашборда. */
export function useMenuProposal(id: string | undefined) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: menuKeys.proposal(id ?? ''),
    queryFn: async () => {
      const { proposal } = await apiFetch(
        `/menu/proposals/${id}`,
        menuProposalResponseSchema,
      );
      if (proposal.status === 'done') {
        await queryClient.invalidateQueries({
          queryKey: menuKeys.plan(proposal.weekStart),
        });
        // Предложение за тази седмица сменя и днешната вечеря.
        void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
      }
      return proposal;
    },
    enabled: id !== undefined,
    refetchInterval: (query) =>
      query.state.data?.status === 'pending' ? POLL_INTERVAL_MS : false,
  });
}

/** 409 `not_enough_recipes`: колко вечерни рецепти има и колко трябват. */
export function notEnoughRecipes(error: unknown): NotEnoughRecipes | null {
  if (!(error instanceof ApiError) || error.status !== 409) {
    return null;
  }
  const body = notEnoughRecipesSchema.safeParse(error.body);
  return body.success ? body.data : null;
}
