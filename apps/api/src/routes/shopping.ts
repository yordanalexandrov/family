import {
  createManualItemSchema,
  setCheckedSchema,
  setHiddenSchema,
  shoppingItemParamsSchema,
  shoppingItemResponseSchema,
  shoppingListParamsSchema,
  shoppingListResponseSchema,
} from '@family/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  addManualItem,
  deleteItem,
  getShoppingList,
  setItemChecked,
  setItemHidden,
} from '../services/shopping.js';

/**
 * The shopping list of a week (GLOSSARY: Списък за пазаруване), addressed by its week. A week without a menu has a
 * list too (#129 D-11): `hasMenu: false`, only manual items.
 */
export const shoppingRoutes: FastifyPluginAsyncZod = async (app) => {
  const deps = { db: app.db, events: app.events };
  app.get(
    '/api/shopping-lists/:weekStart',
    {
      schema: {
        params: shoppingListParamsSchema,
        response: { 200: shoppingListResponseSchema },
      },
    },
    async (request) => ({
      list: await getShoppingList(app.db, request.params.weekStart),
    }),
  );

  app.put(
    '/api/shopping-lists/:weekStart/items/:key/checked',
    {
      schema: {
        params: shoppingItemParamsSchema,
        body: setCheckedSchema,
        response: { 200: shoppingItemResponseSchema },
      },
    },
    async (request) => ({
      item: await setItemChecked(deps, {
        ...request.params,
        checked: request.body.checked,
        actingUserId: request.actor.id,
        now: app.now(),
      }),
    }),
  );

  app.put(
    '/api/shopping-lists/:weekStart/items/:key/hidden',
    {
      schema: {
        params: shoppingItemParamsSchema,
        body: setHiddenSchema,
        response: { 200: shoppingItemResponseSchema },
      },
    },
    async (request) => ({
      item: await setItemHidden(deps, {
        ...request.params,
        hidden: request.body.hidden,
      }),
    }),
  );

  app.post(
    '/api/shopping-lists/:weekStart/items',
    {
      schema: {
        params: shoppingListParamsSchema,
        body: createManualItemSchema,
        response: { 201: shoppingItemResponseSchema },
      },
    },
    async (request, reply) => {
      const item = await addManualItem(
        deps,
        request.params.weekStart,
        request.body,
      );
      return reply.code(201).send({ item });
    },
  );

  app.delete(
    '/api/shopping-lists/:weekStart/items/:key',
    { schema: { params: shoppingItemParamsSchema } },
    async (request, reply) => {
      await deleteItem(deps, request.params);
      return reply.code(204).send();
    },
  );
};
