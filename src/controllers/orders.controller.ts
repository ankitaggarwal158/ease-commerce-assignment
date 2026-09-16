import { NextFunction, Request, Response } from 'express';
import { createOrder, trackOrder, cancelOrder } from '../services/orders.service';
import { serializeOrder } from '../utils/serializeOrder';
import { CreateOrderDto } from '../dto/order.dto';

export async function createOrderHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { order, created } = await createOrder(req.body as CreateOrderDto, req.requestId);
    res.status(created ? 201 : 200).json(serializeOrder(order));
  } catch (error) {
    next(error);
  }
}

export async function trackOrderHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const order = await trackOrder(req.params.orderId, req.requestId);
    res.status(200).json(serializeOrder(order));
  } catch (error) {
    next(error);
  }
}

export async function cancelOrderHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const order = await cancelOrder(req.params.orderId, req.requestId);
    res.status(200).json(serializeOrder(order));
  } catch (error) {
    next(error);
  }
}
