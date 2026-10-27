import {
  createMealCommentSchema,
  createMealPlanSchema,
  createMenuProposalSchema,
  mealCommentResponseSchema,
  mealCommentsResponseSchema,
  mealPlanResponseSchema,
  mealPlansQuerySchema,
  mealPlansResponseSchema,
  mealResponseSchema,
  menuProposalResponseSchema,
  menuProposalsQuerySchema,
  putVoteSchema,
  swapMealsSchema,
  updateMealSchema,
} from '@family/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { idParamsSchema } from './params.js';

/**
 * The weekly menu (GLOSSARY: Седмично меню): plans, their meals and `menu.propose`. A proposal answers 202 at once;
 * the client polls `GET /api/menu/proposals/:id` until the status is not `pending`, then reads the plan.
 */
export const menuRoutes: FastifyPluginAsyncZod = async (app) => {
  const service = app.menu;

  app.get(
    '/api/menu/plans',
    {
      // The tablet opens the menu from the dashboard without an acting user; changes still need one.
      config: { actingUser: false },
      schema: {
        querystring: mealPlansQuerySchema,
        response: {
          200: z.union([mealPlanResponseSchema, mealPlansResponseSchema]),
        },
      },
    },
    async (request) => {
      const { query } = request;
      if ('weekStart' in query) {
        return { plan: await service.getPlan(query.weekStart) };
      }
      return { plans: await service.listPlans(query.from, query.to) };
    },
  );

  app.post(
    '/api/menu/plans',
    {
      schema: {
        body: createMealPlanSchema,
        response: { 201: mealPlanResponseSchema },
      },
    },
    async (request, reply) => {
      const plan = await service.createEmptyPlan(
        request.body.weekStart,
        request.actor.id,
      );
      return reply.code(201).send({ plan });
    },
  );

  app.delete(
    '/api/menu/plans/:id',
    { schema: { params: idParamsSchema } },
    async (request, reply) => {
      await service.deletePlan(request.params.id);
      return reply.code(204).send();
    },
  );

  app.patch(
    '/api/menu/meals/:id',
    {
      schema: {
        params: idParamsSchema,
        body: updateMealSchema,
        response: { 200: mealResponseSchema },
      },
    },
    async (request) => ({
      meal: await service.updateMeal(
        request.params.id,
        request.body,
        request.actor.id,
      ),
    }),
  );

  // GLOSSARY: Глас. A second press on the same vote is the client's `DELETE`.
  app.put(
    '/api/menu/meals/:id/vote',
    {
      schema: {
        params: idParamsSchema,
        body: putVoteSchema,
        response: { 200: mealResponseSchema },
      },
    },
    async (request) => ({
      meal: await service.vote(
        request.params.id,
        request.actor.id,
        request.body.value,
      ),
    }),
  );

  app.delete(
    '/api/menu/meals/:id/vote',
    {
      schema: { params: idParamsSchema, response: { 200: mealResponseSchema } },
    },
    async (request) => ({
      meal: await service.vote(request.params.id, request.actor.id, null),
    }),
  );

  app.post(
    '/api/menu/meals/:id/swap',
    {
      schema: {
        params: idParamsSchema,
        body: swapMealsSchema,
        response: { 200: mealPlanResponseSchema },
      },
    },
    async (request) => ({
      plan: await service.swapMeals(
        request.params.id,
        request.body.withMealId,
        request.actor.id,
      ),
    }),
  );

  // GLOSSARY: Разговор. Read for any day; written only from today on.
  app.get(
    '/api/menu/meals/:id/comments',
    {
      schema: {
        params: idParamsSchema,
        response: { 200: mealCommentsResponseSchema },
      },
    },
    async (request) => ({
      comments: await service.listComments(request.params.id),
    }),
  );

  app.post(
    '/api/menu/meals/:id/comments',
    {
      schema: {
        params: idParamsSchema,
        body: createMealCommentSchema,
        response: { 201: mealCommentResponseSchema },
      },
    },
    async (request, reply) => {
      const comment = await service.addComment(
        request.params.id,
        request.actor.id,
        request.body.body,
      );
      return reply.code(201).send({ comment });
    },
  );

  app.delete(
    '/api/menu/comments/:id',
    { schema: { params: idParamsSchema } },
    async (request, reply) => {
      await service.deleteComment(request.params.id, request.actor.id);
      return reply.code(204).send();
    },
  );

  app.post(
    '/api/menu/proposals',
    {
      schema: {
        body: createMenuProposalSchema,
        response: { 202: menuProposalResponseSchema },
      },
    },
    async (request, reply) => {
      const proposal = await service.requestProposal(
        request.body,
        request.actor.id,
      );
      return reply.code(202).send({ proposal });
    },
  );

  app.get(
    '/api/menu/proposals',
    {
      schema: {
        querystring: menuProposalsQuerySchema,
        response: { 200: menuProposalResponseSchema },
      },
    },
    async (request) => ({
      proposal: await service.getLatestProposal(request.query.weekStart),
    }),
  );

  app.get(
    '/api/menu/proposals/:id',
    {
      schema: {
        params: idParamsSchema,
        response: { 200: menuProposalResponseSchema },
      },
    },
    async (request) => ({
      proposal: await service.getProposal(request.params.id),
    }),
  );
};
