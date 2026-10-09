import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { jobService } from '../services/job.service.js';
import { JobStatus, serializeBigInt } from '../types/domain.js';

const createJobSchema = z.object({
  clientAddress: z.string().min(56).max(56),
  freelancerAddress: z.string().min(56).max(56),
  tokenAddress: z.string().min(56).max(56),
  milestones: z.array(
    z.object({
      title: z.string().min(3).max(200),
      description: z.string().max(1000).optional(),
      amount: z.string().regex(/^\d+$/),
      deadline: z.string().datetime(),
    })
  ).min(1),
  termsJson: z.record(z.unknown()),
  templateHash: z.string().optional(),
  arbitratorFeeBps: z.coerce.number().int().min(0).max(2000).optional(),
  clientCancelFeeBps: z.coerce.number().int().min(0).max(2000).optional(),
  reviewWindowSeconds: z.coerce.number().int().min(3600).optional(),
  workTimeoutSeconds: z.coerce.number().int().min(3600).optional(),
  disputeWindowSeconds: z.coerce.number().int().min(3600).optional(),
  arbitratorStakeReq: z.string().regex(/^\d+$/).optional(),
  arbitratorPanel: z.array(z.string().min(56).max(56)).min(1).max(7),
});

const bindOnChainSchema = z.object({
  onChainJobId: z.string().regex(/^\d+$/),
});

export const jobRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // POST /api/v1/jobs
  app.post(
    '/api/v1/jobs',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const parseResult = createJobSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid job creation parameters',
          details: parseResult.error.format(),
        });
      }

      // Check client matches authenticated user
      if (request.user.address !== parseResult.data.clientAddress) {
        return reply.status(403).send({
          statusCode: 403,
          error: 'Forbidden',
          message: 'Authenticated account must match client address',
        });
      }

      try {
        const job = await jobService.createJob(parseResult.data);
        return reply.status(201).send({ job: serializeBigInt(job) });
      } catch (err) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Job Creation Failed',
          message: err instanceof Error ? err.message : 'Unknown job creation error',
        });
      }
    }
  );

  // GET /api/v1/jobs
  app.get('/api/v1/jobs', async (request, reply) => {
    const query = request.query as {
      userAddress?: string;
      role?: 'client' | 'freelancer' | 'arbitrator';
      status?: JobStatus;
      limit?: string;
      offset?: string;
    };

    const result = await jobService.listJobs({
      userAddress: query.userAddress,
      role: query.role,
      status: query.status,
      limit: query.limit ? parseInt(query.limit, 10) : 20,
      offset: query.offset ? parseInt(query.offset, 10) : 0,
    });

    return reply.send({
      jobs: serializeBigInt(result.jobs),
      total: result.total,
    });
  });

  // GET /api/v1/jobs/:id
  app.get('/api/v1/jobs/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const job = await jobService.getJobById(id);

    if (!job) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: `Job with id '${id}' not found`,
      });
    }

    return reply.send({ job: serializeBigInt(job) });
  });

  // POST /api/v1/jobs/:id/bind-onchain
  app.post(
    '/api/v1/jobs/:id/bind-onchain',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parseResult = bindOnChainSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid on-chain job ID format',
          details: parseResult.error.format(),
        });
      }

      const job = await jobService.getJobById(id);
      if (!job) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Job with id '${id}' not found`,
        });
      }

      const updated = await jobService.linkOnChainJobId(id, BigInt(parseResult.data.onChainJobId));
      return reply.send({ job: serializeBigInt(updated) });
    }
  );
};
