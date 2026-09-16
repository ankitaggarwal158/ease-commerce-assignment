import { CourierRegistry } from '../src/couriers/courierRegistry';
import { CourierAdapter, NormalizedOrderInput } from '../src/couriers/interfaces/courier-adapter.interface';
import { AppError } from '../src/utils/AppError';

function fakeAdapter(partnerKey: string): CourierAdapter {
  return {
    partnerKey,
    createShipment: async (_order: NormalizedOrderInput) => ({
      courierOrderId: 'x',
      awbNumber: 'y',
      status: 'CREATED',
      rawRequest: {},
      rawResponse: {},
    }),
    trackShipment: async () => ({ status: 'CREATED', rawResponse: {} }),
    cancelShipment: async () => ({ status: 'CANCELLED', rawResponse: {} }),
  };
}

describe('CourierRegistry', () => {
  it('resolves a registered adapter by its partner key', () => {
    const registry = new CourierRegistry();
    const adapter = fakeAdapter('urbanebolt');
    registry.register(adapter);

    expect(registry.resolve('urbanebolt')).toBe(adapter);
  });

  it('throws a 400 AppError listing supported couriers for an unknown partner', () => {
    const registry = new CourierRegistry();
    registry.register(fakeAdapter('urbanebolt'));
    registry.register(fakeAdapter('mockcourier'));

    try {
      registry.resolve('delhivery');
      throw new Error('expected resolve() to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      const appError = error as AppError;
      expect(appError.statusCode).toBe(400);
      expect(appError.code).toBe('UNKNOWN_COURIER_PARTNER');
      expect(appError.details).toEqual({ supportedCouriers: ['urbanebolt', 'mockcourier'] });
    }
  });
});
