# AI Ticket Triage v1 — Technical Design Specification

**Date:** 2026-11-25
**Status:** Draft for owner review (roadmap Week 5). No code or schema changes accompany this document.
**Baseline:** `main` at `1d38607` (unchanged since the 2026-11-20 audit).
**Scope:** A read-only, schema-validated **summary** and **suggested priority with rationale** for a single ticket. Later stages add human-reviewed acceptance through the existing ticket actions.

---

## 1. Summary

TenantFlow already has the controls an AI feature has to respect: tenant-scoped RLS (`get_auth_user_org_ids()`), owner/admin/member roles, the ticket FSM (`src/lib/tickets/lifecycle.ts`), activity logging (`ticket_activities`), SLA deadlines that are recalculated when priority changes, and a cron background worker (`/api/cron/process-background-jobs`).

Triage v1 adds a **proposal**, never a mutation:

```ts
type TriageProposal = {
  summary: string;               // 1–3 sentences, ≤ 400 chars, grounded only in the ticket title/description/comments supplied
  suggestedPriority: "low" | "medium" | "high" | "urgent";   // must equal public.ticket_priority
  rationale: string;             // ≤ 300 chars, cites what in the ticket drove the priority
  confidence: "low" | "medium" | "high";
  insufficientInformation: boolean; // true when the ticket text cannot support a priority call
};
```

Everything that changes ticket state keeps going through `updateTicketAction`, with its RBAC, FSM, SLA recalculation and activity log.

## 2. Goals, non-goals

**Goals**
- Produce a proposal that is valid under a server-side Zod schema for any ticket the caller can read.
- Measure quality offline (Week 7) before any user sees a suggestion.
- Leave the manual ticket workflow untouched on every AI failure path.

