import { Schema, model } from 'mongoose';

export const BATCH_ITEM_STATUSES = ['PENDING', 'SUCCEEDED', 'FAILED'] as const;
export type BatchItemStatus = (typeof BATCH_ITEM_STATUSES)[number];

export interface BatchItem {
  orderId: string;
  courierPartner: string;
  status: BatchItemStatus;
  reason?: string;
}

export interface BatchJobDocument {
  batchId: string;
  items: BatchItem[];
  createdAt: Date;
  updatedAt: Date;
}

const batchItemSchema = new Schema<BatchItem>(
  {
    orderId: { type: String, required: true },
    courierPartner: { type: String, required: true },
    status: { type: String, enum: BATCH_ITEM_STATUSES, required: true, default: 'PENDING' },
    reason: String,
  },
  { _id: false },
);

const batchJobSchema = new Schema<BatchJobDocument>(
  {
    batchId: { type: String, required: true, unique: true },
    items: { type: [batchItemSchema], required: true },
  },
  { timestamps: true },
);

export const BatchJobModel = model<BatchJobDocument>('BatchJob', batchJobSchema);
