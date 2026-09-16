import { randomUUID } from 'crypto';
import {
  CancelShipmentResult,
  CourierAdapter,
  CreateShipmentResult,
  NormalizedOrderInput,
  ShipmentStatus,
  TrackShipmentResult,
} from '../../interfaces/courier-adapter.interface';
import { CourierError } from '../../CourierError';

interface SimulatedShipment {
  status: ShipmentStatus;
  createdAt: number;
}

const PROGRESSION: { afterMs: number; status: ShipmentStatus }[] = [
  { afterMs: 0, status: 'CREATED' },
  { afterMs: 5_000, status: 'PICKED_UP' },
  { afterMs: 15_000, status: 'IN_TRANSIT' },
  { afterMs: 30_000, status: 'DELIVERED' },
];

/** Bonus adapter proving the platform is truly pluggable — no real network calls, in-memory simulation. */
export class MockCourierAdapter implements CourierAdapter {
  readonly partnerKey = 'mockcourier';

  private readonly shipments = new Map<string, SimulatedShipment>();

  async createShipment(order: NormalizedOrderInput): Promise<CreateShipmentResult> {
    const courierOrderId = `MOCK-${randomUUID()}`;
    const awbNumber = `AWB${Math.floor(Math.random() * 1_000_000_000)}`;
    this.shipments.set(awbNumber, { status: 'CREATED', createdAt: Date.now() });

    const rawRequest = { order_id: order.orderId, consignee: order.consignee, payment: order.payment };
    const rawResponse = { courier_order_id: courierOrderId, awb: awbNumber, status: 'CREATED' };
    return { courierOrderId, awbNumber, status: 'CREATED', rawRequest, rawResponse };
  }

  async trackShipment(_courierOrderId: string, awbNumber: string): Promise<TrackShipmentResult> {
    const shipment = this.shipments.get(awbNumber);
    if (!shipment) {
      throw new CourierError('mockcourier', 'COURIER_REJECTED_REQUEST', 'Unknown AWB', undefined);
    }

    if (shipment.status !== 'CANCELLED') {
      shipment.status = this.currentSimulatedStatus(shipment.createdAt);
    }

    return { status: shipment.status, rawResponse: { awb: awbNumber, status: shipment.status } };
  }

  async cancelShipment(_courierOrderId: string, awbNumber: string): Promise<CancelShipmentResult> {
    const shipment = this.shipments.get(awbNumber);
    if (!shipment) {
      throw new CourierError('mockcourier', 'COURIER_REJECTED_REQUEST', 'Unknown AWB', undefined);
    }
    if (shipment.status === 'DELIVERED') {
      throw new CourierError('mockcourier', 'COURIER_REJECTED_REQUEST', 'Cannot cancel a delivered shipment', undefined);
    }

    shipment.status = 'CANCELLED';
    return { status: 'CANCELLED', rawResponse: { awb: awbNumber, status: 'CANCELLED' } };
  }

  private currentSimulatedStatus(createdAt: number): ShipmentStatus {
    const elapsed = Date.now() - createdAt;
    return PROGRESSION.slice().reverse().find((step) => elapsed >= step.afterMs)!.status;
  }
}
