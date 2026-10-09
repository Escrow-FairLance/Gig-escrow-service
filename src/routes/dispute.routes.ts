import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { disputeService } from '../services/dispute.service.js';
import { disputeSettlementService } from '../services/dispute-settlement.service.js';
import { DisputeStatus, serializeBigInt } from '../types/domain.js';
import { prisma } from '../db/client.js';

const openDisputeSchema = z.object({
  reason: z.string().min(5).max(2000),
  evidences: z
    .array(
      z.object({
        s3Key: z.string().min(1),
        fileName: z.string().min(1),
        sha256Hash: z.string().length(64),
        description: z.string().max(500).optional(),
      })
    )
    .optional(),
});

const castVoteSchema = z.object({
  freelancerShareBps: z.coerce.number().int().min(0).max(10000),
  txHash: z.string().optional(),
});

export const disputeRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // POST /api/v1/jobs/:jobId/milestones/:index/dispute
  app.post(
    '/api/v1/jobs/:jobId/milestones/:index/dispute',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { jobId, index } = request.params as { jobId: string; index: string };
      const milestoneIndex = parseInt(index, 10);

      const parseResult = openDisputeSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid dispute payload',
          details: parseResult.error.format(),
        });
      }

      const job = await prisma.job.findUnique({ where: { id: jobId } });
      if (!job) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Job '${jobId}' not found`,
        });
      }

      if (
        request.user.address !== job.clientAddress &&
        request.user.address !== job.freelancerAddress
      ) {
        return reply.status(403).send({
          statusCode: 403,
          error: 'Forbidden',
          message: 'Only client or freelancer can open a dispute on this job',
        });
      }

      try {
        const dispute = await disputeService.openDispute({
          jobId,
          milestoneIndex,
          openedBy: request.user.address,
          reason: parseResult.data.reason,
          evidences: parseResult.data.evidences?.map((e) => ({
            ...e,
            submitterAddress: request.user.address,
          })),
        });

        return reply.status(201).send({ dispute: serializeBigInt(dispute) });
      } catch (err) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Failed to Open Dispute',
          message: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }
  );

  // GET /api/v1/jobs/:jobId/milestones/:index/dispute
  app.get('/api/v1/jobs/:jobId/milestones/:index/dispute', async (request, reply) => {
    const { jobId, index } = request.params as { jobId: string; index: string };
    const milestoneIndex = parseInt(index, 10);

    const dispute = await disputeService.getDispute(jobId, milestoneIndex);
    if (!dispute) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: `Dispute not found for job ${jobId} milestone ${milestoneIndex}`,
      });
    }

    return reply.send({ dispute: serializeBigInt(dispute) });
  });

  // POST /api/v1/jobs/:jobId/milestones/:index/dispute/vote
  app.post(
    '/api/v1/jobs/:jobId/milestones/:index/dispute/vote',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { jobId, index } = request.params as { jobId: string; index: string };
      const milestoneIndex = parseInt(index, 10);

      const parseResult = castVoteSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid vote payload: freelancerShareBps must be 0-10000',
          details: parseResult.error.format(),
        });
      }

      try {
        const result = await disputeSettlementService.castVote(
          jobId,
          milestoneIndex,
          request.user.address,
          parseResult.data.freelancerShareBps,
          parseResult.data.txHash
        );

        return reply.send({ result: serializeBigInt(result) });
      } catch (err) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Vote Rejected',
          message: err instanceof Error ? err.message : 'Vote error',
        });
      }
    }
  );

  // GET /api/v1/disputes
  app.get('/api/v1/disputes', async (request, reply) => {
    const query = request.query as {
      status?: DisputeStatus;
      arbitratorAddress?: string;
    };

    const disputes = await disputeService.listDisputes({
      status: query.status,
      arbitratorAddress: query.arbitratorAddress,
    });

    return reply.send({ disputes: serializeBigInt(disputes) });
  });
};
