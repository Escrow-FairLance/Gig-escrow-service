import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import crypto from 'crypto';
import { storageService } from '../storage/storage.service.js';

const uploadQuerySchema = z.object({
  key: z.string().optional(),
  mimeType: z.string().optional().default('application/octet-stream'),
});

export const storageRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // POST /api/v1/storage/upload
  app.post(
    '/api/v1/storage/upload',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const query = uploadQuerySchema.parse(request.query);
      const randomKey = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
      const objectKey = query.key ? `${randomKey}-${query.key}` : randomKey;

      // Expect raw buffer or binary body
      const buffer = (await request.body) as Buffer;
      if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Upload body must be a non-empty binary Buffer',
        });
      }

      const result = await storageService.put(objectKey, buffer, query.mimeType);

      return reply.status(201).send({
        key: result.key,
        sizeBytes: result.sizeBytes.toString(),
        sha256Hash: result.sha256Hash,
        downloadUrl: await storageService.getDownloadUrl(result.key),
      });
    }
  );

  // GET /api/v1/storage/download/:key
  app.get('/api/v1/storage/download/:key', async (request, reply) => {
    const { key } = request.params as { key: string };

    try {
      const decrypted = await storageService.get(key);
      reply.header('Content-Type', 'application/octet-stream');
      reply.header('Content-Disposition', `attachment; filename="${pathSafeFilename(key)}"`);
      return reply.send(decrypted);
    } catch {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: `Object '${key}' not found or decryption failed`,
      });
    }
  });
};

function pathSafeFilename(key: string): string {
  const parts = key.split(/[-_]/);
  return parts[parts.length - 1] || 'deliverable.bin';
}
