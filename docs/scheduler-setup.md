# Configure TenantFlow’s scheduler

Verified against the project configuration and Vercel documentation on November 13, 2026.

## Roles in the planned setup

- **Upstash Redis** stores delayed webhook retries in the sorted set `webhooks:retry_zset`. Each entry contains a delivery ID, scored by its next eligible retry time.
- **Vercel Schedules** calls the worker every 30 minutes. The worker reads ready Redis entries and attempts their deliveries.
- **Supabase** stores delivery payloads, attempt history, and claims. The worker also recovers eligible jobs from this durable outbox if Redis is unavailable.

The design also permits Upstash QStash as the recurring trigger. The current project configuration selects Vercel Schedules.

## 1. Create the Upstash Redis database

Open [Upstash Console](https://console.upstash.com/), choose **Redis**, and create a database. Choose a region close to the application's hosting region.

Open the database's REST API connection details and copy the REST URL and read/write REST token. In the existing Vercel **tenantflow** project, add these environment variables for **Production**.

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

Store the token as a sensitive variable where that option is available. Use the read/write token so the worker can add and remove queue entries. [Upstash connection guide](https://upstash.com/docs/redis/sdks/ts/getstarted)

## 2. Add the production worker secret

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

## 3. Deploy the Phase 3 code to Production

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

## 4. Verify registration and trigger a test

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

## 5. Verify the Redis retry queue

After a webhook delivery fails, inspect the Upstash database's data browser for `webhooks:retry_zset`. It contains the pending delivery ID and its scheduled retry timestamp in Unix milliseconds. The worker reads eligible entries on its next scheduled run.

Successful and permanently failed deliveries are removed from the retry set. A healthy queue can be empty when deliveries succeed immediately.

The in-memory fallback supports offline development and tests. Supabase recovery keeps pending jobs recoverable during Redis outages.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Schedule is missing | Confirm the production deployment includes `vercel.json` and the Phase 3 commits. Inspect deployment logs for schedule registration errors. |
| HTTP 401 | Confirm `CRON_SECRET` is saved for Production and the deployment includes that environment variable. |
| HTTP 404 | Confirm the production deployment includes `/api/cron/process-background-jobs`. |
| Redis key stays absent after a failed delivery | Confirm both Upstash variables are configured for Production, redeploy, and inspect function logs for Redis connection errors. |
| HTTP 500 | Inspect the worker's function logs for Supabase access, migration, or delivery-processing errors. |
| Zero SLA counts | Check ticket deadlines, current ticket state, organization timezone, and business hours. |
| A webhook is awaiting retry | Compare its `next_retry_at` with the next scheduled sweep. The 30-minute worker cadence determines when eligible retries are attempted. |

The remote database migrations were applied during Phase 3 implementation. Deployment and production scheduler activation remain the release steps.
