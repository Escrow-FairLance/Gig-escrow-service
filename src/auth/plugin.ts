import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import { config } from '../config/env.js';
import { JwtUserPayload, Role } from '../types/domain.js';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtUserPayload;
    user: JwtUserPayload;
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    authorize: (roles: Role[]) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export async function registerAuthPlugin(app: FastifyInstance): Promise<void> {
  await app.register(fastifyJwt, {
    secret: config.JWT_SECRET,
  });

  app.decorate(
    'authenticate',
    async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      try {
        await request.jwtVerify();
      } catch (err) {
        reply.status(401).send({
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Invalid or missing authentication token',
        });
      }
    }
  );

  app.decorate('authorize', (allowedRoles: Role[]) => {
    return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      try {
        await request.jwtVerify();
        const user = request.user as JwtUserPayload;
        if (!user || (!allowedRoles.includes(user.role) && user.role !== Role.ADMIN)) {
          reply.status(403).send({
            statusCode: 403,
            error: 'Forbidden',
            message: `User role '${user?.role}' does not have sufficient permissions for this resource`,
          });
        }
      } catch (err) {
        reply.status(401).send({
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Authentication required before authorization check',
        });
      }
    };
  });
}
