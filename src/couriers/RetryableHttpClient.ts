import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, isAxiosError } from 'axios';

export interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryable(error: unknown): boolean {
  if (!isAxiosError(error)) return false;
  if (!error.response) return true; // network error / timeout
  return error.response.status >= 500;
}

/**
 * Thin axios wrapper applying configurable exponential backoff to 5xx/timeout/network
 * failures only — 4xx responses are returned as-is so adapters can map courier errors
 * without them being masked by retries.
 */
export class RetryableHttpClient {
  private readonly http: AxiosInstance;

  constructor(
    baseURL: string,
    timeoutMs: number,
    private readonly retryConfig: RetryConfig,
  ) {
    this.http = axios.create({ baseURL, timeout: timeoutMs });
  }

  async request<T = unknown>(config: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    let attempt = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        return await this.http.request<T>(config);
      } catch (error) {
        attempt += 1;
        const exhausted = attempt >= this.retryConfig.maxAttempts;
        if (!isRetryable(error) || exhausted) {
          throw error;
        }
        const delay = this.retryConfig.baseDelayMs * 2 ** (attempt - 1);
        await sleep(delay);
      }
    }
  }
}
