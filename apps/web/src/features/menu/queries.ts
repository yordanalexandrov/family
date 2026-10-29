import {
  type CreateMenuProposal,
  createMealCommentSchema,
  createMealPlanSchema,
  createMenuProposalSchema,
  type DateKey,
  type Meal,
  type MealComment,
  type MealPlan,
  type MenuProposalRequest,
  mealCommentResponseSchema,
  mealCommentsResponseSchema,
  mealPlanResponseSchema,
  mealResponseSchema,
  menuProposalResponseSchema,
  putVoteSchema,
  swapMealsSchema,
  type UpdateMeal,
  updateMealSchema,
  type VoteValue,
} from '@family/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { ApiError, apiFetch, JSON_HEADERS, refusalOf } from '../../api/client';
import { queryKeys } from '../../api/queries';
import { POLL_INTERVAL_MS } from '../../lib/ai-requests';

export const menuKeys = {
  all: ['menu'] as const,
  plan: (weekStart: DateKey) => ['menu', 'plan', weekStart] as const,
  /** Под плана на седмицата, за да го стигне и сигналът `menu.changed`. */
  thread: (weekStart: DateKey, mealId: string) =>
    ['menu', 'plan', weekStart, 'thread', mealId] as const,
  proposal: (id: string) => ['menu', 'proposal', id] as const,
  /** Последното предложение на седмицата (напр. на крона в сряда); не е под плана, който то презарежда. */
  weekProposal: (weekStart: DateKey) =>
    ['menu', 'week-proposal', weekStart] as const,
  /** Филтър за плановете на всички седмици, без разговорите под тях, които делят префикса на ключа. */
  plans: {
    queryKey: ['menu', 'plan'] as const,
    predicate: (query: { queryKey: readonly unknown[] }) =>
      query.queryKey.length === 3,
  },
};

/** Планът на седмицата или `null`, ако няма (api връща 404 `no_plan`). */
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
        if (refusalOf(error, 'no_plan')) {
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
      setMeal(queryClient, weekStart, meal);
      // Нова рецепта или бележка добавя системен ред в разговора.
      void queryClient.invalidateQueries({
        queryKey: menuKeys.thread(weekStart, meal.id),
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
    },
  });
}

/**
 * „Върни“ след „Махни ястието от деня“: api-то връща рецептата, „защо“-то и гласовете, които махането е взело, а редът
 * за махането изчезва от разговора. Без тяло: какво се връща пази сървърът.
 */
