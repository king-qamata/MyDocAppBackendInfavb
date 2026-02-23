# MyDoc Azure Functions

## Functions

- `payment-processor` (timer): scheduled payout/hold reconciliation flow.
- `compliance-cleanup` (timer): 90-day media cleanup + deletion/anonymization tasks.

## Build

```bash
npm install
npm run build
```

## Local run

```bash
cp local.settings.example.json local.settings.json
func start
```

## Required settings

- `AzureWebJobsStorage`
- `DATABASE_URL`
- `STORAGE_CONNECTION_STRING`
- `PAYSTACK_SECRET_KEY`
- `FLUTTERWAVE_SECRET_KEY` (optional)
- `PAYMENT_PROCESSOR_SCHEDULE`
- `COMPLIANCE_CLEANUP_SCHEDULE`