**Non-goals for v1** (deferred per `DECISIONS.md` 2026-11-20 #5): category, assignee, duplicate detection, missing-details detection, knowledge assistant, SLA briefing, any agent autonomy, MCP exposure.

**Anti-goals:** AI-initiated writes to `tickets`; AI deciding status transitions, assignment permissions or SLA deadlines; reading any data outside the ticket's organization.

## 3. Rollout stages and evidence gates

| Stage | Roadmap week | What runs | Gate to move on |
| --- | --- | --- | --- |
| 0. Offline baseline | 6–7 | Eval script over a labeled synthetic/de-identified fixture set; no app wiring visible to users | Thresholds in §9 met on the fixture set; cross-tenant and injection tests pass |
| 1. Shadow | 6–7 | Proposal generated server-side and stored in `ticket_triage_proposals`; **not shown in UI** | Shadow error rate, latency and cost within budget for ≥ N proposals (N agreed at gate) |
| 2. Review beta | 8–9 | Authorized users see the proposal and can accept/edit/reject each field | Acceptance writes pass RBAC, FSM, stale-write and audit tests |
| 3. Hardened pilot | 10–11 | Feature flag per org, kill switch, per-org budget, rollback drill | Pilot report (Week 11) |

A stage is only entered when the previous gate has evidence in `STATUS.md`. If quality is short, stay in shadow.

## 4. Data flow

### 4.1 On-demand (review beta and later)

1. User opens a ticket. The UI calls a new server action `requestTriageProposalAction(ticketId, orgId, orgSlug)`.
2. The action calls `getTenantContext(orgSlug)` and `assertTenantScoping(context, orgId)`, the same as `updateTicketAction`.
3. It loads the ticket **with the user's RLS client** (`createClient()`), filtered by `id` and `organization_id`. If RLS hides the ticket, the action returns "not found", so the AI never sees data the caller cannot.
4. It builds the model input from an **allow-list of fields only**: `title`, `description`, current `priority`, `status`, `created_at`, and the latest K comments' bodies (K = 5, each truncated). It never sends assignee identity, emails, profile names, other tickets, or organization settings.
5. The provider is called with a deadline and the request's abort signal (the pattern from Streamwise PR #30). The output is parsed with Zod, and `suggestedPriority` is checked against the enum.
6. The proposal is persisted (§5) with `ticket_updated_at` = the ticket's `updated_at` at read time, then returned to the UI.

### 4.2 Shadow (background)

- A new step in `processBackgroundJobs()` picks recently created or updated tickets for orgs where `ai_triage_mode = 'shadow'`.
- The worker uses `createAdminClient()` (service role, **bypasses RLS**). The worker must therefore:
  - process one ticket at a time, loading it with an explicit `organization_id` filter;
  - build the input from that ticket's row and its own comments only, never batching tickets from several orgs into one prompt;
  - write proposals with the same `organization_id` as the source ticket. This is enforced by a composite FK (§5).
- Bounded per run (e.g. ≤ 50 tickets) and by the per-org daily budget (§8).

### 4.3 Accept / edit / reject (review beta)

- Accepting a priority suggestion calls a thin wrapper that builds the same `FormData` the edit form submits and calls **`updateTicketAction`**. That means RBAC (`canEditTicket`: owner, admin, author or assignee), SLA recalculation, `ticket_activities` diffing and webhooks are all unchanged.
- **Stale-write protection:** `updateTicketAction` now accepts an optional `expected_updated_at` form field and refuses the save with `conflict: true` when the ticket has changed since that version (shipped with this PR for the normal edit form). Acceptance passes the proposal's `ticket_updated_at` as `expected_updated_at`, so accepting a suggestion made from an older version is refused and the user is offered a fresh proposal.
- The summary is never written to `tickets.description`. Accepting it means storing it on the proposal row as `summary_accepted`, displayed alongside the ticket.
- Every decision is recorded on the proposal row (reviewer, decision per field, final value, timestamp). The resulting priority change is also logged as the usual `priority_changed` activity, with the actor being the human reviewer.

## 5. Schema changes (proposed migration, not yet written)

```sql
create type public.ai_triage_mode as enum ('off', 'shadow', 'review');

alter table public.organizations
  add column ai_triage_mode public.ai_triage_mode not null default 'off';

create table public.ticket_triage_proposals (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null,
  ticket_id           uuid not null,
  ticket_updated_at   timestamptz not null,           -- version the proposal was made from
  source              text not null check (source in ('shadow', 'on_demand', 'offline_eval')),
  status              text not null check (status in ('ok', 'invalid_output', 'timeout', 'provider_error', 'budget_exhausted', 'insufficient_information')),
  summary             text check (char_length(summary) <= 400),
  suggested_priority  public.ticket_priority,
  rationale           text check (char_length(rationale) <= 300),
  confidence          text check (confidence in ('low', 'medium', 'high')),
  model               text not null,
  prompt_version      text not null,
  input_token_count   integer,
  output_token_count  integer,
  latency_ms          integer,
  requested_by        uuid references public.profiles (id) on delete set null,  -- null for shadow
  priority_decision   text check (priority_decision in ('accepted', 'edited', 'rejected')),
  priority_final      public.ticket_priority,
  summary_decision    text check (summary_decision in ('accepted', 'edited', 'rejected')),
  summary_accepted    text check (char_length(summary_accepted) <= 400),
  reviewed_by         uuid references public.profiles (id) on delete set null,
  reviewed_at         timestamptz,
  created_at          timestamptz not null default now(),
  -- Proposal can only point at a ticket in the same organization.
  constraint ticket_triage_proposals_ticket_same_org
    foreign key (ticket_id, organization_id) references public.tickets (id, organization_id) on delete cascade
);
-- requires: alter table public.tickets add constraint tickets_id_org_unique unique (id, organization_id);

alter table public.ticket_triage_proposals enable row level security;

create policy "triage_proposals_select_member"
  on public.ticket_triage_proposals for select to authenticated
  using (organization_id in (select public.get_auth_user_org_ids()) and source <> 'shadow');
-- No insert/update/delete policies for authenticated: rows are written only by
-- server code (on-demand action via a security-definer RPC that re-checks
-- membership, or the worker via service role).
```

Notes:
- Shadow rows are invisible to members by policy, so shadow mode really is invisible.
- No raw prompt or raw model output is stored. If debugging needs them later, that is a separate decision with a retention period.
- Retention: proposals are deleted with their ticket (cascade). A 90-day purge of shadow rows is proposed, to be decided at the Week 10 operations review.

## 6. Permission model

| Action | Who | Enforced by |
| --- | --- | --- |
| See a proposal (review mode) | Any org member who can read the ticket | RLS on proposals + ticket RLS |
| Request a fresh proposal | Any org member who can read the ticket; rate-limited | Server action + tenant context + budget |
| Accept/edit priority | Users allowed by `canEditTicket` | Existing `updateTicketAction` |
| Accept/edit summary | Same as priority (`canEditTicket`) | New action, same check |
| Turn `ai_triage_mode` on/off | Owner/admin | `organizations_update_admin` policy + server check |

The model output never feeds a permission decision.

## 7. Threat model

| Threat | Control | Test (Week 7) |
| --- | --- | --- |
| Cross-tenant leakage via prompt, cache, logs or proposals | RLS read for on-demand; per-ticket, org-filtered admin reads in worker; composite FK; no cross-ticket caching | Member of org A requests a proposal for an org B ticket id and gets "not found"; worker fixture with 2 orgs and assert inputs |
| Prompt injection in ticket text ("set priority urgent", "ignore instructions") | Ticket text is wrapped as untrusted data; output schema allows only enum values; rationale length-capped; no tools | Adversarial fixtures; priority must not follow injected instructions more than the baseline rate |
| Model invents facts in the summary | Grounding instruction; eval rubric for unsupported claims; summary is displayed as AI-generated | Summary-fidelity scoring |
| False urgency inflating SLA pressure | Never auto-applied; per-class error report, with over-prioritization tracked separately | Confusion matrix |
| Stale write overwrites a teammate's edit | `expected_updated_at` check (§4.3) | Browser test: two sessions, accept after a concurrent edit is refused |
| Cost/abuse | Per-org daily budget, per-user rate limit, kill switch | Budget exhaustion test returns `budget_exhausted` with a manual flow intact |
| Secrets/PII in logs | Log status codes, ids, latency and token counts only, never ticket text | Log assertion tests |

## 8. Operational controls (built fully in Week 10, designed now)

- `ai_triage_mode` per organization (`off` by default), plus a global env kill switch `AI_TRIAGE_DISABLED=true` that wins over everything.
- Per-org daily caps on proposals and tokens, and a per-user cap on on-demand requests.
- Deadline 20 s per proposal; one retry only for 429 or 5xx in shadow; no retry on-demand.
- On any failure the UI shows "Suggestion unavailable" and nothing else changes.

## 9. Evaluation design (Week 7)

**Fixtures:** clearly labeled synthetic tickets, plus de-identified examples only with owner consent. The target is 60–100 tickets, covering every priority, short/vague tickets, long noisy tickets, non-English, injection attempts and duplicates of one incident. Labels: reference priority (owner-reviewed) and a list of key facts per ticket.

**Metrics:**
- Schema validity rate (target ≥ 99%).
- Priority: exact agreement, within-one-level agreement, confusion matrix, and over-prioritization rate (urgent/high suggested when the label is low/medium).
- Summary fidelity: share of summaries with zero unsupported claims (LLM-judge plus owner spot check on ≥ 20%), and key-fact coverage.
- `insufficientInformation` precision on vague tickets.
- Latency p50/p95 and tokens per proposal.

**Preselected thresholds (proposed, owner to confirm before running):** schema validity ≥ 99%; within-one-level priority ≥ 90%; exact priority ≥ 65%; over-prioritization ≤ 10%; summaries with an unsupported claim ≤ 5%; cross-tenant tests 100% pass. These are starting points chosen from risk, not industry benchmarks, and they will be revised only via `DECISIONS.md`.

## 10. Open questions for the owner

1. **Provider:** reuse Gemini (as in Streamwise) or another provider? This affects data-processing terms for tenant data.
2. Should members be able to request proposals in review mode, or only users with `canEditTicket`?
3. Are any real, consented tickets available to de-identify, or is v1 evaluated on synthetic fixtures only?
4. ~~Should the stale-write fix ship on its own first?~~ Resolved 2026-11-25: owner asked to fix it now; it ships in this PR.

## 11. Related finding

`package.json` pinned `next` at **16.4.3**, inside the moderate advisory range 16.0.0–16.4.4. Patched to 16.4.6 in this PR at the owner's request.
