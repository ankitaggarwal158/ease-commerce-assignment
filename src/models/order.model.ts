import { Schema, model } from 'mongoose';

export const SHIPMENT_STATUSES = [
  'CREATED',
  'PICKED_UP',
  'IN_TRANSIT',
  'DELIVERED',
  'CANCELLED',
  'FAILED',
] as const;

export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

export interface LastError {
  message: string;
  code?: string;
  raw?: unknown;
  occurredAt: Date;
}

export interface OrderDocument {
  orderId: string;
  courierPartner: string;
  courierOrderId?: string;
  awbNumber?: string;
  status: ShipmentStatus;
  requestPayload?: unknown;
  responsePayload?: unknown;
  lastError?: LastError;
  createdAt: Date;
  updatedAt: Date;
}

const lastErrorSchema = new Schema<LastError>(
  {
    message: { type: String, required: true },
    code: String,
    raw: Schema.Types.Mixed,
    occurredAt: { type: Date, required: true },
  },
  { _id: false },
);

const orderSchema = new Schema<OrderDocument>(
  {
    orderId: { type: String, required: true, unique: true },
    courierPartner: { type: String, required: true },
    courierOrderId: String,
    awbNumber: String,
    status: { type: String, enum: SHIPMENT_STATUSES, required: true, default: 'CREATED' },
    requestPayload: Schema.Types.Mixed,
    responsePayload: Schema.Types.Mixed,
    lastError: lastErrorSchema,
  },
  { timestamps: true },
);

export const OrderModel = model<OrderDocument>('Order', orderSchema);
