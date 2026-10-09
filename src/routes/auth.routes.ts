import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { sep10Service } from '../auth/sep10.js';
import { prisma } from '../db/client.js';
import { Role } from '../types/domain.js';

const challengeQuerySchema = z.object({
  account: z.string().min(56).max(56),
  homeDomain: z.string().optional().default('fairlance.io'),
});

const tokenBodySchema = z.object({
  transaction: z.string().min(20),
  account: z.string().min(56).max(56),
  role: z.nativeEnum(Role).optional().default(Role.FREELANCER),
});

export const authRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // GET /api/v1/auth/sep10/challenge
  app.get('/api/v1/auth/sep10/challenge', async (request, reply) => {
    const parseResult = challengeQuerySchema.safeParse(request.query);
    if (!parseResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'A valid 56-character Stellar public key (G...) is required',
        details: parseResult.error.format(),
      });
    }

    const { account, homeDomain } = parseResult.data;
    try {
      const challengeXdr = sep10Service.buildChallengeTransaction(account, homeDomain);
      return reply.send({
        transaction: challengeXdr,
        networkPassphrase: app.jwt ? 'Test SDF Network ; September 2015' : '',
        serverAccount: sep10Service.getServerPublicKey(),
      });
    } catch (err) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Challenge Generation Failed',
        message: err instanceof Error ? err.message : 'Unknown challenge generation error',
      });
    }
  });

  // POST /api/v1/auth/sep10/token
  app.post('/api/v1/auth/sep10/token', async (request, reply) => {
    const parseResult = tokenBodySchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Invalid challenge payload',
        details: parseResult.error.format(),
      });
    }

    const { transaction, account, role } = parseResult.data;
    const verification = sep10Service.verifyChallengeTransaction(transaction, account);

    if (!verification.valid) {
      return reply.status(401).send({
        statusCode: 401,
        error: 'Authentication Failed',
        message: verification.error ?? 'Invalid signature on SEP-10 challenge',
      });
    }

    // Find or create user in PostgreSQL
    let user = await prisma.user.findUnique({
      where: { address: account },
      include: { profile: true, arbitratorProfile: true },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          address: account,
          role,
          profile: {
            create: {
              skills: [],
              languages: ['en'],
            },
          },
        },
        include: { profile: true, arbitratorProfile: true },
      });
    }

    const payload = {
      sub: user.id,
      address: user.address,
      role: user.role,
    };

    const token = app.jwt.sign(payload);

    return reply.send({
      token,
      user: {
        id: user.id,
        address: user.address,
        role: user.role,
        profile: user.profile,
        arbitratorProfile: user.arbitratorProfile,
      },
    });
  });

  // GET /api/v1/auth/me
  app.get(
    '/api/v1/auth/me',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const user = await prisma.user.findUnique({
        where: { id: request.user.sub },
        include: { profile: true, arbitratorProfile: true },
      });

      if (!user) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'User account not found',
        });
      }

      return reply.send({ user });
    }
  );
};
