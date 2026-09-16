import { randomUUID } from 'crypto';
import { BulkCreateOrderDto } from '../dto/order.dto';
import { BatchJobModel, BatchJobDocument } from '../models/batchJob.model';
import { AppError } from '../utils/AppError';
import { BULK_QUEUE_NAME, bulkQueue } from '../queue/bulkQueue';

export async function createBulkBatch(dto: BulkCreateOrderDto): Promise<{ batchId: string; totalOrders: number }> {
  const batchId = randomUUID();

  await BatchJobModel.create({
    batchId,
    items: dto.orders.map((order) => ({
      orderId: order.orderId,
      courierPartner: order.courierPartner,
      status: 'PENDING',
    })),
  });

  // jobId = orderId dedupes retries/resubmissions at the queue level; the Order model's
  // unique index on orderId is the permanent, DB-level backstop for the same guarantee.
  await Promise.all(
    dto.orders.map((order) =>
      bulkQueue.add(
        BULK_QUEUE_NAME,
        { batchId, dto: order },
        { jobId: order.orderId, attempts: 1 },
      ),
    ),
  );

  return { batchId, totalOrders: dto.orders.length };
}

export function summarizeBatch(batch: BatchJobDocument) {
  const total = batch.items.length;
  const succeeded = batch.items.filter((item) => item.status === 'SUCCEEDED').length;
  const failed = batch.items.filter((item) => item.status === 'FAILED').length;
  const pending = total - succeeded - failed;

  return {
    batchId: batch.batchId,
    status: pending > 0 ? 'PROCESSING' : 'COMPLETED',
    totals: { total, succeeded, failed, pending },
    items: batch.items,
  };
}

export async function getBatchStatus(batchId: string) {
  const batch = await BatchJobModel.findOne({ batchId });
  if (!batch) {
    throw AppError.notFound('BATCH_NOT_FOUND', `No batch found with id "${batchId}"`);
  }
  return summarizeBatch(batch);
}
