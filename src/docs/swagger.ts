import { FastifyInstance } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';

export async function registerSwagger(app: FastifyInstance): Promise<void> {
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Escrow-FairLance Service API',
        description:
          'Backend REST microservice for Escrow-FairLance freelancer escrow platform with milestone payments, arbitrator panel matching, Soroban contract event indexing, encrypted deliverables, and SEP-24 fiat rails.',
        version: '0.1.0',
      },
      servers: [
        {
          url: 'http://localhost:4000',
          description: 'Local Development Server',
        },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
      tags: [
        { name: 'Auth', description: 'SEP-10 Stellar Web Authentication & JWT sessions' },
        { name: 'Users', description: 'User profiles, skills, and webhook settings' },
        { name: 'Templates', description: 'Job scoping templates and terms hashing' },
        { name: 'Jobs', description: 'Escrow contract job management' },
        { name: 'Milestones', description: 'Deliverable submission and review with 2-revision limit' },
        { name: 'Storage', description: 'Encrypted deliverable upload and download' },
        { name: 'Arbitrators', description: 'Arbitrator directory, staking, and panel recommendation' },
        { name: 'Disputes', description: 'Evidence submission, proportional settlement, and voting' },
        { name: 'Indexer', description: 'Soroban RPC getEvents synchronization' },
        { name: 'Notifications', description: 'In-app and email alert management' },
        { name: 'Anchors', description: 'SEP-24 interactive deposit and fiat off-ramp rails' },
      ],
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
    },
    staticCSP: true,
  });
}
