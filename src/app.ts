import fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import { registerAuthPlugin } from './auth/plugin.js';
import { registerSwagger } from './docs/swagger.js';
import { authRoutes } from './routes/auth.routes.js';
import { userRoutes } from './routes/user.routes.js';
import { templateRoutes } from './routes/template.routes.js';
import { jobRoutes } from './routes/job.routes.js';
import { milestoneRoutes } from './routes/milestone.routes.js';
import { storageRoutes } from './routes/storage.routes.js';
import { arbitratorRoutes } from './routes/arbitrator.routes.js';
import { disputeRoutes } from './routes/dispute.routes.js';
import { indexerRoutes } from './routes/indexer.routes.js';
import { notificationRoutes } from './routes/notification.routes.js';
import { anchorRoutes } from './routes/anchor.routes.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = fastify({
    logger: false,
    bodyLimit: 50 * 1024 * 1024, // 50MB for deliverables
  });

  // Security headers
  await app.register(helmet, {
    contentSecurityPolicy: false,
  });

  // CORS
  await app.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
  });

  // Rate Limiting
  await app.register(rateLimit, {
    max: 1000,
    timeWindow: '1 minute',
  });

  // Multipart body parsing
  await app.register(multipart, {
    limits: {
      fileSize: 50 * 1024 * 1024,
    },
  });

  // Authentication Plugin
  await registerAuthPlugin(app);

  // OpenAPI / Swagger Documentation
  await registerSwagger(app);

  // Global Error Handler
  app.setErrorHandler((error: any, _request, reply) => {
    const statusCode = error.statusCode ?? 500;
    reply.status(statusCode).send({
      statusCode,
      error: error.name || 'InternalServerError',
      message: error.message || 'An unexpected error occurred',
    });
  });

  // Register API Routes
  await app.register(authRoutes);
  await app.register(userRoutes);
  await app.register(templateRoutes);
  await app.register(jobRoutes);
  await app.register(milestoneRoutes);
  await app.register(storageRoutes);
  await app.register(arbitratorRoutes);
  await app.register(disputeRoutes);
  await app.register(indexerRoutes);
  await app.register(notificationRoutes);
  await app.register(anchorRoutes);

  return app;
}
