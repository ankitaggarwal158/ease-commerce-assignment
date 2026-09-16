import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { OrderModel } from '../src/models/order.model';
import { TrackingEventModel } from '../src/models/trackingEvent.model';
import { BatchJobModel } from '../src/models/batchJob.model';

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
  await Promise.all([OrderModel.deleteMany({}), TrackingEventModel.deleteMany({}), BatchJobModel.deleteMany({})]);
});

describe('Order model', () => {
  it('enforces a unique index on orderId (idempotency)', async () => {
    await OrderModel.create({ orderId: 'ORDER-1', courierPartner: 'mockcourier', status: 'CREATED' });
    await expect(
      OrderModel.create({ orderId: 'ORDER-1', courierPartner: 'mockcourier', status: 'CREATED' }),
    ).rejects.toThrow(/duplicate key/);
  });
});

describe('TrackingEvent model', () => {
  it('stores append-only status events with raw payload', async () => {
    const event = await TrackingEventModel.create({
      orderId: 'ORDER-1',
      status: 'PICKED_UP',
      rawPayload: { foo: 'bar' },
    });
    expect(event.createdAt).toBeInstanceOf(Date);
    expect(event.rawPayload).toEqual({ foo: 'bar' });
  });
});

describe('BatchJob model', () => {
  it('enforces a unique index on batchId', async () => {
    await BatchJobModel.create({ batchId: 'BATCH-1', items: [] });
    await expect(BatchJobModel.create({ batchId: 'BATCH-1', items: [] })).rejects.toThrow(/duplicate key/);
  });
});
