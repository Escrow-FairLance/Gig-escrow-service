import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { milestoneService } from '../services/milestone.service.js';
import { prisma } from '../db/client.js';
import { serializeBigInt } from '../types/domain.js';

const submitMilestoneSchema = z.object({
  deliverableHash: z.string().length(64),
  fileMetadata: z
    .object({
      fileName: z.string().min(1),
      fileSizeBytes: z.string().regex(/^\d+$/),
      mimeType: z.string().min(1),
      s3Key: z.string().min(1),
    })
    .optional(),
});

const reviewMilestoneSchema = z.object({
  action: z.enum(['APPROVE', 'REQUEST_REVISION']),
  feedback: z.string().max(1000).optional(),
});

export const milestoneRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // POST /api/v1/jobs/:jobId/milestones/:index/submit
  app.post(
    '/api/v1/jobs/:jobId/milestones/:index/submit',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { jobId, index } = request.params as { jobId: string; index: string };
      const milestoneIndex = parseInt(index, 10);

      const parseResult = submitMilestoneSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid milestone deliverable payload',
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

      // Check freelancer matches authenticated user
      if (request.user.address !== job.freelancerAddress) {
        return reply.status(403).send({
          statusCode: 403,
          error: 'Forbidden',
          message: 'Only the assigned freelancer can submit milestones',
        });
      }

      try {
        const fileMeta = parseResult.data.fileMetadata
          ? {
              ...parseResult.data.fileMetadata,
              fileSizeBytes: BigInt(parseResult.data.fileMetadata.fileSizeBytes),
              uploaderAddress: request.user.address,
            }
          : undefined;

        const updated = await milestoneService.submitMilestone(
          jobId,
          milestoneIndex,
          parseResult.data.deliverableHash,
          fileMeta
        );

        return reply.send({ milestone: serializeBigInt(updated) });
      } catch (err) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Milestone Submission Failed',
          message: err instanceof Error ? err.message : 'Unknown submission error',
        });
      }
    }
  );

  // POST /api/v1/jobs/:jobId/milestones/:index/review
  app.post(
    '/api/v1/jobs/:jobId/milestones/:index/review',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { jobId, index } = request.params as { jobId: string; index: string };
      const milestoneIndex = parseInt(index, 10);

      const parseResult = reviewMilestoneSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid review payload',
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

      if (request.user.address !== job.clientAddress) {
        return reply.status(403).send({
          statusCode: 403,
          error: 'Forbidden',
          message: 'Only the job client can review deliverables',
        });
      }

      try {
        if (parseResult.data.action === 'APPROVE') {
          const approved = await milestoneService.approveMilestone(jobId, milestoneIndex);
          return reply.send({ milestone: serializeBigInt(approved), action: 'APPROVE' });
        } else {
          if (!parseResult.data.feedback) {
            return reply.status(400).send({
              statusCode: 400,
              error: 'Bad Request',
              message: 'Feedback is required when requesting a revision',
            });
          }
          const revision = await milestoneService.requestRevision(
            jobId,
            milestoneIndex,
            parseResult.data.feedback
          );
          return reply.send({ milestone: serializeBigInt(revision), action: 'REQUEST_REVISION' });
        }
      } catch (err) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Milestone Review Failed',
          message: err instanceof Error ? err.message : 'Review action rejected',
        });
      }
    }
  );

  // POST /api/v1/jobs/:jobId/milestones/:index/auto-release
  app.post('/api/v1/jobs/:jobId/milestones/:index/auto-release', async (request, reply) => {
    const { jobId, index } = request.params as { jobId: string; index: string };
    const milestoneIndex = parseInt(index, 10);

    try {
      const released = await milestoneService.checkAndAutoRelease(jobId, milestoneIndex);
      if (!released) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Auto-Release Ineligible',
          message: 'Review window has not yet elapsed or milestone is not in SUBMITTED status',
        });
      }

      return reply.send({
        success: true,
        message: 'Milestone auto-released successfully due to review timeout expiry',
        milestone: serializeBigInt(released),
      });
    } catch (err) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Auto-Release Failed',
        message: err instanceof Error ? err.message : 'Unknown auto-release error',
      });
    }
  });
};
