import { MockCourierAdapter } from '../src/couriers/adapters/mock/mock-courier.adapter';
import { NormalizedOrderInput } from '../src/couriers/interfaces/courier-adapter.interface';

const sampleOrder: NormalizedOrderInput = {
  orderId: 'ORDER-1',
  consignee: { name: 'A', phone: '9999999999', addressLine1: 'Addr', city: 'City', state: 'State', pincode: '110001' },
  pickup: { name: 'B', phone: '8888888888', addressLine1: 'Addr', city: 'City', state: 'State', pincode: '110002' },
  package: { weightKg: 1 },
  payment: { mode: 'PREPAID' },
};

describe('MockCourierAdapter', () => {
  it('creates a shipment and reports it as CREATED', async () => {
    const adapter = new MockCourierAdapter();
    const result = await adapter.createShipment(sampleOrder);

    expect(result.status).toBe('CREATED');
    expect(result.courierOrderId).toMatch(/^MOCK-/);
    expect(result.awbNumber).toMatch(/^AWB/);
  });

  it('cancels a shipment and reflects CANCELLED on subsequent tracking', async () => {
    const adapter = new MockCourierAdapter();
    const created = await adapter.createShipment(sampleOrder);

    await adapter.cancelShipment(created.courierOrderId, created.awbNumber);
    const tracked = await adapter.trackShipment(created.courierOrderId, created.awbNumber);

    expect(tracked.status).toBe('CANCELLED');
  });

  it('rejects tracking an unknown AWB', async () => {
    const adapter = new MockCourierAdapter();
    await expect(adapter.trackShipment('unknown', 'AWB000')).rejects.toThrow('Unknown AWB');
  });
});
