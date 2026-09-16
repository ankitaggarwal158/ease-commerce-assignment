# Design Document

## 1. Architecture overview

```
POST /api/v1/orders  { courierPartner, ...normalized fields }

Express Router → apiKeyAuth → zod validate → Controller → Service
                                                   │
                                                   ▼
                                   CourierRegistry.resolve(courierPartner)
                                                   │
                                    ┌──────────────┴───────────────┐
                                    ▼                              ▼
                          UrbaneBoltAdapter                MockCourierAdapter
                          (real HTTP, retry/backoff,        (in-memory, bonus,
                           token re-auth)                    proves pluggability)
                                    │
                                    ▼
                         MongoDB: Order + TrackingEvent
                                    │
                         Bulk path: BullMQ (Redis) fan-out
                         to the same Service/Adapter code
```

The unified API, DTOs, controllers, and services never know which courier is involved; they
only see the `CourierAdapter` interface, resolved at runtime by a string key. This is a
**Strategy pattern** (interchangeable `CourierAdapter` implementations behind one interface)
combined with a **Factory/Registry** (`CourierRegistry`) that resolves the right strategy from
the `courier_partner` field in the request. Adding a courier means writing one new adapter
class and registering it in one composition-root file (`src/couriers/index.ts`) and no
controller, route, DTO, or existing adapter is touched, satisfying the pluggability
requirement literally.

## 2. Why this pattern

- **Testability**: business logic (`orders.service.ts`) is tested against `MockCourierAdapter`
  without any network dependency.
- **Isolation of courier-specific quirks**: UrbaneBolt's exact request/response field names live
  in one mapper file (`urbanebolt.mapper.ts`); if/when the real schema needs correcting, nothing
  else in the system changes.
- **Uniform error handling**: every adapter throws the same internal `CourierError` shape
  (`COURIER_REJECTED_REQUEST` / `COURIER_AUTH_FAILED` / `COURIER_UPSTREAM_ERROR`), translated by
  one shared function (`courierErrorToAppError`) into the single normalized client-facing error
  shape.

## 3. Database schema (MongoDB / Mongoose)

**`Order`** — one document per internal order, current-state snapshot:
| Field | Notes |
|---|---|
| `orderId` | unique index — the idempotency key |
| `courierPartner` | which adapter handled this order |
| `courierOrderId`, `awbNumber` | returned by the courier on creation |
| `status` | `CREATED \| PICKED_UP \| IN_TRANSIT \| DELIVERED \| CANCELLED \| FAILED` |
| `requestPayload`, `responsePayload` | full payload sent to/received from the courier on creation (audit/debugging, per assignment 3.3) |
| `lastError` | `{ message, code, raw, occurredAt }` - set on any courier-call failure, without necessarily changing `status` (see trade-off below) |
| `createdAt` / `updatedAt` | timestamps |

**`TrackingEvent`** — append-only, one row per status transition:
`{ orderId, status, rawPayload, createdAt }`, indexed on `{ orderId, createdAt }`. Populated on
every successful create/track/cancel call that changes the shipment's status — never on a
transient call failure (see below).

**`BatchJob`** — one document per bulk submission: `{ batchId (unique), items: [{ orderId,
courierPartner, status: PENDING|SUCCEEDED|FAILED, reason }] }`. Aggregate totals are computed
on read from `items`, not stored redundantly, to avoid a second source of truth.

### Status vs. tracking-event trade-off
`Order.status = 'FAILED'` is reserved for a **creation** failure when the courier never accepted
the shipment. A transient failure while calling `/track` or `/cancel` on an already-created order does **not** overwrite `Order.status` or append a `TrackingEvent` (that would incorrectly imply the shipment itself
failed); it only sets `lastError` and returns an error to the caller. This was a deliberate
design decision after considering a dedicated `CourierCallLog` audit table for every raw
attempt; that was scoped out as over-engineering for this assignment (see below) in favor of
this simpler two-table design.

## 4. Bulk processing (100 orders)

`POST /api/v1/orders/bulk` validates the payload (≤ `BULK_MAX_ORDERS`), creates a `BatchJob`
with all items `PENDING`, enqueues one BullMQ job per order (`jobId = orderId`), and returns
`202 { batchId }` **immediately** and orders are not processed inline in the HTTP request.

**Why `batchId` + polling, not streaming**: streaming (e.g. chunked responses or WebSockets)
would keep one HTTP connection open for the whole batch and complicates client retry semantics
if the connection drops mid-batch. Returning a `batchId` immediately and letting the client poll
`GET /orders/bulk/:batchId` is simpler, resilient to client disconnects.

**Why BullMQ + Redis over an in-process worker pool**: an in-process concurrency limiter
(e.g. `p-limit`) would be simpler (no extra infra) but isn't durable as a process crash mid-batch
loses in-flight work, and it can't scale beyond one instance. BullMQ persists jobs in Redis,
survives restarts, and gives concurrency control (`BULK_WORKER_CONCURRENCY`) and retained
failed-job data.

