# MyDoc Technical Proof of Concept (PoC)

## 1. Purpose

This PoC validates that the current MyDoc backend and Azure infrastructure can support:

- Three-tier consultation model:
  - Normal (Voice-Text) `₦1,000`
  - Priority (Voice Call) `₦5,000`
  - Super Priority (Video Call) `₦10,000`
- Uber-style doctor claim workflow with a 2-minute acceptance window
- Secure payment hold/capture/release lifecycle
- Real-time updates + push notification fanout
- Biometric verification integration hooks (Face + Speaker)
- Operations baseline (monitoring, health checks, timer jobs)

Source alignment: `CTODEVELOPER HANDBOOK.docx` (v3.0) + repo implementation.

## 2. PoC Success Criteria

PoC is considered successful if all criteria below pass in `dev`:

1. Patient can create consultation requests for all tiers.
2. Doctor can atomically claim a request; duplicate claim returns conflict.
3. Consultation can move through `REQUESTED -> DOCTOR_ACCEPTED -> IN_PROGRESS -> COMPLETED`.
4. Payment hold is created at request and captured at completion.
5. Real-time and push pathways are triggered for request and acceptance events.
6. Function App infra deploys and timer triggers are configured.
7. Terraform `validate` succeeds for `dev` and `prod`.

Measured KPIs for PoC signoff:

- Consultation request API p95 latency < 800ms in dev baseline.
- Doctor accept API conflict handling correctness (exactly one successful claim per request).
- Notification fanout latency target:
  - realtime event dispatch < 3s
  - push dispatch initiation < 5s
- Function timer cold-start stability: no startup exceptions across 5 consecutive runs.

## 3. Scope

### In Scope

- Backend API (`Backend/api`) consultation and payment orchestration
- Terraform stacks (`Terraform/environments/dev`, `Terraform/environments/prod`)
- Azure Function App infrastructure and function runtime project (`Backend/functions`)
- Notification Hubs connection-string retrieval from Azure via Terraform azapi
- Endpoint/interaction mapping for frontend integration

### Out of Scope (for this PoC phase)

- End-to-end mobile app UX validation
- Production-grade payout source model (bank account storage workflow)
- Full load/performance certification at final production scale
- Legal/compliance audit signoff documentation package

## 4. Reference Architecture (PoC)

- API runtime: Azure App Service (Node/Express)
- Async jobs: Azure Linux Function App (timer triggers)
- Database: Azure PostgreSQL Flexible Server
- Cache/queue: Azure Redis Cache
- Real-time: Azure Web PubSub
- Communication tokens/sessions: Azure Communication Services
- Biometrics: Azure Face + Speaker APIs
- Push: Azure Notification Hubs
- Observability: Application Insights + Log Analytics

## 5. Implemented Technical Components

### API Endpoints (PoC critical)

- `POST /api/v1/consultations/request`
- `POST /api/v1/consultations/accept`
- `POST /api/v1/consultations/:consultationId/start`
- `POST /api/v1/consultations/:consultationId/complete`
- `POST /api/v1/consultations/:consultationId/escalate`
- `POST /api/v1/payments/webhook/:provider`
- `POST /api/v1/webhooks/acs`
- `GET /health`
- `GET /api/v1/health/metrics`

Detailed frontend mapping: `ENDPOINTS_FRONTEND_INTERACTION.md`.

### Function Jobs

- `payment-processor` timer
  - Reconciliation + expired hold release + payout attempt path
- `compliance-cleanup` timer
  - Recording cleanup + deletion/anonymization workflow

### Terraform Integration Highlights

- App Service settings mapped for backend runtime dependencies
- Function App module added with:
  - Storage account
  - Plan
  - Linux Function App
  - runtime app settings + schedules
- Notification Hubs connection string retrieved by Terraform using:
  - `data.azapi_resource_action ... listKeys`

## 6. Validation Evidence

Performed in current workspace:

- `terraform -chdir=Terraform/environments/dev validate` -> success
- `terraform -chdir=Terraform/environments/prod validate` -> success

These confirms module graph and syntax are valid for both env stacks after integration changes.

Additional recommended proof artifacts for signoff:

- `terraform plan` output snapshots for dev/prod.
- App Service and Function App deployment logs.
- Sample request/accept/complete API traces with consultation IDs.
- Notification Hubs and Web PubSub event logs for one end-to-end flow.

## 7. PoC Test Matrix

### A. Consultation Lifecycle

1. Request NORMAL consultation
   - Expected: `201`, queue insertion, doctor notify fanout
2. Doctor accepts request
   - Expected: `200`, session payload returned
3. Duplicate accept on same request
   - Expected: `409`
4. Start consultation
   - Expected: status transition to `IN_PROGRESS`
5. Complete consultation
   - Expected: completion persisted, wallet credit + transaction creation

### B. Financial Controls

1. Payment hold init failure
   - Expected: request rejected with payment error path
2. Expired request processing
   - Expected: status set `EXPIRED`, hold release path called
3. Completion payment capture
   - Expected: payment status update path called

### C. Realtime + Push

1. New consultation event
   - Expected: Web PubSub broadcast + doctor push send call path
2. Doctor accepted event
   - Expected: patient and doctor notifications emitted

### D. Function Timers

1. Payment processor trigger execution
   - Expected: no runtime boot failure, logs emitted, safe skips where bank metadata absent
2. Compliance cleanup execution
   - Expected: storage + DB workflows execute with safe error logging

## 8. Known Gaps / Risks

1. Function payout path currently depends on bank metadata not formalized in Prisma schema.
2. End-to-end ACS media session behavior is mocked/orchestrated at backend level and needs live environment verification.
3. Node toolchain was unavailable in this execution environment, so runtime compile/tests were not re-run here.

Traceability to handbook (v3.0) requirements:

- Three-tier pricing and escalation: implemented in consultation controller.
- Uber handshake (claim + timeout): implemented with Redis atomic claim + expiry handler.
- Network-resilient comm layer target: wired to ACS/Web PubSub architecture; live media KPIs pending validation.
- Compliance cleanup: implemented as timer function for retention/anonymization path.

## 9. Exit Criteria for PoC to Pilot

Move to pilot when:

1. Live Azure `dev` deployment completes (API + Function App).
2. Mobile/web clients pass smoke tests against documented endpoints/events.
3. Payment sandbox callbacks validated for both providers.
4. Baseline monitoring dashboards and alert thresholds are reviewed.
5. Security review confirms secret handling, network isolation, and biometric consent flows.

## 10. Next Implementation Steps

1. Add bank-details domain model and payout recipient lifecycle.
2. Add Function App CI secrets and run deployment workflows.
3. Execute integration tests in Azure `dev` with real managed services.
4. Produce pilot readiness report with latency and error-rate snapshots.
