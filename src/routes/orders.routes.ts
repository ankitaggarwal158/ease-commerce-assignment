import { Router } from 'express';
import { validate } from '../middleware/validate';
import { createOrderSchema, bulkCreateOrderSchema } from '../dto/order.dto';
import { createOrderHandler, trackOrderHandler, cancelOrderHandler } from '../controllers/orders.controller';
import { createBulkHandler, getBulkStatusHandler } from '../controllers/bulk.controller';

export const ordersRouter = Router();

ordersRouter.post('/bulk', validate(bulkCreateOrderSchema), createBulkHandler);
ordersRouter.get('/bulk/:batchId', getBulkStatusHandler);

ordersRouter.post('/', validate(createOrderSchema), createOrderHandler);
ordersRouter.get('/:orderId/track', trackOrderHandler);
ordersRouter.post('/:orderId/cancel', cancelOrderHandler);
