import { describe, it } from 'node:test';
import assert from 'node:assert';
import fastify from 'fastify';
import { anchorRoutes } from '../src/routes/anchor.routes.js';
import { templateRoutes } from '../src/routes/template.routes.js';
import { registerAuthPlugin } from '../src/auth/plugin.js';

describe('Fastify REST API Integration Tests', () => {
  it('GET /api/v1/anchors returns registered anchors filtered by countryCode', async () => {
    const app = fastify();
    await registerAuthPlugin(app);
    await app.register(anchorRoutes);
    await app.ready();

    try {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/anchors?countryCode=NG',
      });

      assert.strictEqual(res.statusCode, 200);
      const body = JSON.parse(res.payload);
      assert.ok(Array.isArray(body.anchors));
      assert.ok(body.anchors.length >= 1);
      const cowrie = body.anchors.find((a: any) => a.id === 'cowrie-ngn');
      assert.ok(cowrie);
      assert.strictEqual(cowrie.countryCode, 'NG');
    } finally {
      await app.close();
    }
  });

  it('POST /api/v1/templates/hash-terms computes canonical terms hash', async () => {
    const app = fastify();
    await registerAuthPlugin(app);
    await app.register(templateRoutes);
    await app.ready();

    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/templates/hash-terms',
        payload: {
          terms: {
            deliverableScope: 'Mobile App MVP',
            slaDays: 14,
          },
        },
      });

      assert.strictEqual(res.statusCode, 200);
      const body = JSON.parse(res.payload);
      assert.ok(body.termsHash);
      assert.strictEqual(body.termsHash.length, 64);
    } finally {
      await app.close();
    }
  });

  it('POST /api/v1/templates/scope generates scoping plan breakdown', async () => {
    const app = fastify();
    await registerAuthPlugin(app);
    await app.register(templateRoutes);
    await app.ready();

    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/templates/scope',
        payload: {
          totalBudget: 1500,
          totalDurationDays: 30,
          milestoneCount: 3,
        },
      });

      assert.strictEqual(res.statusCode, 200);
      const body = JSON.parse(res.payload);
      assert.strictEqual(body.scopedPlan.milestoneCount, 3);
      assert.strictEqual(body.scopedPlan.milestones.length, 3);
      assert.strictEqual(body.scopedPlan.totalBudget, '1500');
    } finally {
      await app.close();
    }
  });
});
