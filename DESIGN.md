# Design Document

## 1. At a glance

```text
Consumer
  -> Express route
  -> API-key auth + Zod validation
  -> Controller
  -> Order service
  -> CourierRegistry.resolve(courierPartner)
  -> UrbaneBoltAdapter | MockCourierAdapter
  -> MongoDB: Order + TrackingEvent

Bulk requests: API -> BullMQ/Redis -> same Order service -> same adapters
```

- One courier-agnostic API for consumers.
- `courierPartner` selects the adapter at runtime.
- UrbaneBolt is the real integration; MockCourier proves pluggability without network calls.
- MongoDB stores current order state and tracking history.
- BullMQ + Redis processes bulk orders asynchronously.

## 2. Architecture decisions

### Strategy + Registry

- `CourierAdapter`: shared contract for `createShipment`, `trackShipment`, `cancelShipment`.
- `CourierRegistry`: maps a partner key to an adapter instance.
- `src/couriers/index.ts`: composition root; adapters are registered here.
- Services/controllers never import a concrete courier.

Adding a courier that uses the existing normalized order shape:

1. Add adapter, mapper, config, and error mapping under `src/couriers/adapters/<name>/`.
2. Implement `CourierAdapter`.
3. Register it in `src/couriers/index.ts`.

No route, controller, DTO, service, or existing adapter changes.

### Adapter boundary

```text
our DTO
  -> NormalizedOrderInput
  -> courier mapper: our shape -> courier wire shape
  -> courier HTTP API
  -> courier mapper: courier response -> normalized result
  -> Order service -> MongoDB/API response
```

- Courier-specific fields stay inside the adapter/mapper.
- Courier errors become `CourierError`, then one normalized API error shape.
- UrbaneBolt auth, retry, endpoint calls, and response mapping stay outside business logic.

## 3. Persistence

### `Order` - current state

| Field | Purpose |
|---|---|
| `orderId` | Internal ID; unique index and idempotency key |
| `courierPartner` | Adapter used |
| `courierOrderId`, `awbNumber` | IDs returned by courier |
| `status` | `CREATED`, `PICKED_UP`, `IN_TRANSIT`, `DELIVERED`, `CANCELLED`, `FAILED` |
| `requestPayload`, `responsePayload` | Full courier create request/response for audit/debugging |
| `lastError` | Last courier-call failure: message, code, raw payload, timestamp |
| `createdAt`, `updatedAt` | Mongoose timestamps |

### `TrackingEvent` - append-only history

```text
{ orderId, status, rawPayload, createdAt }
```

- Separate collection.
- Indexed by `{ orderId, createdAt }`.
- Added on successful status transitions from create/track/cancel.
- Transient track/cancel failures update `lastError`, not shipment status/history.
- Creation failure is stored as `FAILED` because the shipment was never accepted.

### `BatchJob` - bulk state

```text
{ batchId, items: [{ orderId, courierPartner, status, reason }] }
```

- `batchId` is unique.
- Item status: `PENDING`, `SUCCEEDED`, or `FAILED`.
- Totals are calculated from items when status is requested.

## 4. Bulk processing

`POST /api/v1/orders/bulk`:

1. Validate 1 to `BULK_MAX_ORDERS` orders.
2. Create a `BatchJob` with all items `PENDING`.
3. Enqueue one BullMQ job per order.
4. Return `202` with `batchId` immediately.
5. Worker processes jobs concurrently and updates each item.
6. Consumer polls `GET /api/v1/orders/bulk/:batchId`.

### Why this design

| Decision | Reason |
|---|---|
| Batch ID + polling | No long-lived HTTP connection; client retries/polls safely |
| BullMQ + Redis | Durable jobs, concurrency control, restart visibility, multi-worker scaling |
| `jobId = orderId` | Queue-level duplicate protection |
| Unique `Order.orderId` | Permanent database-level idempotency backstop |
| HTTP retry, not BullMQ retry | One shared retry policy; BullMQ jobs use `attempts: 1` |

Retryable courier failures: 5xx, timeout, and network errors. Backoff and attempt count are
configuration-driven. Courier 4xx responses are not retried.

## 5. Error handling

Every API error uses:

```json
{ "error": { "code": "STRING_CODE", "message": "human readable", "details": {}, "requestId": "uuid" } }
```

| Failure | Behavior |
|---|---|
| Invalid input | `400 VALIDATION_ERROR` with field-level details |
| Unknown courier | `400 UNKNOWN_COURIER_PARTNER` plus supported keys |
| Courier 4xx | Normalized client error; raw response stays internal |
| Courier 5xx/timeout/network | Retry with exponential backoff, then persist failure and return `COURIER_UNAVAILABLE` |
| Courier 401 | Re-authenticate once, retry once |
| Any courier failure | Structured Pino log with order ID, courier, request ID, error type, stack |
| Generic HTTP failure | Global handler logs available request/error context |

Raw courier payloads are persisted for internal debugging, never returned directly to consumers.

## 6. Trade-offs and scope

- **No log aggregation:** Pino writes JSON to stdout; deployment infrastructure can ship it to
  ELK, CloudWatch, Datadog, etc.
- **One API + worker process:** simpler for the assignment/demo. Production can run separate API
  and worker deployments from the same image for independent scaling and failure isolation.
- **Static API key:** assignment did not specify unified-API auth. Production should use stronger
  per-consumer credentials/OAuth and rate limiting.
- **UrbaneBolt schema:** UAT was unavailable and three endpoint schemas did not render in the
  Postman documentation. Payload mapping is in `urbanebolt.mapper.ts`; endpoint paths/auth are
  in `urbanebolt.adapter.ts`. Confirm both against live docs before real traffic.

## 7. Running model

### Development

```bash
docker compose up -d mongo redis
npm run dev
```

- Local `.env` uses `localhost:27017` and `localhost:6379`.
- `tsx watch` provides hot reload.
- Full container mode also works: `docker compose up --build`.
- Bulk processing needs Redis. Single create/track/cancel needs Mongo, not Redis.

### Production

- `tsc` compiles TypeScript to `dist/*.js`.
- Multi-stage Dockerfile packages compiled JS and production dependencies.
- Use one image, then run separate entrypoints/deployments:
  - `node dist/server.js` - HTTP API; scale by request traffic.
  - `node dist/worker.js` - BullMQ worker; scale by queue depth.
- Today both run from `server.ts`; splitting needs a worker entrypoint and deployment/service,
  not business-logic changes.
- Replace container Mongo/Redis with managed services such as Atlas and ElastiCache/Upstash;
  update `MONGODB_URI` and `REDIS_URL` only.
