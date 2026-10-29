import {
  type Appliance,
  applianceResponseSchema,
  appliancesResponseSchema,
} from '@family/shared';
import {
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { apiFetch, JSON_HEADERS } from '../../api/client';

export const applianceKeys = {
  all: ['appliances'] as const,
};

/** Уредите на домакинството (GLOSSARY: Уред) по реда на добавяне. */
export function useAppliances() {
  return useQuery({
    queryKey: applianceKeys.all,
    queryFn: () =>
      apiFetch('/appliances', appliancesResponseSchema).then(
        (body) => body.appliances,
      ),
  });
}

/** Кратко име за реда „Уреди: …“: видът без модела и възможностите („мултикукър (Ninja …) — …“ → „мултикукър“). */
export function applianceShortName(name: string): string {
  return name.split(/ \(| — /)[0]?.trim() || name;
}

/**
 * Оптимистичната част на промяна в списъка: `change` се вижда веднага, при грешка се връща предишният списък, а
 * накрая списъкът се чете наново.
 */
function optimisticList<TInput>(
  queryClient: QueryClient,
  change: (current: Appliance[], input: TInput) => Appliance[],
) {
  return {
    onMutate: async (input: TInput) => {
      await queryClient.cancelQueries({ queryKey: applianceKeys.all });
      const previous = queryClient.getQueryData<Appliance[]>(applianceKeys.all);
      queryClient.setQueryData<Appliance[]>(
        applianceKeys.all,
        (current) => current && change(current, input),
      );
      return { previous };
    },
    onError: (
      _error: unknown,
      _input: TInput,
      context: { previous: Appliance[] | undefined } | undefined,
    ) => {
      queryClient.setQueryData(applianceKeys.all, context?.previous);
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: applianceKeys.all }),
  };
}

/** Включване или изключване: оптимистично, с връщане при грешка. */
export function useSwitchAppliance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      apiFetch(`/appliances/${id}`, applianceResponseSchema, {
        method: 'PUT',
        headers: JSON_HEADERS,
        body: JSON.stringify({ enabled }),
      }).then((body) => body.appliance),
    ...optimisticList(
      queryClient,
      (current, { id, enabled }: { id: string; enabled: boolean }) =>
        current.map((a) => (a.id === id ? { ...a, enabled } : a)),
    ),
  });
}

/** „Добави уред“, а и „Върни“ след махане (същото име и състояние, нов запис). */
export function useAddAppliance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; enabled?: boolean }) =>
      apiFetch('/appliances', applianceResponseSchema, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify(input),
      }).then((body) => body.appliance),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: applianceKeys.all }),
  });
}

/** Махане: уредът изчезва веднага, при грешка се връща. */
export function useRemoveAppliance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (appliance: Appliance) =>
      apiFetch(
        `/appliances/${appliance.id}`,
        { parse: () => undefined },
        { method: 'DELETE' },
      ),
    ...optimisticList(queryClient, (current, appliance: Appliance) =>
      current.filter((a) => a.id !== appliance.id),
    ),
  });
}
