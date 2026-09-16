import { AppError } from '../utils/AppError';
import { CourierError } from './CourierError';

// Translates an internal CourierError into the client-facing normalized error and never leaks the raw courier payload.
export function courierErrorToAppError(error: CourierError): AppError {
  switch (error.code) {
    case 'COURIER_REJECTED_REQUEST':
      return AppError.badRequest('COURIER_REJECTED_ORDER', 'The courier rejected this request');
    case 'COURIER_AUTH_FAILED':
      return AppError.badGateway('COURIER_AUTH_FAILED', 'Could not authenticate with the courier');
    case 'COURIER_UPSTREAM_ERROR':
    default:
      return AppError.badGateway('COURIER_UNAVAILABLE', 'The courier service is currently unavailable');
  }
}
