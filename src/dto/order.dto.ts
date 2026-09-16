import { z } from 'zod';
import { appConfig } from '../config';

const addressSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(6),
  addressLine1: z.string().min(1),
  addressLine2: z.string().optional(),
  city: z.string().min(1),
  state: z.string().min(1),
  pincode: z.string().min(3),
});

const packageSchema = z.object({
  weightKg: z.number().positive(),
  lengthCm: z.number().positive().optional(),
  widthCm: z.number().positive().optional(),
  heightCm: z.number().positive().optional(),
  description: z.string().optional(),
});

const paymentSchema = z.object({
  mode: z.enum(['PREPAID', 'COD']),
  codAmount: z.number().nonnegative().optional(),
});

export const createOrderSchema = z.object({
  orderId: z.string().min(1),
  courierPartner: z.string().min(1),
  consignee: addressSchema,
  pickup: addressSchema,
  package: packageSchema,
  payment: paymentSchema,
});

export type CreateOrderDto = z.infer<typeof createOrderSchema>;

export const bulkCreateOrderSchema = z.object({
  orders: z.array(createOrderSchema).min(1).max(appConfig.bulk.maxOrders),
});

export type BulkCreateOrderDto = z.infer<typeof bulkCreateOrderSchema>;
