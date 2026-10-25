import {
  approvedSuggestionResponseSchema,
  recipeInputSchema,
  recipeSuggestionResponseSchema,
  recipeSuggestParamsSchema,
  suggestionRequestDetailSchema,
  suggestionRequestResponseSchema,
  suggestionRequestsQuerySchema,
  suggestionRequestsResponseSchema,
} from '@family/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

const idParamsSchema = z.object({ id: z.uuid() });

/**
 * `recipe.suggest` runs (GLOSSARY: Заявка за предложения) and the decisions on their suggestions. A POST answers 202 at
 * once; the client polls `GET …/requests/:id` until the status is not `pending`.
 */
export const recipeSuggestionsRoutes: FastifyPluginAsyncZod = async (app) => {
  const service = app.recipeSuggestions;

  app.post(
    '/api/recipe-suggestions/requests',
    {
      schema: {
        body: recipeSuggestParamsSchema,
        response: { 202: suggestionRequestResponseSchema },
      },
    },
    async (request, reply) => {
      const created = await service.requestSuggestions(
        request.body,
        request.actor.id,
      );
      return reply.code(202).send({ request: created });
    },
  );

  app.get(
    '/api/recipe-suggestions/requests',
    {
      schema: {
        querystring: suggestionRequestsQuerySchema,
        response: { 200: suggestionRequestsResponseSchema },
      },
    },
    async (request) => ({
      requests: await service.listRequests(request.query.limit),
    }),
  );

  app.get(
    '/api/recipe-suggestions/requests/:id',
    {
      schema: {
        params: idParamsSchema,
        response: { 200: suggestionRequestDetailSchema },
      },
    },
    (request) => service.getRequest(request.params.id),
  );

  app.post(
    '/api/recipe-suggestions/:id/approve',
    {
      schema: {
        params: idParamsSchema,
        body: recipeInputSchema,
        response: { 201: approvedSuggestionResponseSchema },
      },
    },
    async (request, reply) => {
      const approved = await service.approveSuggestion(
        request.params.id,
        request.body,
        request.actor.id,
      );
      return reply.code(201).send(approved);
    },
  );

  app.post(
    '/api/recipe-suggestions/:id/reject',
    {
      schema: {
        params: idParamsSchema,
        response: { 200: recipeSuggestionResponseSchema },
      },
    },
    async (request) => ({
      suggestion: await service.rejectSuggestion(
        request.params.id,
        request.actor.id,
      ),
    }),
  );
};
