import {
  type Preparation,
  type RecipeRevisionRequest,
  type RecipeStep,
  type RevisableRecipe,
  type RevisionLine,
  recipeRevisionResponseSchema,
} from '@family/shared';
import {
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { apiFetch, JSON_HEADERS, refusalOf } from '../../api/client';
import { POLL_INTERVAL_MS, requestErrorFor } from '../../lib/ai-requests';
import { recipeKeys } from './queries';
import {
  emptyIngredientRow,
  type IngredientRowValues,
} from './recipe-form-values';

const revisionKey = (id: string) => ['recipes', 'revision', id] as const;

/**
 * Какво поправя „✏️ Поправи с AI“: записана рецепта от регистъра, или предложение с рецептата от формата за преглед
 * (тя не е записана).
 */
export type RevisionTarget =
  | { recipeId: string }
  | { suggestionId: string; recipe: RevisableRecipe };

/** Ред в сравнението: продукт от регистъра или нов (несвързан), по име. */
export interface ComparedLine {
  ingredient?: { name: string } | undefined;
  newProduct?: { name: string } | undefined;
  quantity: RevisionLine['quantity'];
  unit: RevisionLine['unit'];
  note?: string | undefined;
}

/** Рецептата, която AI поправя, както я показва колоната „Сега“ в сравнението. */
export interface RevisionBase {
  servings: number;
  prepMinutes?: number | undefined;
  ingredients: readonly ComparedLine[];
  steps: readonly RecipeStep[];
  preparation: Preparation;
}

/** Рецептата от формата за преглед като колоната „Сега“; `linked` казва кои редове са свързани (`toRevisableRecipe`). */
export function revisionBaseOf(
  recipe: RevisableRecipe,
  linked: readonly boolean[],
): RevisionBase {
  return {
    servings: recipe.servings,
    prepMinutes: recipe.prepMinutes ?? undefined,
    ingredients: recipe.ingredients.map(({ name, ...line }, index) => ({
      ...line,
      ...(linked[index] ? { ingredient: { name } } : { newProduct: { name } }),
    })),
    steps: recipe.steps,
    preparation: recipe.preparation,
  };
}

/** „Поправка чака преглед“ в регистъра и в изгледа се сменя: рецептите се презареждат, поправките не. */
function refreshOpenRevision(queryClient: QueryClient) {
  void queryClient.invalidateQueries({
    queryKey: recipeKeys.all,
    predicate: (query) => query.queryKey[1] !== 'revision',
  });
}

/** Какво пуска поправка: указанието и, за рецепта, приложените промени за готвенето (`applied`). */
interface RevisionAsk {
  target: RevisionTarget;
  instruction: string;
  applied?: readonly string[];
}

function postRevision({ target, instruction, applied = [] }: RevisionAsk) {
  return apiFetch(
    'suggestionId' in target
      ? `/recipe-suggestions/${target.suggestionId}/revisions`
      : `/recipes/${target.recipeId}/revisions`,
    recipeRevisionResponseSchema,
    {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify(
        'suggestionId' in target
          ? { instruction, recipe: target.recipe }
          : { instruction, ...(applied.length > 0 ? { applied } : {}) },
      ),
    },
  ).then((body) => body.request);
}

/**
 * Пуска; ако api не знае някой от `applied` (напр. от друга база), пуска още веднъж без тях: всеки опит праща
 * по-малко, затова опитите свършват.
 */
async function postKnown(ask: RevisionAsk): Promise<RecipeRevisionRequest> {
  try {
    return await postRevision(ask);
  } catch (error) {
    const unknown = refusalOf(error, 'no_applied_change')?.ids;
    const known = ask.applied?.filter((id) => !unknown?.includes(id)) ?? [];
    if (unknown && known.length < (ask.applied?.length ?? 0)) {
      return postKnown({ ...ask, applied: known });
    }
    throw error;
  }
}

/**
 * „Изпрати“ в „✏️ Поправи с AI“ и в „Как мина?“ → `202` с `pending`; агентът работи във фона на api. `applied` са
 * въпросите с приложени промени от последното готвене, които поправката да вземе предвид.
 */
export function useRequestRevision() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ask: RevisionAsk) =>
      postKnown(ask).catch((error: unknown) => {
        throw requestErrorFor(error);
      }),
    onSuccess(request) {
      // Веднага пита отново: заявката може вече да е свършила.
      void queryClient.invalidateQueries({ queryKey: revisionKey(request.id) });
      refreshOpenRevision(queryClient);
    },
  });
}

/** Поправката с `id`; пита отново на 3 s, докато е `pending`. Без `id` не пита. */
export function useRevision(id: string | undefined) {
  return useQuery({
    queryKey: revisionKey(id ?? ''),
    queryFn: (): Promise<RecipeRevisionRequest> =>
      apiFetch(`/recipes/revisions/${id}`, recipeRevisionResponseSchema).then(
        (body) => body.request,
      ),
    enabled: id !== undefined,
    refetchInterval: (query) =>
      query.state.data?.status === 'pending' ? POLL_INTERVAL_MS : false,
  });
}

/** „Отхвърли“: поправката е решена и не чака повече. */
export function useRejectRevision() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(
        `/recipes/revisions/${id}/reject`,
        recipeRevisionResponseSchema,
        { method: 'POST' },
      ).then((body) => body.request),
    onSuccess(request) {
      queryClient.setQueryData(revisionKey(request.id), request);
      refreshOpenRevision(queryClient);
    },
  });
}

/**
 * Продуктите на поправката като редове на формата: свързаните с продукта си, а предложеният нов продукт неразрешен, с
 * името си и попълнена форма „Нов продукт“, както при внасяне.
 */
export function revisionToIngredientRows(
  lines: readonly RevisionLine[],
): IngredientRowValues[] {
  return lines.map((line) =>
    emptyIngredientRow({
      ingredient: line.ingredient ?? null,
      query: line.ingredient?.name ?? line.newProduct?.name ?? '',
      quantity: line.quantity === null ? '' : String(line.quantity),
      unit: line.unit,
      ...(line.note === undefined ? {} : { note: line.note }),
      ...(line.newProduct ? { isNew: true, newProduct: line.newProduct } : {}),
    }),
  );
}
