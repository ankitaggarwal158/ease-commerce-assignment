import { NormalizedOrderInput, ShipmentStatus } from '../../interfaces/courier-adapter.interface';

/**
 * ASSUMPTION: UrbaneBolt's exact Manifest/Tracking/Cancellation field names could not be
 * confirmed — the UAT environment was returning 503 / 500 and the Postman documenter page
 * (https://documenter.getpostman.com/view/19172174/2sAYHzFhxb) did not fully render those
 * three endpoints' schemas when audited. This mapper is the ONLY place that needs updating
 * once the live schema is confirmed — nothing else in the adapter, registry, or API layer
 * depends on these exact field names.
 */
export function toManifestRequest(order: NormalizedOrderInput) {
  return {
    order_reference: order.orderId,
    consignee: {
      name: order.consignee.name,
      phone: order.consignee.phone,
      address_line1: order.consignee.addressLine1,
      address_line2: order.consignee.addressLine2,
      city: order.consignee.city,
      state: order.consignee.state,
      pincode: order.consignee.pincode,
    },
    pickup: {
      name: order.pickup.name,
      phone: order.pickup.phone,
      address_line1: order.pickup.addressLine1,
      address_line2: order.pickup.addressLine2,
      city: order.pickup.city,
      state: order.pickup.state,
      pincode: order.pickup.pincode,
    },
    package: {
      weight: order.package.weightKg,
      length: order.package.lengthCm,
      width: order.package.widthCm,
      height: order.package.heightCm,
      description: order.package.description,
    },
    payment_mode: order.payment.mode,
    cod_amount: order.payment.codAmount,
  };
}

export function fromManifestResponse(data: any): { courierOrderId: string; awbNumber: string; status: ShipmentStatus } {
  return {
    courierOrderId: data?.order_id ?? data?.courier_order_id,
    awbNumber: data?.awb ?? data?.awb_number,
    status: 'CREATED',
  };
}

const URBANEBOLT_STATUS_MAP: Record<string, ShipmentStatus> = {
  CREATED: 'CREATED',
  MANIFESTED: 'CREATED',
  PICKED_UP: 'PICKED_UP',
  IN_TRANSIT: 'IN_TRANSIT',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'CANCELLED',
  RTO: 'FAILED',
};

export function mapUrbaneBoltStatus(rawStatus: string | undefined): ShipmentStatus {
  if (!rawStatus) return 'FAILED';
  return URBANEBOLT_STATUS_MAP[rawStatus.toUpperCase()] ?? 'FAILED';
}
