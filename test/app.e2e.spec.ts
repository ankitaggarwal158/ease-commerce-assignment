import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { createApp } from '../src/app';
import { bulkQueue } from '../src/queue/bulkQueue';
import { redisConnection } from '../src/queue/connection';

const API_KEY = process.env.INTERNAL_API_KEY as string;
const app = createApp();

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
  await bulkQueue.close();
  redisConnection.disconnect();
});

function samplePayload(orderId: string, courierPartner = 'mockcourier') {
  return {
    orderId,
    courierPartner,
    consignee: { name: 'A', phone: '9000000001', addressLine1: 'X', city: 'C', state: 'S', pincode: '110001' },
    pickup: { name: 'W', phone: '9000000002', addressLine1: 'Y', city: 'C', state: 'S', pincode: '110002' },
    package: { weightKg: 1 },
    payment: { mode: 'PREPAID' },
  };
}

describe('unified API (e2e)', () => {
  it('GET /health returns 200 without requiring an API key', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('rejects /api/v1/* requests without a valid API key', async () => {
    const res = await request(app).post('/api/v1/orders').send(samplePayload('E2E-NOKEY'));
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('creates, tracks, and cancels an order end-to-end', async () => {
    const created = await request(app)
      .post('/api/v1/orders')
      .set('x-api-key', API_KEY)
      .send(samplePayload('E2E-1'));
    expect(created.status).toBe(201);
    expect(created.body.status).toBe('CREATED');

    const tracked = await request(app).get('/api/v1/orders/E2E-1/track').set('x-api-key', API_KEY);
    expect(tracked.status).toBe(200);
    expect(tracked.body.orderId).toBe('E2E-1');

    const cancelled = await request(app).post('/api/v1/orders/E2E-1/cancel').set('x-api-key', API_KEY);
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.status).toBe('CANCELLED');
  });

  it('is idempotent on orderId resubmission (200, not 201, no duplicate)', async () => {
    await request(app).post('/api/v1/orders').set('x-api-key', API_KEY).send(samplePayload('E2E-2'));
    const resubmit = await request(app)
      .post('/api/v1/orders')
      .set('x-api-key', API_KEY)
      .send(samplePayload('E2E-2'));
    expect(resubmit.status).toBe(200);
  });

  it('returns 400 with supported couriers for an unknown courier_partner', async () => {
    const res = await request(app)
      .post('/api/v1/orders')
      .set('x-api-key', API_KEY)
      .send(samplePayload('E2E-3', 'delhivery'));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('UNKNOWN_COURIER_PARTNER');
    expect(res.body.error.details.supportedCouriers).toEqual(expect.arrayContaining(['urbanebolt', 'mockcourier']));
  });

  it('returns 400 with field-level errors for an invalid payload', async () => {
    const res = await request(app).post('/api/v1/orders').set('x-api-key', API_KEY).send({ orderId: 'E2E-4' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(Array.isArray(res.body.error.details)).toBe(true);
  });

  it('returns 404 for tracking an unknown order', async () => {
    const res = await request(app).get('/api/v1/orders/UNKNOWN/track').set('x-api-key', API_KEY);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('ORDER_NOT_FOUND');
  });
});
