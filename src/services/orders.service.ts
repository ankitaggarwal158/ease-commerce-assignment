import { CreateOrderDto } from '../dto/order.dto';
import { courierRegistry, CourierError, courierErrorToAppError } from '../couriers';
import { NormalizedOrderInput } from '../couriers/interfaces/courier-adapter.interface';
import { OrderModel, OrderDocument } from '../models/order.model';
import { TrackingEventModel } from '../models/trackingEvent.model';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';

// Single place every courier failure is logged with the fields assignment.
function logCourierFailure(orderId: string, error: CourierError, requestId?: string): void {
  logger.error(
    { orderId, courierPartner: error.courierPartner, errorType: error.code, requestId, stack: error.stack },
    error.message,
  );
}

function toNormalizedOrder(dto: CreateOrderDto): NormalizedOrderInput {
  return {
    orderId: dto.orderId,
    consignee: dto.consignee,
    pickup: dto.pickup,
    package: dto.package,
    payment: dto.payment,
  };
}

export async function createOrder(
  dto: CreateOrderDto,
  requestId?: string,
): Promise<{ order: OrderDocument; created: boolean }> {
  const existing = await OrderModel.findOne({ orderId: dto.orderId });
  if (existing) {
    return { order: existing, created: false };
  }

  const adapter = courierRegistry.resolve(dto.courierPartner);
  const normalized = toNormalizedOrder(dto);

  try {
    const result = await adapter.createShipment(normalized);
    const order = await OrderModel.create({
      orderId: dto.orderId,
      courierPartner: dto.courierPartner,
      courierOrderId: result.courierOrderId,
      awbNumber: result.awbNumber,
      status: result.status,
      requestPayload: result.rawRequest,
      responsePayload: result.rawResponse,
    });
    await TrackingEventModel.create({ orderId: dto.orderId, status: result.status, rawPayload: result.rawResponse });
    return { order, created: true };
  } catch (error) {
    if (error instanceof CourierError) {
      await OrderModel.create({
        orderId: dto.orderId,
        courierPartner: dto.courierPartner,
        status: 'FAILED',
        requestPayload: error.rawRequest,
        lastError: { message: error.message, code: error.code, raw: error.rawResponse, occurredAt: new Date() },
      });
      await TrackingEventModel.create({
        orderId: dto.orderId,
        status: 'FAILED',
        rawPayload: error.rawResponse,
      });
      logCourierFailure(dto.orderId, error, requestId);
      throw courierErrorToAppError(error);
    }
    throw error;
  }
}

export async function trackOrder(orderId: string, requestId?: string): Promise<OrderDocument> {
  const order = await OrderModel.findOne({ orderId });
  if (!order) {
    throw AppError.notFound('ORDER_NOT_FOUND', `No order found with id "${orderId}"`);
  }

  const adapter = courierRegistry.resolve(order.courierPartner);

  try {
    const result = await adapter.trackShipment(order.courierOrderId ?? '', order.awbNumber ?? '');
    if (result.status !== order.status) {
      order.status = result.status;
      await order.save();
      await TrackingEventModel.create({ orderId, status: result.status, rawPayload: result.rawResponse });
    }
    return order;
  } catch (error) {
    // A transient failure to reach the courier for a status check must NOT overwrite the
    // last known shipment status. Only shipment-creation failures set status to FAILED.
    if (error instanceof CourierError) {
      order.lastError = { message: error.message, code: error.code, raw: error.rawResponse, occurredAt: new Date() };
      await order.save();
      logCourierFailure(orderId, error, requestId);
      throw courierErrorToAppError(error);
    }
    throw error;
  }
}

export async function cancelOrder(orderId: string, requestId?: string): Promise<OrderDocument> {
  const order = await OrderModel.findOne({ orderId });
  if (!order) {
    throw AppError.notFound('ORDER_NOT_FOUND', `No order found with id "${orderId}"`);
  }

  if (order.status === 'CANCELLED') {
    return order; // idempotent: already cancelled, no need to call the courier again
  }

  const adapter = courierRegistry.resolve(order.courierPartner);

  try {
    const result = await adapter.cancelShipment(order.courierOrderId ?? '', order.awbNumber ?? '');
    order.status = result.status;
    await order.save();
    await TrackingEventModel.create({ orderId, status: result.status, rawPayload: result.rawResponse });
    return order;
  } catch (error) {
    if (error instanceof CourierError) {
      order.lastError = { message: error.message, code: error.code, raw: error.rawResponse, occurredAt: new Date() };
      await order.save();
      logCourierFailure(orderId, error, requestId);
      throw courierErrorToAppError(error);
    }
    throw error;
  }
}
