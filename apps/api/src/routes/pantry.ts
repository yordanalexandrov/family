import {
  alreadyInPantrySchema,
  createPantryItemSchema,
  notStapleSchema,
  pantryItemResponseSchema,
  pantryResponseSchema,
  updatePantryItemSchema,
} from '@family/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  addPantryItem,
  changePantryItem,
  getPantry,
  markPantryRanOut,
  removePantryItem,
} from '../services/pantry.js';
import { idParamsSchema } from './params.js';

/** The pantry (GLOSSARY: Килер): staples and use-up items, at most one per ingredient. */
export const pantryRoutes: FastifyPluginAsyncZod = async (app) => {
  const deps = { db: app.db, events: app.events };

  app.get(
    '/api/pantry',
    { schema: { response: { 200: pantryResponseSchema } } },
    async () => ({ items: await getPantry(app.db) }),
  );

  app.post(
    '/api/pantry',
    {
      schema: {
        body: createPantryItemSchema,
        response: {
          201: pantryItemResponseSchema,
          409: alreadyInPantrySchema,
        },
      },
    },
    async (request, reply) => {
      const item = await addPantryItem(deps, request.body);
      return reply.code(201).send({ item });
    },
  );

  app.patch(
    '/api/pantry/:id',
    {
      schema: {
        params: idParamsSchema,
        body: updatePantryItemSchema,
        response: { 200: pantryItemResponseSchema },
      },
    },
    async (request) => ({
      item: await changePantryItem(deps, request.params.id, request.body),
    }),
  );

  app.post(
    '/api/pantry/:id/ran-out',
    {
      schema: {
        params: idParamsSchema,
        response: { 200: pantryItemResponseSchema, 409: notStapleSchema },
      },
    },
    async (request) => ({
      item: await markPantryRanOut(deps, request.params.id, app.now()),
    }),
  );

  app.delete(
    '/api/pantry/:id',
    { schema: { params: idParamsSchema } },
    async (request, reply) => {
      await removePantryItem(deps, request.params.id);
      return reply.code(204).send();
    },
  );
};
