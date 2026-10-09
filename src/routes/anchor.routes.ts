import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { anchorRegistry } from '../anchors/registry.js';
import { sep24Service } from '../anchors/sep24.service.js';
import { AnchorTxStatus } from '../types/domain.js';

const depositSchema = z.object({
  anchorDomain: z.string().min(3),
  assetCode: z.string().min(2),
  amount: z.string().optional(),
});

const withdrawSchema = z.object({
  anchorDomain: z.string().min(3),
  assetCode: z.string().min(2),
  amount: z.string().optional(),
  dest: z.string().optional(),
});

const simulateSchema = z.object({
  status: z.nativeEnum(AnchorTxStatus),
  stellarTxId: z.string().optional(),
});

export const anchorRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // GET /api/v1/anchors
  app.get('/api/v1/anchors', async (request, reply) => {
    const query = request.query as { countryCode?: string };
    const anchors = query.countryCode
      ? anchorRegistry.findByCountryCode(query.countryCode)
      : anchorRegistry.getAll();

    return reply.send({ anchors });
  });

  // POST /api/v1/anchors/deposit
  app.post(
    '/api/v1/anchors/deposit',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const parseResult = depositSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid deposit parameters',
          details: parseResult.error.format(),
        });
      }

      try {
        const session = await sep24Service.initiateDeposit({
          userAddress: request.user.address,
          anchorDomain: parseResult.data.anchorDomain,
          assetCode: parseResult.data.assetCode,
          amount: parseResult.data.amount,
        });

        return reply.send({ session });
      } catch (err) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Deposit Initiation Failed',
          message: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }
  );

  // POST /api/v1/anchors/withdraw
  app.post(
    '/api/v1/anchors/withdraw',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const parseResult = withdrawSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid withdrawal parameters',
          details: parseResult.error.format(),
        });
      }

      try {
        const session = await sep24Service.initiateWithdraw({
          userAddress: request.user.address,
          anchorDomain: parseResult.data.anchorDomain,
          assetCode: parseResult.data.assetCode,
          amount: parseResult.data.amount,
          dest: parseResult.data.dest,
        });

        return reply.send({ session });
      } catch (err) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Withdrawal Initiation Failed',
          message: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }
  );

  // GET /api/v1/anchors/transactions/:id
  app.get('/api/v1/anchors/transactions/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const tx = await sep24Service.getTransaction(id);

    if (!tx) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: `Anchor transaction '${id}' not found`,
      });
    }

    return reply.send({ transaction: tx });
  });

  // POST /api/v1/anchors/transactions/:id/simulate
  app.post('/api/v1/anchors/transactions/:id/simulate', async (request, reply) => {
    const { id } = request.params as { id: string };
    const parseResult = simulateSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Invalid status simulation payload',
      });
    }

    const updated = await sep24Service.updateStatus(
      id,
      parseResult.data.status,
      parseResult.data.stellarTxId
    );

    return reply.send({ transaction: updated });
  });
};
