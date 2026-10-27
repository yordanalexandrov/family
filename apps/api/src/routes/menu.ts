import {
  createMealPlanSchema,
  createMenuProposalSchema,
  mealPlanResponseSchema,
  mealPlansQuerySchema,
  mealPlansResponseSchema,
  mealResponseSchema,
  menuProposalResponseSchema,
  putVoteSchema,
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
