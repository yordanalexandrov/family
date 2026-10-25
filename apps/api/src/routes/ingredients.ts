import {
  createIngredientSchema,
  ingredientConflictSchema,
  ingredientResponseSchema,
  ingredientsQuerySchema,
  ingredientsResponseSchema,
  updateIngredientSchema,
} from '@family/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  changeIngredient,
  createIngredient,
  findIngredients,
} from '../services/ingredients.js';

const idParamsSchema = z.object({ id: z.uuid() });

/** Ingredients (GLOSSARY: Продукт) are looked up, created and fixed while a recipe is edited. */
export const ingredientsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/api/ingredients',
    {
      schema: {
        querystring: ingredientsQuerySchema,
        response: { 200: ingredientsResponseSchema },
      },
    },
    async (request) => ({
      ingredients: await findIngredients(app.db, request.query),
    }),
  );
  app.post(
    '/api/ingredients',
    {
      schema: {
        body: createIngredientSchema,
        response: {
          201: ingredientResponseSchema,
          409: ingredientConflictSchema,
        },
      },
    },
    async (request, reply) => {
      const ingredient = await createIngredient(app.db, request.body);
      return reply.code(201).send({ ingredient });
    },
  );
  app.patch(
    '/api/ingredients/:id',
    {
      schema: {
        params: idParamsSchema,
        body: updateIngredientSchema,
        response: {
          200: ingredientResponseSchema,
          409: ingredientConflictSchema,
        },
      },
    },
    async (request) => ({
      ingredient: await changeIngredient(
        app.db,
        request.params.id,
        request.body,
      ),
    }),
  );
};
