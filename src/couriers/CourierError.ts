/**
 * Internal error thrown by any courier adapter. Carries the raw courier response for
 * persistence/audit (Order.lastError) while `code` is what gets translated into the
 * client-facing normalized error — the raw payload is never sent to the client directly.
 */
export class CourierError extends Error {
  constructor(
    readonly courierPartner: string,
    readonly code: 'COURIER_REJECTED_REQUEST' | 'COURIER_AUTH_FAILED' | 'COURIER_UPSTREAM_ERROR',
    message: string,
    readonly rawResponse: unknown,
    readonly rawRequest?: unknown,
  ) {
    super(message);
    this.name = 'CourierError';
  }
}
