import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { arbitratorService } from '../services/arbitrator.service.js';
import { arbitratorMatchingService } from '../services/arbitrator-matching.service.js';
import { serializeBigInt } from '../types/domain.js';

const registerArbitratorSchema = z.object({
  skills: z.array(z.string()).min(1),
  languages: z.array(z.string()).min(1),
  feeBps: z.coerce.number().int().min(50).max(2500).optional().default(500),
  minStake: z.string().regex(/^\d+$/).optional(),
  stakedAmount: z.string().regex(/^\d+$/).optional(),
});

const suggestPanelSchema = z.object({
  clientAddress: z.string().min(56).max(56),
  freelancerAddress: z.string().min(56).max(56),
  skills: z.array(z.string()).optional(),
  languages: z.array(z.string()).optional(),
  targetPanelSize: z.coerce.number().int().min(1).max(7).optional().default(3),
});

export const arbitratorRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // GET /api/v1/arbitrators
  app.get('/api/v1/arbitrators', async (request, reply) => {
    const list = await arbitratorService.listArbitrators(true);
    return reply.send({
      arbitrators: serializeBigInt(list),
    });
  });

  // POST /api/v1/arbitrators/register
  app.post(
    '/api/v1/arbitrators/register',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const parseResult = registerArbitratorSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid arbitrator registration payload',
          details: parseResult.error.format(),
        });
      }

      const profile = await arbitratorService.registerOrUpdate({
        userId: request.user.sub,
        skills: parseResult.data.skills,
        languages: parseResult.data.languages,
        feeBps: parseResult.data.feeBps,
        minStake: parseResult.data.minStake ? BigInt(parseResult.data.minStake) : undefined,
        stakedAmount: parseResult.data.stakedAmount ? BigInt(parseResult.data.stakedAmount) : undefined,
      });

      return reply.send({ profile: serializeBigInt(profile) });
    }
  );

  // POST /api/v1/arbitrators/suggest-panel
  app.post('/api/v1/arbitrators/suggest-panel', async (request, reply) => {
    const parseResult = suggestPanelSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Invalid panel suggestion parameters',
        details: parseResult.error.format(),
      });
    }

    const result = await arbitratorMatchingService.matchPanel(parseResult.data);
    return reply.send(result);
  });
};
