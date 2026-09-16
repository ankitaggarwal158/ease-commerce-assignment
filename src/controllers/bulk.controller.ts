import { NextFunction, Request, Response } from 'express';
import { createBulkBatch, getBatchStatus } from '../services/bulk.service';
import { BulkCreateOrderDto } from '../dto/order.dto';

export async function createBulkHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { batchId, totalOrders } = await createBulkBatch(req.body as BulkCreateOrderDto);
    res.status(202).json({ batchId, totalOrders, status: 'PROCESSING' });
  } catch (error) {
    next(error);
  }
}

export async function getBulkStatusHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const summary = await getBatchStatus(req.params.batchId);
    res.status(200).json(summary);
  } catch (error) {
    next(error);
  }
}
