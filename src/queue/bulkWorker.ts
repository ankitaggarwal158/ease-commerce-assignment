import { Worker, Job } from 'bullmq';
import { redisConnection } from './connection';
import { BULK_QUEUE_NAME, BulkOrderJobData } from './bulkQueue';
import { appConfig } from '../config';
import { createOrder } from '../services/orders.service';
import { BatchJobModel } from '../models/batchJob.model';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';

async function markItem(batchId: string, orderId: string, status: 'SUCCEEDED' | 'FAILED', reason?: string) {
  await BatchJobModel.updateOne(
    { batchId, 'items.orderId': orderId },
    { $set: { 'items.$.status': status, 'items.$.reason': reason } },
  );
}

async function processJob(job: Job<BulkOrderJobData>): Promise<void> {
  const { batchId, dto } = job.data;
  try {
    await createOrder(dto);
    await markItem(batchId, dto.orderId, 'SUCCEEDED');
  } catch (error) {
    const reason = error instanceof AppError ? error.message : 'Unexpected error while processing order';
    logger.error(
      { orderId: dto.orderId, courierPartner: dto.courierPartner, batchId, errorType: error instanceof AppError ? error.code : 'UNKNOWN' },
      reason,
    );
    await markItem(batchId, dto.orderId, 'FAILED', reason);
  }
}

export function startBulkWorker(): Worker<BulkOrderJobData> {
  return new Worker<BulkOrderJobData>(BULK_QUEUE_NAME, processJob, {
    connection: redisConnection,
    concurrency: appConfig.bulk.workerConcurrency,
  });
}
