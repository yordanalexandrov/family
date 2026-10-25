import {
  recipeInputSchema,
  recipeResponseSchema,
  recipesQuerySchema,
  recipesResponseSchema,
} from '@family/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  createRecipe,
  findRecipes,
  getRecipe,
  replaceRecipe,
  setRecipeArchived,
} from '../services/recipes.js';
import { idParamsSchema } from './params.js';

/** The recipe registry (GLOSSARY: Регистър рецепти). There is no DELETE: a recipe is archived instead. */
export const recipesRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/api/recipes',
    {
      schema: {
        querystring: recipesQuerySchema,
        response: { 200: recipesResponseSchema },
      },
    },
    async (request) => ({
      recipes: await findRecipes(app.db, request.query),
    }),
  );

  app.get(
    '/api/recipes/:id',
    {
      schema: {
        params: idParamsSchema,
        response: { 200: recipeResponseSchema },
      },
    },
    async (request) => ({
      recipe: await getRecipe(app.db, request.params.id),
    }),
  );

  app.post(
    '/api/recipes',
    {
      schema: {
        body: recipeInputSchema,
        response: { 201: recipeResponseSchema },
      },
    },
    async (request, reply) => {
      const recipe = await createRecipe(app.db, request.body);
      return reply.code(201).send({ recipe });
    },
  );

  app.put(
    '/api/recipes/:id',
    {
      schema: {
        params: idParamsSchema,
        body: recipeInputSchema,
        response: { 200: recipeResponseSchema },
      },
    },
    async (request) => ({
      recipe: await replaceRecipe(app.db, request.params.id, request.body),
    }),
  );

  for (const [action, archived] of [
    ['archive', true],
    ['unarchive', false],
  ] as const) {
    app.post(
      `/api/recipes/:id/${action}`,
      {
        schema: {
          params: idParamsSchema,
          response: { 200: recipeResponseSchema },
        },
      },
      async (request) => ({
        recipe: await setRecipeArchived(app.db, request.params.id, archived),
      }),
    );
  }
};
