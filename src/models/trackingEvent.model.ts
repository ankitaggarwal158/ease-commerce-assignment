import { Schema, model } from 'mongoose';
import { SHIPMENT_STATUSES, ShipmentStatus } from './order.model';

export interface TrackingEventDocument {
  orderId: string;
  status: ShipmentStatus;
  rawPayload?: unknown;
  createdAt: Date;
}

// Append-only: no update/delete operations should ever be performed on this collection.
const trackingEventSchema = new Schema<TrackingEventDocument>(
  {
    orderId: { type: String, required: true, index: true },
    status: { type: String, enum: SHIPMENT_STATUSES, required: true },
    rawPayload: Schema.Types.Mixed,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

trackingEventSchema.index({ orderId: 1, createdAt: 1 });

export const TrackingEventModel = model<TrackingEventDocument>('TrackingEvent', trackingEventSchema);
