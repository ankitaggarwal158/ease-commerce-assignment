import { OrderDocument } from '../models/order.model';

// Shapes the DB document into the courier-agnostic response consumers see and keeps raw payloads stay internal.
export function serializeOrder(order: OrderDocument) {
  return {
    orderId: order.orderId,
    courierPartner: order.courierPartner,
    courierOrderId: order.courierOrderId,
    awbNumber: order.awbNumber,
    status: order.status,
    lastError: order.lastError,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}