**Idempotency (two layers)**:
1. `Order.orderId` has a unique index — `createOrder()` checks for an existing order first and
   is a no-op (returns the existing document) if found. This is the permanent guarantee.
2. BullMQ's `jobId = orderId` deduplicates jobs at the queue level, so resubmitting the same
   batch (or the same order in a different batch) doesn't even enqueue a second job while the
   first is in flight.

**Retry/backoff placement**: backoff for 5xx/timeout/network errors lives in one shared
`RetryableHttpClient` used by every adapter, for both the synchronous single-order endpoints and
the bulk worker. they are not duplicated as a second retry layer in BullMQ (BullMQ jobs use
`attempts: 1`, since the HTTP client already retries before the job fails).

## 5. Error handling

Single normalized shape on every response: `{ error: { code, message, details?, requestId } }`.
- Validation (`zod`) → `400 VALIDATION_ERROR` with per-field `details`.
- Unknown `courier_partner` → `400 UNKNOWN_COURIER_PARTNER` with `details.supportedCouriers`.
- Courier 4xx → `400/502` normalized codes (`COURIER_REJECTED_ORDER`, `COURIER_AUTH_FAILED`,
  `COURIER_UNAVAILABLE`); the courier's raw response is stored in `Order.lastError`/`requestPayload`
  for our own debugging, never returned to the client.
- Courier 5xx/timeout/network → retried with configurable exponential backoff, then surfaced as
  `COURIER_UNAVAILABLE` and persisted (`Order.status = 'FAILED'` + `lastError` for creation
  failures; `lastError` only for track/cancel failures — see trade-off above).
- Auth failure (401 from courier) → one transparent re-authentication + one retry, inside the
  adapter, invisible to the caller unless it also fails.
- Courier failures are logged as structured JSON with `orderId`, `courierPartner`, `requestId`,
  `errorType`, and `stack`. Generic HTTP failures log the context available at the error
  boundary (`requestId`, `errorType`, `statusCode`, and `stack`).

## 6. Trade-offs & things intentionally left out of scope

- **No `CourierCallLog` audit table.** Considered logging every single outbound courier call
  (including every retry attempt) as its own DB collection. Dropped as over-engineering: BullMQ
  already retains failed-job data (payload + error + attempt count) for the bulk path, and the
  structured pino logs satisfy "every failure must be logged with order_id/courier_partner/
  request_id/error_type/stack trace" literally. A DB audit table would be the natural next step
  if full replay of every attempt were required.
- **No log aggregation/shipping.** Pino writes structured JSON to stdout; for this assignment,
  `docker compose logs` is sufficient. Shipping to ELK/CloudWatch/etc. is out of scope.
- **Single process for API + BullMQ worker.** Simpler to run and demo. Production can build one
  image and run separate API and worker deployments with different entrypoints.
- **UrbaneBolt schema completeness.** See README "Assumptions" — the UAT environment was down
  and the Postman documentation page didn't fully render three endpoints. Payload field mapping
  is isolated to `urbanebolt.mapper.ts`; endpoint paths/auth remain in the adapter and also need
  confirmation against the live docs.
- **No auth/rate-limiting beyond a static API key.** A single shared `x-api-key` was added since
  the assignment didn't specify unified-API auth; a real production system would likely use
  per-consumer keys/OAuth and rate limiting.

## 7. Running: dev vs. production

- Dev: `docker compose up -d mongo redis` (infra only) + `npm run dev` (tsx watch, hot reload) on
  host. `.env` already points at `localhost:27017`/`6379` for this. Full-stack
  `docker compose up --build` (app+mongo+redis) also works, no hot reload.
- Bulk endpoint/worker needs Redis up; single order create/track/cancel only needs Mongo, not
  Redis — degrades independently if Redis is down.
- Prod build: `tsc` → `dist/*.js`, packaged into a Docker image (multi-stage `Dockerfile`
  already does this) — no `ts-node`/`tsx` in prod, no PM2 needed since a container
  orchestrator (k8s/ECS/Cloud Run) already handles restart-on-crash + replica scaling; PM2 is
  only relevant on a bare VM with no orchestrator.
- Prod topology: build one image, run it as two deployments — `node dist/server.js` (API,
  scales on request traffic) and `node dist/worker.js` (BullMQ worker, scales on queue depth).
  Today both run in `server.ts`; splitting needs a `worker.ts` entrypoint and a second service
  or deployment, but no business-logic changes.
- Managed Mongo (Atlas) + managed Redis (Elasticache/Upstash) replace the containerized
  `mongo`/`redis` services; app only needs `MONGODB_URI`/`REDIS_URL` env vars updated.
