import { CourierAdapter } from './interfaces/courier-adapter.interface';
import { AppError } from '../utils/AppError';

/**
 * Resolves a CourierAdapter by its courier_partner key. This is the single point
 * consumers/services go through. They never import a concrete adapter directly,
 * which is what lets new couriers be added without touching controllers/services.
 */
export class CourierRegistry {
  private readonly adapters = new Map<string, CourierAdapter>();

  register(adapter: CourierAdapter): void {
    this.adapters.set(adapter.partnerKey, adapter);
  }

  resolve(partnerKey: string): CourierAdapter {
    const adapter = this.adapters.get(partnerKey);
    if (!adapter) {
      throw AppError.badRequest(
        'UNKNOWN_COURIER_PARTNER',
        `Unknown courier_partner "${partnerKey}"`,
        { supportedCouriers: this.listPartnerKeys() },
      );
    }
    return adapter;
  }

  listPartnerKeys(): string[] {
    return Array.from(this.adapters.keys());
  }
}
