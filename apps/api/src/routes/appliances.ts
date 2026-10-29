import {
  applianceExistsSchema,
  applianceResponseSchema,
  appliancesResponseSchema,
  createApplianceSchema,
  updateApplianceSchema,
} from '@family/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  addAppliance,
  getAppliances,
  removeAppliance,
  switchAppliance,
} from '../services/appliances.js';
import { idParamsSchema } from './params.js';

/** The household's appliances (GLOSSARY: Уред), changed from „Настройки“. */
export const appliancesRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/api/appliances',
    { schema: { response: { 200: appliancesResponseSchema } } },
    async () => ({ appliances: await getAppliances(app.db) }),
  );

  app.post(
    '/api/appliances',
    {
      schema: {
        body: createApplianceSchema,
        response: { 201: applianceResponseSchema, 409: applianceExistsSchema },
      },
    },
    async (request, reply) => {
      const appliance = await addAppliance(app.db, request.body);
      return reply.code(201).send({ appliance });
    },
  );

  app.put(
    '/api/appliances/:id',
    {
      schema: {
        params: idParamsSchema,
        body: updateApplianceSchema,
        response: { 200: applianceResponseSchema },
      },
    },
    async (request) => ({
      appliance: await switchAppliance(
        app.db,
        request.params.id,
        request.body.enabled,
      ),
    }),
  );

  app.delete(
    '/api/appliances/:id',
    { schema: { params: idParamsSchema } },
    async (request, reply) => {
      await removeAppliance(app.db, request.params.id);
      return reply.code(204).send();
    },
  );
};
