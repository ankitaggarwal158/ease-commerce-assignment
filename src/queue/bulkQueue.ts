import { Queue } from 'bullmq';
import { redisConnection } from './connection';
import { CreateOrderDto } from '../dto/order.dto';

export interface BulkOrderJobData {
  batchId: string;
  dto: CreateOrderDto;
}

export const BULK_QUEUE_NAME = 'bulk-orders';

export const bulkQueue = new Queue<BulkOrderJobData>(BULK_QUEUE_NAME, { connection: redisConnection });