export function useRestoreMeal(weekStart: DateKey) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/menu/meals/${id}/restore`, mealResponseSchema, {
        method: 'POST',
      }).then((body) => body.meal),
    onSuccess(meal: Meal) {
      setMeal(queryClient, weekStart, meal);
      void queryClient.invalidateQueries({
        queryKey: menuKeys.thread(weekStart, meal.id),
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
    },
  });
}

/** Подменя ястието в кеширания план на седмицата. */
function setMeal(
  queryClient: ReturnType<typeof useQueryClient>,
  weekStart: DateKey,
  meal: Meal,
) {
  queryClient.setQueryData<MealPlan | null>(
    menuKeys.plan(weekStart),
    (plan) =>
      plan && {
        ...plan,
        meals: plan.meals.map((m) => (m.id === meal.id ? meal : m)),
      },
  );
}

export interface VoteChange {
  meal: Meal;
  /** Действащият потребител, чийто глас се сменя. */
  userId: string;
  /** `null` маха гласа (втори натиск на същия). */
  value: VoteValue | null;
}

/**
 * Глас за ястие (GLOSSARY: Глас): `PUT` поставя, `DELETE` маха. Оптимистично: редът се сменя веднага, а при грешка
 * се връща както е бил.
 */
export function useVote(weekStart: DateKey) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ meal, value }: VoteChange) =>
      apiFetch(
        `/menu/meals/${meal.id}/vote`,
        mealResponseSchema,
        value === null
          ? { method: 'DELETE' }
          : {
              method: 'PUT',
              headers: JSON_HEADERS,
              body: JSON.stringify(putVoteSchema.parse({ value })),
            },
      ).then((body) => body.meal),
    async onMutate({ meal, userId, value }) {
      await queryClient.cancelQueries({ queryKey: menuKeys.plan(weekStart) });
      const others = meal.votes.filter((vote) => vote.userId !== userId);
      setMeal(queryClient, weekStart, {
        ...meal,
        votes: value === null ? others : [...others, { userId, value }],
      });
      return { previous: meal };
    },
    onError(_error, _change, context) {
      if (context) {
        setMeal(queryClient, weekStart, context.previous);
      }
    },
    onSuccess(meal) {
      setMeal(queryClient, weekStart, meal);
    },
  });
}

/** `meal` и `withMeal` разменят дните си (без да се местят гласовете и разговорът им); планът остава подреден по ден. */
export function swapDates(
  plan: MealPlan,
  meal: Meal,
  withMeal: Meal,
): MealPlan {
  return {
    ...plan,
    meals: plan.meals
      .map((m) =>
        m.id === meal.id
          ? { ...m, date: withMeal.date }
          : m.id === withMeal.id
            ? { ...m, date: meal.date }
            : m,
      )
      .sort(
        (a, b) => a.date.localeCompare(b.date) || a.slot.localeCompare(b.slot),
      ),
  };
}

export interface MealSwap {
  meal: Meal;
  withMeal: Meal;
}

/**
 * Размяна на дните на две ястия („Размени с…“ и влачене). Оптимистично: редовете се разменят веднага, а при грешка
 * планът се връща както е бил. Отговорът е целият план; разговорите получават системен ред, затова се презареждат.
 */
export function useSwapMeals(weekStart: DateKey) {
  const queryClient = useQueryClient();
  const key = menuKeys.plan(weekStart);
  return useMutation({
    mutationFn: ({ meal, withMeal }: MealSwap) =>
      apiFetch(`/menu/meals/${meal.id}/swap`, mealPlanResponseSchema, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify(
          swapMealsSchema.parse({ withMealId: withMeal.id }),
        ),
      }).then((body) => body.plan),
    async onMutate({ meal, withMeal }) {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<MealPlan | null>(key);
      if (previous) {
        queryClient.setQueryData(key, swapDates(previous, meal, withMeal));
      }
      return { previous };
    },
    onError(_error, _swap, context) {
      if (context?.previous) {
        queryClient.setQueryData(key, context.previous);
      }
    },
    onSuccess(plan) {
      queryClient.setQueryData(key, plan);
      void queryClient.invalidateQueries({
        queryKey: [...key, 'thread'],
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
    },
  });
}

/** Разговорът на ястието (GLOSSARY: Разговор) по реда на писане. */
export function useThread(weekStart: DateKey, mealId: string) {
  return useQuery({
    queryKey: menuKeys.thread(weekStart, mealId),
    queryFn: () =>
      apiFetch(
        `/menu/meals/${mealId}/comments`,
        mealCommentsResponseSchema,
      ).then((body) => body.comments),
  });
}

/**
 * Коментар или триене на свой коментар: разговорът се допълва веднага от отговора, а планът се презарежда заради
 * последния ред и брояча на реда.
 */
export function useAddComment(weekStart: DateKey, mealId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: string) =>
      apiFetch(`/menu/meals/${mealId}/comments`, mealCommentResponseSchema, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify(createMealCommentSchema.parse({ body })),
      }).then((response) => response.comment),
    onSuccess(comment) {
      queryClient.setQueryData<MealComment[]>(
        menuKeys.thread(weekStart, mealId),
        (lines) => [...(lines ?? []), comment],
      );
      void queryClient.invalidateQueries({
        queryKey: menuKeys.plan(weekStart),
      });
    },
  });
}

export function useDeleteComment(weekStart: DateKey, mealId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await fetchNoContent(`/menu/comments/${id}`);
      return id;
    },
    onSuccess(id) {
      queryClient.setQueryData<MealComment[]>(
        menuKeys.thread(weekStart, mealId),
        (lines) => lines?.filter((line) => line.id !== id),
      );
      void queryClient.invalidateQueries({
        queryKey: menuKeys.plan(weekStart),
      });
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
    // 409 без под-код: другият вече е поискал меню или планът е готов. Седмицата се чете пак и показва тях.
    onError(error, { weekStart }) {
      if (
        error instanceof ApiError &&
        error.code === 'conflict' &&
        !refusalOf(error, 'not_enough_recipes')
      ) {
        void queryClient.invalidateQueries({
          queryKey: menuKeys.weekProposal(weekStart),
        });
        void queryClient.invalidateQueries({
          queryKey: menuKeys.plan(weekStart),
          exact: true,
        });
      }
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

/** `GET /api/menu/proposals?weekStart=`: последното предложение на седмицата или `null` (404 `no_proposal`). */
export function weekProposalQuery(weekStart: DateKey) {
  return {
    queryKey: menuKeys.weekProposal(weekStart),
    queryFn: async (): Promise<MenuProposalRequest | null> => {
      try {
        const { proposal } = await apiFetch(
          `/menu/proposals?${new URLSearchParams({ weekStart })}`,
          menuProposalResponseSchema,
        );
        return proposal;
      } catch (error) {
        if (refusalOf(error, 'no_proposal')) {
          return null;
        }
        throw error;
      }
    },
  };
}

/**
 * Последното предложение на седмицата или `null` (api връща 404 `no_proposal`); пита отново на 3 s, докато е `pending`, а при
 * `done` презарежда плана. Така седмица без план вижда и предложението на крона, което никой не е пуснал от екрана.
 */
export function useWeekProposal(weekStart: DateKey, enabled: boolean) {
  const queryClient = useQueryClient();
  const query = useQuery({
    ...weekProposalQuery(weekStart),
    enabled,
    refetchInterval: (query) =>
      query.state.data?.status === 'pending' ? POLL_INTERVAL_MS : false,
  });
  // Веднъж на предложение: следващите четения на същото `done` не презареждат плана пак.
  const doneId = query.data?.status === 'done' ? query.data.id : undefined;
  const donePlanId = query.data?.planId;
  useEffect(() => {
    // Планът, който вече е тук, не се чете пак (седмица с план също чете предложението си).
    const cached = queryClient.getQueryData<MealPlan | null>(
      menuKeys.plan(weekStart),
    );
    if (doneId !== undefined && cached?.id !== donePlanId) {
      void queryClient.invalidateQueries({
        queryKey: menuKeys.plan(weekStart),
        exact: true,
      });
    }
  }, [doneId, donePlanId, weekStart, queryClient]);
  return query;
}
