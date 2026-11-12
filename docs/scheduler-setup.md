# Configure TenantFlow’s scheduler

Verified against the project configuration and Vercel documentation on November 13, 2026.

## 1. Add the production secret

Open the existing **tenantflow** project in Vercel, then open **Settings → Environment Variables**.

Generate a random secret in Terminal.

```sh
openssl rand -hex 32
```

Add an environment variable named `CRON_SECRET`, paste the generated value, select **Production**, and save it. Store it as a sensitive variable where that option is available.

The production environment also needs the application's existing Supabase variables.

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`

Vercel automatically supplies `CRON_SECRET` in the scheduled request’s Authorization header. The worker checks that header before processing jobs. [Vercel authentication guide](https://vercel.com/docs/schedules/handle-runs)

## 2. Deploy the Phase 3 code to Production

Release `feat/phase-3-sla-automations` through the project's production deployment workflow. The deployment must include the completed Phase 3 changes and the saved production environment variables.

The scheduler definition is already present in `vercel.json`.

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "schedules": {
    "tenantflow-background-jobs": {
      "schedule": "*/30 * * * *",
      "path": "/api/cron/process-background-jobs",
      "requestMethod": "POST"
    }
  }
}
```

This runs every hour at minute 00 and minute 30, approximately 48 times per day. The default schedule timezone is UTC. In Asia/Karachi, this also falls on every hour and half-hour.

Each run processes overdue SLAs during configured business hours, queues eligible at-risk notifications, and attempts eligible webhook deliveries. [Vercel schedule configuration](https://vercel.com/docs/schedules/configuration)

## 3. Verify registration and trigger a test

Open the project's **Schedules** view and look for `tenantflow-background-jobs`. Check its enabled state, schedule, and execution history.

You can also use Terminal from the TenantFlow project directory. Link the Vercel CLI to the existing project when prompted, selecting the team that owns TenantFlow.

```sh
npx vercel@latest link
npx vercel@latest schedules inspect tenantflow-background-jobs
npx vercel@latest schedules invoke tenantflow-background-jobs
npx vercel@latest schedules executions list tenantflow-background-jobs
```

A successful worker response has HTTP status 200 and includes counts such as the following. Counts can be zero when there are no eligible jobs.

```json
{"breaches":0,"atRisk":0}
```

Check the next scheduled execution after an hour or half-hour boundary. This verifies that recurring scheduling works alongside the manual invocation. [Vercel schedule management](https://vercel.com/docs/cli/schedules)

## 4. Optional Redis configuration

To enable the Upstash retry index, add these variables to Vercel's Production environment and deploy again.

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

The worker also queries the durable Supabase delivery outbox, so pending deliveries remain recoverable when Redis is absent or unavailable.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Schedule is missing | Confirm the production deployment includes `vercel.json` and the Phase 3 commits. Inspect deployment logs for schedule registration errors. |
| HTTP 401 | Confirm `CRON_SECRET` is saved for Production and the deployment includes that environment variable. |
| HTTP 404 | Confirm the production deployment includes `/api/cron/process-background-jobs`. |
| HTTP 500 | Inspect the worker's function logs for Supabase access, migration, or delivery-processing errors. |
| Zero SLA counts | Check ticket deadlines, current ticket state, organization timezone, and business hours. |
| A webhook is awaiting retry | Compare its `next_retry_at` with the next scheduled sweep. The 30-minute worker cadence determines when eligible retries are attempted. |

The remote database migrations were applied during Phase 3 implementation. Deployment and production scheduler activation remain the release steps.
