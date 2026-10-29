import type { Appliance } from '@family/shared';
import { HttpResponse, http } from 'msw';
import { seedAppliances } from './fixtures/appliances';
import { server } from './msw';

export { seedAppliances };

export interface AppliancesApi {
  /** Текущите уреди на „сървъра“. */
  appliances: Appliance[];
  /** Заявките, които са променили нещо, по реда си. */
  requests: { method: string; path: string; body?: unknown }[];
}

/** `/api/appliances` в паметта: четене, превключване, добавяне и махане. */
export function serveAppliances(
  initial: Appliance[] = seedAppliances,
): AppliancesApi {
  const api: AppliancesApi = {
    appliances: structuredClone(initial),
    requests: [],
  };
  let next = 1;
  server.use(
    http.get('/api/appliances', () =>
      HttpResponse.json({ appliances: api.appliances }),
    ),
    http.post('/api/appliances', async ({ request }) => {
      const body = (await request.json()) as {
        name: string;
        enabled?: boolean;
      };
      api.requests.push({ method: 'POST', path: '/api/appliances', body });
      const appliance: Appliance = {
        id: `b0000000-0000-4000-8000-${String(next++).padStart(12, '0')}`,
        name: body.name.trim(),
        enabled: body.enabled ?? true,
      };
      api.appliances.push(appliance);
      return HttpResponse.json({ appliance }, { status: 201 });
    }),
    http.put('/api/appliances/:id', async ({ request, params }) => {
      const body = (await request.json()) as { enabled: boolean };
      const path = `/api/appliances/${params.id}`;
      api.requests.push({ method: 'PUT', path, body });
      const appliance = api.appliances.find((a) => a.id === params.id);
      if (!appliance) {
        return HttpResponse.json(
          { error: 'not_found', message: 'Няма такъв уред' },
          { status: 404 },
        );
      }
      appliance.enabled = body.enabled;
      return HttpResponse.json({ appliance });
    }),
    http.delete('/api/appliances/:id', ({ params }) => {
      api.requests.push({
        method: 'DELETE',
        path: `/api/appliances/${params.id}`,
      });
      api.appliances = api.appliances.filter((a) => a.id !== params.id);
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return api;
}
