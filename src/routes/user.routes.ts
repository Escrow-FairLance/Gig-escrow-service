import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { userService } from '../services/user.service.js';
import { Role } from '../types/domain.js';

const updateProfileSchema = z.object({
  displayName: z.string().min(2).max(100).optional(),
  email: z.string().email().optional(),
  bio: z.string().max(1000).optional(),
  avatarUrl: z.string().url().optional(),
  skills: z.array(z.string()).optional(),
  languages: z.array(z.string()).optional(),
  country: z.string().max(60).optional(),
  timezone: z.string().max(50).optional(),
  webhookUrl: z.string().url().optional(),
});

const switchRoleSchema = z.object({
  role: z.nativeEnum(Role),
});

export const userRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // GET /api/v1/users
  app.get('/api/v1/users', async (request, reply) => {
    const query = request.query as {
      role?: Role;
      skill?: string;
      country?: string;
      limit?: string;
      offset?: string;
    };

    const result = await userService.listUsers({
      role: query.role,
      skill: query.skill,
      country: query.country,
      limit: query.limit ? parseInt(query.limit, 10) : 20,
      offset: query.offset ? parseInt(query.offset, 10) : 0,
    });

    return reply.send(result);
  });

  // GET /api/v1/users/:address
  app.get('/api/v1/users/:address', async (request, reply) => {
    const { address } = request.params as { address: string };
    const user = await userService.getByAddress(address);

    if (!user) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: `User with address ${address} not found`,
      });
    }

    return reply.send({ user });
  });

  // PUT /api/v1/users/profile
  app.put(
    '/api/v1/users/profile',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const parseResult = updateProfileSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid profile update payload',
          details: parseResult.error.format(),
        });
      }

      const updatedProfile = await userService.updateProfile(
        request.user.sub,
        parseResult.data
      );

      return reply.send({ profile: updatedProfile });
    }
  );

  // PUT /api/v1/users/role
  app.put(
    '/api/v1/users/role',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const parseResult = switchRoleSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid role switch payload',
          details: parseResult.error.format(),
        });
      }

      const updatedUser = await userService.updateUserRole(
        request.user.sub,
        parseResult.data.role
      );

      return reply.send({ user: updatedUser });
    }
  );
};
