import { CourierRegistry } from './courierRegistry';
import { UrbaneBoltAdapter } from './adapters/urbanebolt/urbanebolt.adapter';
import { MockCourierAdapter } from './adapters/mock/mock-courier.adapter';

// Composition root: the only place new courier adapters need to be registered.
export const courierRegistry = new CourierRegistry();
courierRegistry.register(new UrbaneBoltAdapter());
courierRegistry.register(new MockCourierAdapter());

export { CourierRegistry } from './courierRegistry';
export { CourierError } from './CourierError';
export { courierErrorToAppError } from './courierErrorToAppError';
export * from './interfaces/courier-adapter.interface';
