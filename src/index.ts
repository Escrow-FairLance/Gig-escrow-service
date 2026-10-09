import { buildApp } from './app.js';
import { config } from './config/env.js';
import { checkDatabaseHealth, connectDatabase, disconnectDatabase, prisma } from './db/client.js';
import { indexerService } from './indexer/indexer.service.js';
import { deadlineMonitorCron } from './notifications/cron.js';
import { templateService } from './services/template.service.js';
import { stellarClient } from './stellar/client.js';

async function bootstrap() {
  console.info('Starting Escrow-FairLance Backend Service...');

  // 1. Connect to PostgreSQL
  try {
    await connectDatabase();
  } catch (err) {
    console.warn('PostgreSQL connection error on startup (service continuing in offline mode):', err);
  }

  // 2. Ensure built-in job templates
  try {
    await templateService.ensureBuiltinTemplates();
  } catch (err) {
    console.warn('Template initialization skipped:', err);
  }

  // 3. Build Fastify instance
  const app = await buildApp();

  // 4. Health Check Endpoint
  app.get('/health', async (_request, reply) => {
    const dbHealthy = await checkDatabaseHealth();
    let latestLedger = 0;
    try {
      latestLedger = await stellarClient.getLatestLedger();
    } catch {
      // offline fallback
    }

    const isHealthy = dbHealthy || config.NODE_ENV !== 'production';

    return reply.status(isHealthy ? 200 : 503).send({
      status: isHealthy ? 'OK' : 'DEGRADED',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      database: dbHealthy ? 'CONNECTED' : 'DISCONNECTED',
      network: config.STELLAR_NETWORK,
      contractId: config.ESCROW_CONTRACT_ID,
      latestLedger,
    });
  });

  // 5. Metrics Endpoint
  app.get('/metrics', async (_request, reply) => {
    let jobCount = 0;
    let disputeCount = 0;
    try {
      [jobCount, disputeCount] = await Promise.all([
        prisma.job.count(),
        prisma.dispute.count(),
      ]);
    } catch {
      // ignore
    }

    const mem = process.memoryUsage();
    return reply.send({
      memory: {
        rssBytes: mem.rss,
        heapUsedBytes: mem.heapUsed,
        heapTotalBytes: mem.heapTotal,
      },
      stats: {
        totalJobs: jobCount,
        totalDisputes: disputeCount,
      },
    });
  });

  // 6. Start Background Workers
  indexerService.start(8000);
  deadlineMonitorCron.start();

  // 7. Listen on port
  try {
    await app.listen({ port: config.PORT, host: config.HOST });
    console.info(`FairLance Escrow Service running at http://${config.HOST}:${config.PORT}`);
    console.info(`Swagger API Documentation available at http://${config.HOST}:${config.PORT}/docs`);
  } catch (err) {
    console.error('Fatal error binding HTTP server:', err);
    process.exit(1);
  }

  // 8. Graceful Shutdown
  const shutdown = async (signal: string) => {
    console.info(`Received ${signal}. Gracefully stopping FairLance service...`);
    indexerService.stop();
    deadlineMonitorCron.stop();
    await app.close();
    await disconnectDatabase();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

bootstrap().catch((err) => {
  console.error('Unhandled fatal error in bootstrap:', err);
  process.exit(1);
});
