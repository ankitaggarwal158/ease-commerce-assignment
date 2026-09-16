import 'dotenv/config';
import { createApp } from './app';
import { appConfig } from './config';
import { logger } from './utils/logger';
import { connectMongo } from './db/mongoose';
import { startBulkWorker } from './queue/bulkWorker';

async function bootstrap(): Promise<void> {
  await connectMongo();
  startBulkWorker();

  const app = createApp();
  app.listen(appConfig.port, () => {
    logger.info(`Server listening on port ${appConfig.port} (${appConfig.nodeEnv})`);
  });
}

bootstrap().catch((error) => {
  logger.error({ err: error }, 'Failed to start server');
  process.exit(1);
});
