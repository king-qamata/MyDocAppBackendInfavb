# MyDoc Backend Infrastructure Technical README

## 1. Repository Structure

- `Backend/api`: Node.js/TypeScript backend API (Express + Prisma + Azure integrations).
- `Backend/functions`: Azure Functions for async jobs (payment processing, compliance cleanup).
- `Terraform`: Azure infrastructure-as-code (modularized per service and environment).

## 2. Implemented Platform Components

### Backend (`Backend/api`)

- API runtime: Express + TypeScript
- Data layer: Prisma (PostgreSQL)
- Cache/queues: Redis
- Real-time: Azure Web PubSub + ACS session orchestration
- Biometrics:
  - Face verification via Azure Face REST API
  - Speaker verification via Azure Speaker Recognition REST API
- Payments:
  - Primary: Paystack
  - Secondary fallback: Flutterwave
- Push notifications: Azure Notification Hubs
- Observability: Application Insights middleware + business event tracking
- Tests: Vitest unit tests for critical consultation/payment flows

### Infrastructure (`Terraform`)

Modular resources under `Terraform/modules`:

- `networking`: RG, VNet, app/db/redis subnets, private DNS zones
- `database`: Azure PostgreSQL Flexible Server (+ optional replica/virtual endpoint)
- `redis`: Azure Cache for Redis + private endpoint
- `communication`: ACS, Web PubSub, Notification Hubs
- `security`: Key Vault, Face cognitive account, Speaker cognitive account, B2C tenant (azapi)
- `monitoring`: Log Analytics, App Insights, alerting resources
- `app_service`: Linux App Service + optional production slot
- `function_app`: Linux Azure Function App, plan, and storage for background jobs

Environment stacks:

- `Terraform/environments/dev`
- `Terraform/environments/prod`

## 3. Backend ↔ Terraform Integration Mapping

The App Service module injects app settings consumed by backend services.

### App settings from Terraform

Defined in `Terraform/modules/app_service/main.tf` and mapped to backend runtime:

- `DATABASE_URL` -> Prisma DB connection
- `REDIS_URL` -> Redis client connection
- `ACS_CONNECTION_STRING` -> ACS identity/chat/call setup
- `WEBPUBSUB_CONNECTION_STRING` -> Web PubSub client
- `FACE_API_ENDPOINT`, `FACE_API_KEY` -> Face service
- `SPEAKER_API_ENDPOINT`, `SPEAKER_API_KEY` -> Speaker service
- `NOTIFICATION_HUB_CONNECTION`, `NOTIFICATION_HUB_NAME` -> Notification Hubs client
- `APPINSIGHTS_INSTRUMENTATIONKEY` -> App Insights telemetry setup

### Function App settings from Terraform

Function settings are injected by `Terraform/modules/function_app/main.tf`:

- `DATABASE_URL`
- `REDIS_URL`
- `PAYSTACK_SECRET_KEY`
- `FLUTTERWAVE_SECRET_KEY`
- `NOTIFICATION_HUB_CONNECTION`
- `NOTIFICATION_HUB_NAME`
- `APPLICATIONINSIGHTS_CONNECTION_STRING`
- `PAYMENT_PROCESSOR_SCHEDULE`
- `COMPLIANCE_CLEANUP_SCHEDULE`

### Notification Hubs connection retrieval

Implemented in `Terraform/modules/communication`:

- Uses `azapi_resource_action` on
  `Microsoft.NotificationHubs/namespaces/authorizationRules@2023-09-01`
- Calls `listKeys` for
  `DefaultFullSharedAccessSignature`
- Exposes `notification_hub_connection` output from the returned
  `primaryConnectionString`

This output is passed to App Service as `NOTIFICATION_HUB_CONNECTION`.

## 4. Terraform Validation Status

Current state (after fixes):

- `terraform -chdir=Terraform/environments/dev validate` -> success
- `terraform -chdir=Terraform/environments/prod validate` -> success

Validation note:

- `validate` confirms configuration correctness, not runtime correctness.
- Runtime verification still requires `plan/apply` + live service smoke tests.

## 5. Local Development

### Backend prerequisites

- Node.js 18+ (recommended: 20)
- npm
- PostgreSQL (or Azure Postgres)
- Redis (or Azure Redis)

### Backend setup

```bash
cd Backend/api
npm install
npm run build
npm test
npm run dev
```

### Functions setup

```bash
cd Backend/functions
npm install
npm run build
func start
```

### Minimal required environment variables

Set in `Backend/api/.env` (or App Service settings in Azure):

- `DATABASE_URL`
- `REDIS_URL` (or `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`)
- `ACS_CONNECTION_STRING`
- `WEBPUBSUB_CONNECTION_STRING`
- `FACE_API_ENDPOINT`, `FACE_API_KEY`
- `SPEAKER_API_ENDPOINT`, `SPEAKER_API_KEY`
- `NOTIFICATION_HUB_CONNECTION`, `NOTIFICATION_HUB_NAME`
- `APPINSIGHTS_INSTRUMENTATIONKEY` (or `APPLICATIONINSIGHTS_CONNECTION_STRING`)
- `PAYSTACK_SECRET_KEY`, `FLUTTERWAVE_SECRET_KEY`
- `JWT_SECRET`

Function runtime environment variables:

- `AzureWebJobsStorage`
- `DATABASE_URL`
- `STORAGE_CONNECTION_STRING`
- `PAYSTACK_SECRET_KEY`
- `FLUTTERWAVE_SECRET_KEY` (optional)
- `PAYMENT_PROCESSOR_SCHEDULE`
- `COMPLIANCE_CLEANUP_SCHEDULE`

## 6. Infrastructure Workflow

### Dev

```bash
terraform -chdir=Terraform/environments/dev init
terraform -chdir=Terraform/environments/dev plan
terraform -chdir=Terraform/environments/dev apply
```

### Prod

```bash
terraform -chdir=Terraform/environments/prod init
terraform -chdir=Terraform/environments/prod plan
terraform -chdir=Terraform/environments/prod apply
```

### CI/CD

GitHub workflows exist under `Terraform/.github/workflows` for dev/prod plan/apply pipelines.
Function deployment workflows:

- `.github/workflows/deploy-functions-dev.yml`
- `.github/workflows/deploy-functions-prod.yml`

## 7. Operational Notes

- Monitoring alerts are currently configurable and can be enabled through monitoring module inputs.
- App Service integration expects secrets to be supplied through Terraform variables/CI secrets.
- Recommendation: keep sensitive values in Key Vault and inject through managed identity where possible.
- Current payout job limitation: function payout flow requires a formal bank-details model in DB.

## 8. Key Files

- Backend entrypoint: `Backend/api/src/index.ts`
- Consultation flow: `Backend/api/src/controllers/consultation.controller.ts`
- Monitoring middleware: `Backend/api/src/middleware/monitoring.middleware.ts`
- Terraform app settings bridge: `Terraform/modules/app_service/main.tf`
- Notification Hubs key retrieval: `Terraform/modules/communication/main.tf`
- Environment stacks: `Terraform/environments/dev/main.tf`, `Terraform/environments/prod/main.tf`
