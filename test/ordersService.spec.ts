import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createOrder, trackOrder, cancelOrder } from '../src/services/orders.service';
import { OrderModel } from '../src/models/order.model';
import { TrackingEventModel } from '../src/models/trackingEvent.model';
import { AppError } from '../src/utils/AppError';
import { CreateOrderDto } from '../src/dto/order.dto';

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  await Promise.all([OrderModel.deleteMany({}), TrackingEventModel.deleteMany({})]);
});

function buildDto(orderId: string, courierPartner = 'mockcourier'): CreateOrderDto {
  return {
    orderId,
    courierPartner,
    consignee: { name: 'A', phone: '9000000001', addressLine1: 'X', city: 'C', state: 'S', pincode: '110001' },
    pickup: { name: 'W', phone: '9000000002', addressLine1: 'Y', city: 'C', state: 'S', pincode: '110002' },
    package: { weightKg: 1 },
    payment: { mode: 'PREPAID' },
  };
}

describe('orders.service', () => {
  it('creates a shipment via the resolved courier adapter and appends a CREATED tracking event', async () => {
    const { order, created } = await createOrder(buildDto('SVC-1'));

    expect(created).toBe(true);
    expect(order.status).toBe('CREATED');
    expect(order.awbNumber).toBeDefined();

    const events = await TrackingEventModel.find({ orderId: 'SVC-1' });
    expect(events).toHaveLength(1);
    expect(events[0].status).toBe('CREATED');
  });

  it('is idempotent on orderId \u2014 resubmitting does not create a duplicate shipment', async () => {
    const first = await createOrder(buildDto('SVC-2'));
    const second = await createOrder(buildDto('SVC-2'));

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.order.awbNumber).toBe(first.order.awbNumber);
    await expect(OrderModel.countDocuments({ orderId: 'SVC-2' })).resolves.toBe(1);
  });

  it('rejects an unknown courier_partner with a 400 listing supported couriers', async () => {
    await expect(createOrder(buildDto('SVC-3', 'delhivery'))).rejects.toMatchObject({
      statusCode: 400,
      code: 'UNKNOWN_COURIER_PARTNER',
    });
  });

  it('tracks a shipment and only appends a tracking event when the status actually changes', async () => {
    const { order } = await createOrder(buildDto('SVC-4'));
    const tracked = await trackOrder(order.orderId);

    expect(tracked.status).toBe('CREATED'); // MockCourierAdapter: freshly created, no progression yet
    await expect(TrackingEventModel.countDocuments({ orderId: 'SVC-4' })).resolves.toBe(1);
  });

  it('throws a 404 AppError when tracking/cancelling an unknown orderId', async () => {
    await expect(trackOrder('NOPE')).rejects.toThrow(AppError);
    await expect(cancelOrder('NOPE')).rejects.toMatchObject({ statusCode: 404, code: 'ORDER_NOT_FOUND' });
  });

  it('cancels a shipment and appends a CANCELLED tracking event', async () => {
    const { order } = await createOrder(buildDto('SVC-5'));
    const cancelled = await cancelOrder(order.orderId);

    expect(cancelled.status).toBe('CANCELLED');
    const events = await TrackingEventModel.find({ orderId: 'SVC-5' }).sort({ createdAt: 1 });
    expect(events.map((e) => e.status)).toEqual(['CREATED', 'CANCELLED']);
  });

  it('is idempotent on cancel \u2014 cancelling an already-cancelled order is a no-op', async () => {
    const { order } = await createOrder(buildDto('SVC-6'));
    await cancelOrder(order.orderId);
    const secondCancel = await cancelOrder(order.orderId);

    expect(secondCancel.status).toBe('CANCELLED');
    await expect(TrackingEventModel.countDocuments({ orderId: 'SVC-6' })).resolves.toBe(2); // CREATED + CANCELLED, not a duplicate CANCELLED
  });
});
