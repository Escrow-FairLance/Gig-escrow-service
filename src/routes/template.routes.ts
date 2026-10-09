import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { templateService } from '../services/template.service.js';

const hashTermsBodySchema = z.object({
  terms: z.record(z.unknown()),
});

const scopingAssistantSchema = z.object({
  templateId: z.string().optional(),
  totalBudget: z.coerce.number().positive(),
  totalDurationDays: z.coerce.number().positive(),
  milestoneCount: z.coerce.number().int().min(1).max(10).optional().default(3),
});

export const templateRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // GET /api/v1/templates
  app.get('/api/v1/templates', async (request, reply) => {
    const { category } = request.query as { category?: string };
    const templates = await templateService.listTemplates(category);
    return reply.send({ templates });
  });

  // GET /api/v1/templates/:id
  app.get('/api/v1/templates/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const template = await templateService.getTemplateById(id);

    if (!template) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: `Job template with id '${id}' not found`,
      });
    }

    return reply.send({ template });
  });

  // POST /api/v1/templates/hash-terms
  app.post('/api/v1/templates/hash-terms', async (request, reply) => {
    const parseResult = hashTermsBodySchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Invalid terms payload',
        details: parseResult.error.format(),
      });
    }

    const termsHash = templateService.computeTermsHash(parseResult.data.terms);
    return reply.send({ termsHash });
  });

  // POST /api/v1/templates/scope
  app.post('/api/v1/templates/scope', async (request, reply) => {
    const parseResult = scopingAssistantSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Invalid scoping parameters',
        details: parseResult.error.format(),
      });
    }

    const { templateId, totalBudget, totalDurationDays, milestoneCount } = parseResult.data;
    let template = templateId ? await templateService.getTemplateById(templateId) : null;
    if (!template) {
      const all = await templateService.listTemplates();
      template = all[0];
    }

    const milestones = [];
    const baseAmount = Math.floor(totalBudget / milestoneCount);
    let accumulatedAmount = 0;
    const daysPerMilestone = Math.max(1, Math.floor(totalDurationDays / milestoneCount));

    for (let i = 0; i < milestoneCount; i++) {
      const isLast = i === milestoneCount - 1;
      const amount = isLast ? totalBudget - accumulatedAmount : baseAmount;
      accumulatedAmount += amount;

      milestones.push({
        index: i,
        title: `Milestone ${i + 1}: Phase Delivery`,
        amount: amount.toString(),
        estimatedDays: daysPerMilestone,
        targetDeadline: new Date(Date.now() + (i + 1) * daysPerMilestone * 86400 * 1000).toISOString(),
      });
    }

    return reply.send({
      scopedPlan: {
        totalBudget: totalBudget.toString(),
        totalDurationDays,
        milestoneCount,
        milestones,
        suggestedReviewWindowSeconds: 259200, // 3 days
        suggestedWorkTimeoutSeconds: daysPerMilestone * 86400 * 2, // 2x milestone time
      },
    });
  });
};
