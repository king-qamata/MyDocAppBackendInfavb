# MyDoc Technical Endpoints and Frontend Interaction

## 1. API Base

- Base path: `/api/v1`
- Health root: `/health`

Implementation status legend:

- `IMPLEMENTED`: route exists in current backend code.
- `RECOMMENDED`: route should be added for complete frontend integration.

Authentication:

- Consultation routes require `Authorization: Bearer <jwt>`
- In test mode, fallback headers are supported by middleware:
  - `x-user-id`
  - `x-user-role`

## 2. HTTP Endpoints

### 2.1 Health

- `GET /health`
  - Status: `IMPLEMENTED`
  - Purpose: aggregated service health snapshot
  - Used by: platform probes, ops dashboards

- `GET /api/v1/health`
  - Status: `IMPLEMENTED`
  - Purpose: health via API versioned route

- `GET /api/v1/health/metrics`
  - Status: `IMPLEMENTED`
  - Purpose: runtime metrics (queues, active consultations, memory/uptime)
  - Used by: admin/ops frontend

### 2.2 Consultation Flow

All under `/api/v1/consultations`.

- `POST /request`
  - Status: `IMPLEMENTED`
  - Body:
    - `tier`: `NORMAL | PRIORITY | SUPER`
    - `symptomsVoiceNote?`: string
    - `preferredDoctorId?`: string
    - `metadata?`: `{ deviceInfo?, networkType? }`
  - Behavior:
    - holds payment
    - creates consultation in DB
    - queues in Redis
    - notifies eligible doctors (push + realtime)
  - Success: `201`

- `POST /accept`
  - Status: `IMPLEMENTED`
  - Body: `{ requestId: string }`
  - Behavior:
    - atomic claim in Redis
    - tier eligibility check
    - creates ACS session (chat/call)
    - marks consultation accepted
  - Success: `200`
  - Conflict: `409` if already claimed/expired

- `POST /:consultationId/start`
  - Status: `IMPLEMENTED`
  - Behavior:
    - transitions `DOCTOR_ACCEPTED -> IN_PROGRESS`
    - schedules liveness check for `SUPER`

- `POST /:consultationId/complete`
  - Status: `IMPLEMENTED`
  - Body: `{ diagnosis?, prescription? }`
  - Behavior:
    - marks consultation completed
    - captures payment
    - credits doctor wallet and transaction log

- `GET /:consultationId`
  - Status: `IMPLEMENTED`
  - Behavior: fetch consultation details

- `POST /:consultationId/rate`
  - Status: `IMPLEMENTED`
  - Body: `{ rating: 1..5, review? }`
  - Behavior: writes audit rating event

- `POST /:consultationId/escalate`
  - Status: `IMPLEMENTED`
  - Body: `{ toTier: PRIORITY | SUPER }`
  - Behavior:
    - validates upward tier only
    - holds delta payment
    - updates tier/pricing

- `GET /patient/history`
  - Status: `IMPLEMENTED`
  - Behavior: list patient consultation history

- `GET /doctor/schedule`
  - Status: `IMPLEMENTED`
  - Behavior: list accepted/in-progress doctor consultations

### 2.3 Payments and Webhooks

- `POST /api/v1/payments/webhook/:provider`
  - Status: `IMPLEMENTED`
  - Purpose: payment provider webhook ingest

- `POST /api/v1/webhooks/acs`
  - Status: `IMPLEMENTED`
  - Purpose: ACS callback ingestion (recording/call-end lifecycle)

### 2.4 Placeholder Domain Routes

- `GET /api/v1/doctors/health`
  - Status: `IMPLEMENTED`
- `GET /api/v1/patients/health`
  - Status: `IMPLEMENTED`

### 2.5 Realtime Support Endpoints (Recommended)

- `POST /api/v1/realtime/token`
  - Status: `RECOMMENDED`
  - Purpose: return user-scoped Web PubSub client URL/token.

- `POST /api/v1/devices/register`
  - Status: `RECOMMENDED`
  - Purpose: register/update mobile push token + platform.

- `DELETE /api/v1/devices/:token`
  - Status: `RECOMMENDED`
  - Purpose: unregister stale push token.

## 3. Frontend Interaction Flows

## 3.1 Patient Requests Consultation

1. Frontend calls `POST /api/v1/consultations/request`.
2. On `201`, frontend receives:
   - `consultationId`
   - `tier`
   - `price`
   - `expiresAt`
3. Frontend starts request countdown UI (2-minute acceptance window).
4. Frontend listens for realtime updates and push notifications.

## 3.2 Doctor Receives and Accepts

1. Doctor receives realtime event / push notification.
2. Doctor taps accept -> `POST /api/v1/consultations/accept` with `requestId`.
3. On `200`, frontend receives `communicationSession`:
   - call details for voice/video tiers
   - chat thread details for normal tier
4. If `409`, frontend shows "already taken / expired".

## 3.3 Start and In-Session

1. Participant joins and calls `POST /api/v1/consultations/:id/start`.
2. Frontend transitions UI to in-session state.
3. For `SUPER`, doctor may receive liveness prompt notification.

## 3.4 Completion

1. Doctor submits diagnosis/prescription via `POST /:id/complete`.
2. Frontend confirms completion and shows summary.
3. Patient then rates doctor via `POST /:id/rate`.

## 4. Realtime and Push Channels

### 4.1 Web PubSub

Backend service handles:

- user/group messaging (`user-<id>`, tier groups)
- consultation status updates
- typing indicator updates

Frontend should:

- request Web PubSub access token from backend (endpoint to expose if needed)
- subscribe by role/tier
- handle events such as:
  - `NEW_CONSULTATION`
  - `CONSULTATION_UPDATE`
  - `TYPING_INDICATOR`

### 4.2 Push (Notification Hubs)

Backend push service sends:

- doctor request alerts
- accepted consultation notifications
- expiry/liveness notifications

Frontend should:

- register device installation/token by user and platform
- map user identity to tags (e.g. `user:<id>`)

## 5. Azure Functions Interaction

Current timer-triggered functions in `Backend/functions/src`:

- `payment-processor`
  - scheduled reconciliation/release/payout attempts
- `compliance-cleanup`
  - recording cleanup and anonymization

Frontend impact:

- asynchronous status updates may appear after function runs (wallet payouts, cleanup effects)
- no direct frontend HTTP call to these functions is required

## 6. Typical Error Contract

Error middleware response shape:

```json
{
  "error": "message",
  "details": {}
}
```

Common statuses:

- `400` validation errors
- `401` unauthenticated
- `403` unauthorized
- `404` missing resource/profile
- `409` concurrency/state conflict
- `410` expired request
- `500` unexpected server error

## 7. Request/Response Quick Examples

### Request consultation

`POST /api/v1/consultations/request`

```json
{
  "tier": "PRIORITY",
  "metadata": {
    "networkType": "3G"
  }
}
```

Success (`201`):

```json
{
  "message": "Consultation requested successfully",
  "consultationId": "cuid",
  "tier": "PRIORITY",
  "price": 5000,
  "expiresAt": "2026-02-20T12:34:56.000Z"
}
```

## 8. Frontend Integration Checklist

- Implement auth token injection for all protected routes.
- Implement request timeout UX using `expiresAt`.
- Add optimistic + conflict-safe accept flow for doctors.
- Handle consultation status transitions from both HTTP and realtime channels.
- Capture and surface payment/authorization failures cleanly.
- Implement push registration and token refresh.
- Add retry strategy for transient network failures.
