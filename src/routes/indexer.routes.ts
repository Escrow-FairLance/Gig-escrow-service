import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { indexerService } from '../indexer/indexer.service.js';
import { indexerCursorRepo } from '../indexer/cursor.js';
import { stellarClient } from '../stellar/client.js';
import { config } from '../config/env.js';
import { prisma } from '../db/client.js';

const resetCursorSchema = z.object({
  startLedger: z.coerce.number().int().nonnegative().optional().default(0),
});

export const indexerRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // GET /api/v1/indexer/status
  app.get('/api/v1/indexer/status', async (_request, reply) => {
    const cursor = await indexerCursorRepo.getCursor(config.ESCROW_CONTRACT_ID);
    let latestLedger = 0;
    try {
      latestLedger = await stellarClient.getLatestLedger();
    } catch {
      // offline fallback
    }

    return reply.send({
      contractId: config.ESCROW_CONTRACT_ID,
      cursor,
      latestLedger,
      lag: latestLedger > cursor.lastLedger ? latestLedger - cursor.lastLedger : 0,
    });
  });

  // POST /api/v1/indexer/poll
  app.post('/api/v1/indexer/poll', async (_request, reply) => {
    const result = await indexerService.pollOnce();
    return reply.send({
      success: true,
      result,
    });
  });

  // POST /api/v1/indexer/reset
  app.post(
    '/api/v1/indexer/reset',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const parseResult = resetCursorSchema.safeParse(request.body);
      const startLedger = parseResult.success ? parseResult.data.startLedger : 0;

      await indexerCursorRepo.resetCursor(config.ESCROW_CONTRACT_ID, startLedger);
      return reply.send({
        success: true,
        message: `Indexer cursor reset to ledger ${startLedger}`,
      });
    }
  );

  // GET /api/v1/indexer/events
  app.get('/api/v1/indexer/events', async (request, reply) => {
    const query = request.query as {
      topic?: string;
      limit?: string;
      offset?: string;
    };

    const limit = query.limit ? parseInt(query.limit, 10) : 50;
    const offset = query.offset ? parseInt(query.offset, 10) : 0;

    const [events, total] = await Promise.all([
      prisma.eventLog.findMany({
        where: query.topic ? { topic: query.topic } : undefined,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.eventLog.count({
        where: query.topic ? { topic: query.topic } : undefined,
      }),
    ]);

    return reply.send({ events, total });
  });
};
