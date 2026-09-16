export type ShipmentStatus =
  | 'CREATED'
  | 'PICKED_UP'
  | 'IN_TRANSIT'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'FAILED';

/** Our own internal, courier-agnostic representation — never the courier's raw shape. */
export interface NormalizedOrderInput {
  orderId: string;
  consignee: {
    name: string;
    phone: string;
    addressLine1: string;
    addressLine2?: string;
    city: string;
    state: string;
    pincode: string;
  };
  pickup: {
    name: string;
    phone: string;
    addressLine1: string;
    addressLine2?: string;
    city: string;
    state: string;
    pincode: string;
  };
  package: {
    weightKg: number;
    lengthCm?: number;
    widthCm?: number;
    heightCm?: number;
    description?: string;
  };
  payment: {
    mode: 'PREPAID' | 'COD';
    codAmount?: number;
  };
}

export interface CreateShipmentResult {
  courierOrderId: string;
  awbNumber: string;
  status: ShipmentStatus;
  rawRequest: unknown;
  rawResponse: unknown;
}

export interface TrackShipmentResult {
  status: ShipmentStatus;
  rawResponse: unknown;
}

export interface CancelShipmentResult {
  status: ShipmentStatus;
  rawResponse: unknown;
}

/**
 * Contract every courier integration must implement. Adding a new courier means
 * writing one class implementing this interface and registering it in
 * courierRegistry.ts — no other file in the system changes (assignment 3.2).
 */
export interface CourierAdapter {
  readonly partnerKey: string;

  createShipment(order: NormalizedOrderInput): Promise<CreateShipmentResult>;
  trackShipment(courierOrderId: string, awbNumber: string): Promise<TrackShipmentResult>;
  cancelShipment(courierOrderId: string, awbNumber: string): Promise<CancelShipmentResult>;
}
