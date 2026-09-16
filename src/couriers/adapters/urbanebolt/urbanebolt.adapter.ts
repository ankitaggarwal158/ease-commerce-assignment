import { AxiosRequestConfig, isAxiosError } from 'axios';
import { RetryableHttpClient } from '../../RetryableHttpClient';
import { loadUrbaneBoltConfig } from './urbanebolt.config';
import { fromManifestResponse, mapUrbaneBoltStatus, toManifestRequest } from './urbanebolt.mapper';
import { mapUrbaneBoltError } from './urbanebolt.errors';
import {
  CancelShipmentResult,
  CourierAdapter,
  CreateShipmentResult,
  NormalizedOrderInput,
  TrackShipmentResult,
} from '../../interfaces/courier-adapter.interface';

/**
 * UrbaneBolt integration. Endpoint paths for Manifest/Tracking/Cancellation are inferred from
 * the documented naming convention (getToken: /api/v1/auth/getToken/, Pincode: /api/v1/location/pincodes/)
 * since the full schema for these three endpoints wasn't retrievable at plan time (UAT was down) — confirm against the live Postman collection before real integration testing.
 */
export class UrbaneBoltAdapter implements CourierAdapter {
  readonly partnerKey = 'urbanebolt';

  private readonly http: RetryableHttpClient;
  private readonly config = loadUrbaneBoltConfig();
  private token: string | null = null;

  constructor() {
    this.http = new RetryableHttpClient(this.config.BASE_URL, this.config.TIMEOUT_MS, {
      maxAttempts: this.config.RETRY_MAX_ATTEMPTS,
      baseDelayMs: this.config.RETRY_BASE_DELAY_MS,
    });
  }

  async createShipment(order: NormalizedOrderInput): Promise<CreateShipmentResult> {
    const payload = toManifestRequest(order);
    try {
      const response = await this.requestWithAuth({
        method: 'POST',
        url: '/api/v1/manifest/',
        data: payload,
      });
      const mapped = fromManifestResponse(response.data);
      return { ...mapped, rawRequest: payload, rawResponse: response.data };
    } catch (error) {
      throw mapUrbaneBoltError(error, payload);
    }
  }

  async trackShipment(courierOrderId: string, awbNumber: string): Promise<TrackShipmentResult> {
    try {
      const response = await this.requestWithAuth<{ status?: string }>({
        method: 'GET',
        url: '/api/v1/tracking/',
        params: { awb: awbNumber, order_id: courierOrderId },
      });
      return { status: mapUrbaneBoltStatus(response.data?.status), rawResponse: response.data };
    } catch (error) {
      throw mapUrbaneBoltError(error);
    }
  }

  async cancelShipment(courierOrderId: string, awbNumber: string): Promise<CancelShipmentResult> {
    try {
      const response = await this.requestWithAuth({
        method: 'POST',
        url: '/api/v1/cancellation/',
        data: { awb: awbNumber, order_id: courierOrderId },
      });
      return { status: 'CANCELLED', rawResponse: response.data };
    } catch (error) {
      throw mapUrbaneBoltError(error);
    }
  }

  /** Ensures a cached token, attaches it, and retries exactly once after a fresh re-auth on 401. */
  private async requestWithAuth<T = unknown>(config: AxiosRequestConfig) {
    if (!this.token) {
      this.token = await this.authenticate();
    }

    try {
      return await this.http.request<T>({ ...config, headers: { ...config.headers, Authorization: `Bearer ${this.token}` } });
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 401) {
        this.token = await this.authenticate();
        return this.http.request<T>({ ...config, headers: { ...config.headers, Authorization: `Bearer ${this.token}` } });
      }
      throw error;
    }
  }

  private async authenticate(): Promise<string> {
    const response = await this.http.request({
      method: 'POST',
      url: '/api/v1/auth/getToken/',
      data: { username: this.config.USERNAME, password: this.config.PASSWORD },
    });
    const data = response.data as Record<string, unknown> | undefined;
    const token = (data?.token ?? data?.access_token ?? data?.jwt) as string | undefined;
    if (!token) {
      throw new Error('UrbaneBolt getToken response did not contain a recognizable token field');
    }
    return token;
  }
}
