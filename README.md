# Multi-Courier Integration Platform

A courier-agnostic order/shipment backend. Consumers call **one unified REST API**; the
courier is selected with the `courierPartner` string in the request body.
UrbaneBolt is the first live integration; a bonus in-memory `MockCourier` adapter proves the
platform is truly pluggable.

## Tech stack

Node.js + TypeScript, Express, MongoDB (Mongoose), Redis + BullMQ (bulk processing), Zod
(validation & config), Pino (structured logging), Jest + Supertest + mongodb-memory-server
(tests).

## Setup

### Prerequisites
- Node.js 20+
- Docker (for MongoDB + Redis), or your own local instances of each

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
```
See [Environment variables](#environment-variables) below for what each value means.

### 3. Start MongoDB + Redis
```bash
docker compose up -d mongo redis
```

### 4. Run the app
```bash
npm run dev       # ts-node/tsx with hot reload
# or
npm run build && npm start   # compiled production build
```
`npm run dev` runs the API and BullMQ worker in one process. Health check:
`GET http://localhost:3000/health`.

### Run everything (app + Mongo + Redis) via Docker Compose
```bash
docker compose up --build
```

## Environment variables

| Variable | Purpose |
|---|---|
| `PORT` | HTTP port (default 3000) |
| `NODE_ENV` | `development` \| `test` \| `production` |
| `LOG_LEVEL` | pino level (`info`, `debug`, `error`, ...) |
| `INTERNAL_API_KEY` | Required `x-api-key` header value for all `/api/v1/*` requests |
| `MONGODB_URI` | Mongo connection string |
| `REDIS_URL` | Redis connection string (used by BullMQ) |
| `BULK_MAX_ORDERS` | Max orders accepted per bulk request (default 100) |
| `BULK_WORKER_CONCURRENCY` | Concurrent bulk jobs processed at once |
| `COURIER_URBANEBOLT_BASE_URL` | UrbaneBolt API base URL |
| `COURIER_URBANEBOLT_USERNAME` / `_PASSWORD` | UrbaneBolt UAT credentials |
| `COURIER_URBANEBOLT_TIMEOUT_MS` | Per-request timeout |
| `COURIER_URBANEBOLT_RETRY_MAX_ATTEMPTS` / `_RETRY_BASE_DELAY_MS` | Exponential backoff config for 5xx/timeout/network errors |

`MockCourier` needs no configuration — it's a pure in-memory simulation.

## API

All endpoints below require `x-api-key: <INTERNAL_API_KEY>` (except `/health`).
The assignment calls this field `courier_partner`; this implementation uses camelCase
`courierPartner`.
Full request/response examples: [postman_collection.json](postman_collection.json) or curl below.

### Create an order
```bash
curl -X POST http://localhost:3000/api/v1/orders \
  -H "x-api-key: $INTERNAL_API_KEY" -H "Content-Type: application/json" \
  -d '{
    "orderId": "ORD-1001",
    "courierPartner": "mockcourier",
    "consignee": {"name":"Alice","phone":"9000000001","addressLine1":"123 MG Road","city":"Bengaluru","state":"KA","pincode":"560001"},
    "pickup": {"name":"Warehouse","phone":"9000000002","addressLine1":"1 Depot Rd","city":"Bengaluru","state":"KA","pincode":"560002"},
    "package": {"weightKg": 1.5},
    "payment": {"mode":"PREPAID"}
  }'
```
Returns `201` on first creation, `200` on any resubmission of the same `orderId` (idempotent —
no duplicate shipment is created with the courier).

### Track an order
```bash
curl -H "x-api-key: $INTERNAL_API_KEY" http://localhost:3000/api/v1/orders/ORD-1001/track
```

### Cancel an order
```bash
curl -X POST -H "x-api-key: $INTERNAL_API_KEY" http://localhost:3000/api/v1/orders/ORD-1001/cancel
```

### Bulk create (up to `BULK_MAX_ORDERS`)
```bash
curl -X POST http://localhost:3000/api/v1/orders/bulk \
  -H "x-api-key: $INTERNAL_API_KEY" -H "Content-Type: application/json" \
  -d '{ "orders": [ { "orderId": "BULK-1", "courierPartner": "mockcourier", ... }, ... ] }'
```
Returns `202` immediately with a `batchId` — orders are processed concurrently in the
background. Poll for results:
```bash
curl -H "x-api-key: $INTERNAL_API_KEY" http://localhost:3000/api/v1/orders/bulk/<batchId>
```
Response includes per-order `SUCCEEDED`/`FAILED` status with a `reason` for failures.

### Error shape
Every error response (validation, unknown courier, courier failures, etc.) has the same shape:
```json
{ "error": { "code": "STRING_CODE", "message": "human readable", "details": {}, "requestId": "uuid" } }
```

## Testing
```bash
npm test
```
Runs unit tests (courier registry, MockCourier adapter, DB models/indexes, orders service
business logic) and end-to-end tests (Supertest against the real Express app, backed by
`mongodb-memory-server`, using `MockCourier` so no real network calls are made). The bulk
queue itself (BullMQ + Redis) is verified manually against real Redis rather than in the
automated suite — see DESIGN.md for why.

## How to add a new courier

For a courier that uses the existing normalized order shape, adding it requires no changes to
controllers, routes, DTOs, services, or existing adapters:

1. Create `src/couriers/adapters/<name>/<name>.adapter.ts` implementing the `CourierAdapter`
   interface (`createShipment`, `trackShipment`, `cancelShipment`) — see
   `src/couriers/interfaces/courier-adapter.interface.ts`.
2. If it needs config (base URL, credentials, timeouts...), add a `<name>.config.ts` using
   `loadCourierEnv('COURIER_<NAME>', zodSchema)` and document the new `COURIER_<NAME>_*` env
   vars in `.env.example`.
3. Map courier-specific errors to `CourierError` (see `urbanebolt.errors.ts` for the pattern).
4. Register the new adapter in `src/couriers/index.ts`:
   ```ts
   courierRegistry.register(new YourNewAdapter());
   ```
Consumers can then pass `"courierPartner": "yourNewCourier"`; persistence, bulk processing,
error normalization, and retries continue unchanged.

## Assumptions

- **UrbaneBolt UAT availability**: the UAT environment (`uat.urbanebolt.in`) was returning
  `503 Service Temporarily Unavailable` during development. The
  `UrbaneBoltAdapter`'s endpoint paths and payload field names in `urbanebolt.mapper.ts` are
  therefore a best-effort inference from the confirmed `getToken`/`Pincode` endpoint
  conventions.
- No API auth was specified by the assignment for the unified API itself; a simple
  `x-api-key` guard was added for a more production-realistic feel.
- Automated tests weren't explicitly mandated by the assignment, but a focused suite was
  included as proof the pluggability/idempotency/error-handling requirements actually work.