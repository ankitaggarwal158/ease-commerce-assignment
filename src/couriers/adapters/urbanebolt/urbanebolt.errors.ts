import { isAxiosError } from 'axios';
import { CourierError } from '../../CourierError';

export function mapUrbaneBoltError(error: unknown, rawRequest?: unknown): CourierError {
  if (!isAxiosError(error)) {
    return new CourierError('urbanebolt', 'COURIER_UPSTREAM_ERROR', 'UrbaneBolt request failed', undefined, rawRequest);
  }

  const status = error.response?.status;
  const rawResponse = error.response?.data;

  if (status === 401 || status === 403) {
    return new CourierError('urbanebolt', 'COURIER_AUTH_FAILED', 'UrbaneBolt authentication failed', rawResponse, rawRequest);
  }
  if (status && status >= 400 && status < 500) {
    return new CourierError('urbanebolt', 'COURIER_REJECTED_REQUEST', 'UrbaneBolt rejected the request', rawResponse, rawRequest);
  }
  return new CourierError('urbanebolt', 'COURIER_UPSTREAM_ERROR', 'UrbaneBolt is currently unavailable', rawResponse, rawRequest);
}
