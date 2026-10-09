import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { prisma } from '../db/client.js';

export const notificationRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // GET /api/v1/notifications
  app.get(
    '/api/v1/notifications',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const query = request.query as { unreadOnly?: string };
      const unreadOnly = query.unreadOnly === 'true';

      const notifications = await prisma.notification.findMany({
        where: {
          userAddress: request.user.address,
          ...(unreadOnly ? { isRead: false } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });

      const unreadCount = await prisma.notification.count({
        where: {
          userAddress: request.user.address,
          isRead: false,
        },
      });

      return reply.send({
        notifications,
        unreadCount,
      });
    }
  );

  // PUT /api/v1/notifications/:id/read
  app.put(
    '/api/v1/notifications/:id/read',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const notification = await prisma.notification.findUnique({
        where: { id },
      });

      if (!notification || notification.userAddress !== request.user.address) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'Notification not found or access denied',
        });
      }

      const updated = await prisma.notification.update({
        where: { id },
        data: { isRead: true },
      });

      return reply.send({ notification: updated });
    }
  );

  // PUT /api/v1/notifications/read-all
  app.put(
    '/api/v1/notifications/read-all',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      await prisma.notification.updateMany({
        where: {
          userAddress: request.user.address,
          isRead: false,
        },
        data: { isRead: true },
      });

      return reply.send({ success: true });
    }
  );
};
