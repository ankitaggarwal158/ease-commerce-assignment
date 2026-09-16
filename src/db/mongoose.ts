import mongoose from 'mongoose';
import { appConfig } from '../config';
import { logger } from '../utils/logger';

export async function connectMongo(): Promise<void> {
  mongoose.connection.on('error', (error) => {
    logger.error({ err: error }, 'MongoDB connection error');
  });

  await mongoose.connect(appConfig.mongoUri);
  logger.info('Connected to MongoDB');
}
