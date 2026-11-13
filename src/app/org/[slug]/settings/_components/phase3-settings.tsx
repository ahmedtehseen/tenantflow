"use client";

import { useState, useTransition } from "react";
import { useSWRConfig } from "swr";
import type { WorkspaceData } from "@/lib/data/workspace";
import { applySavedPolicy, applySavedWebhook } from "#workspace/saved-data";
import {
  useRefreshWorkspace,
  useWorkspaceState,
  useWorkspace,
} from "@/components/workspace/workspace-provider";
import { DraftInput, DraftCheckbox } from "@/components/workspace/draft-input";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { SLA_TARGET_FIELDS } from "@/lib/sla/policy";
import { updateSLAPolicyAction } from "../sla-actions";
import {
  saveWebhookAction,
  updateWebhookAction,
  retryWebhookDeliveryAction,
} from "../webhooks/actions";
import type {
  OrganizationSLAPolicy,
  OrganizationWebhook,
  WebhookDelivery,
} from "@/types/database";

const inputClass =
  "w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700";
const buttonClass =
  "rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-50";
const EVENTS = [
  "ticket.created",
  "ticket.status_changed",
  "ticket.commented",
  "sla.breached",
];

export function Phase3Settings({
  orgId,
  slug,
  policy,
  webhooks,
  deliveries,
  canManage,
  children,
}: {
  orgId: string;
  slug: string;
  policy: OrganizationSLAPolicy | null;
  webhooks: OrganizationWebhook[];
  deliveries: WebhookDelivery[];
  canManage: boolean;
  children: React.ReactNode;
}) {
  const { state: screenState } = useWorkspace();
  const [tab, setTab] = useWorkspaceState("settings:tab", "general");
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editingId, setEditingId] = useWorkspaceState<string | null>(
    "settings:webhook-edit",
    null,
  );
  const editing = webhooks.find((webhook) => webhook.id === editingId);
  const refresh = useRefreshWorkspace();
  const { mutate } = useSWRConfig();
  function run(
    action: () => Promise<{
      error?: string;
      success?: boolean;
      policy?: OrganizationSLAPolicy;
      webhook?: OrganizationWebhook;
    }>,
    successMessage: string,
    draftPrefix?: string,
  ) {
    startTransition(async () => {
      try {
        const result = await action();
        if (result.error) {
          setError(result.error);
          setMessage("");
          return;
        }
        if (result.policy) {
          const savedPolicy = result.policy;
          await mutate(
            () => true,
            (current: WorkspaceData | undefined) =>
              applySavedPolicy(current, savedPolicy),
            { revalidate: false },
          );
        }
        if (result.webhook) {
          const savedWebhook = result.webhook;
          await mutate(
            () => true,
            (current: WorkspaceData | undefined) =>
              applySavedWebhook(current, savedWebhook),
            { revalidate: false },
          );
        }
        setError("");
        setMessage(successMessage);
        if (deleteId === editingId) setEditingId(null);
        setDeleteId(null);
        await refresh();
        if (draftPrefix) screenState.clear(draftPrefix);
      } catch {
        setError("Unable to save changes. Try again.");
        setMessage("");
      }
    });
  }
  return (
    <div className="space-y-5">
      <div
        aria-label="Settings sections"
        className="flex gap-2 border-b border-zinc-200 pb-3 dark:border-zinc-800"
      >
        {[
          ["general", "General"],
          ["sla", "SLA policy"],
          ["webhooks", "Webhooks"],
        ].map(([key, label]) => (
          <button
            type="button"
            key={key}
            aria-pressed={tab === key}
            aria-controls={`settings-${key}`}
            onClick={() => {
              setTab(key);
              setMessage("");
              setError("");
            }}
            className={`rounded-lg px-3 py-2 text-xs font-medium ${tab === key ? "bg-indigo-600 text-white" : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="text-sm text-emerald-600">
          {message}
        </p>
      )}
      <div id="settings-general" hidden={tab !== "general"}>
        {children}
      </div>
      <section
        id="settings-sla"
        hidden={tab !== "sla"}
        className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
      >
        <h2 className="text-sm font-semibold">SLA policy</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Targets count business minutes. Policy changes apply to new tickets
          and future priority changes.
        </p>
        {!policy ? (
          <p role="alert" className="mt-4 text-sm text-red-600">
            SLA policy unavailable. Check that the database migrations have been
            applied.
          </p>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              run(
                () => updateSLAPolicyAction(slug, orgId, data),
                "SLA policy saved.",
                "settings:sla:",
              );
            }}
            className="mt-5 space-y-5"
          >
            <fieldset
              disabled={!canManage || pending}
              className="space-y-5 disabled:opacity-70"
            >
              <div className="grid gap-4 sm:grid-cols-3">
                <label className="space-y-1 text-xs">
                  Timezone
                  <DraftInput
                    name="timezone"
                    draftKey="settings:sla:timezone"
                    required
                    serverValue={policy.timezone}
                    placeholder="Asia/Karachi"
                    className={inputClass}
                  />
                </label>
                <label className="space-y-1 text-xs">
                  Opens at
                  <DraftInput
                    type="time"
                    name="business_start_time"
                    draftKey="settings:sla:business_start_time"
                    required
                    serverValue={policy.business_start_time.slice(0, 5)}
                    className={inputClass}
                  />
                </label>
                <label className="space-y-1 text-xs">
                  Closes at
                  <DraftInput
                    type="time"
                    name="business_end_time"
                    draftKey="settings:sla:business_end_time"
                    required
                    serverValue={policy.business_end_time.slice(0, 5)}
                    className={inputClass}
                  />
                </label>
              </div>
              <fieldset>
                <legend className="mb-2 text-xs font-medium">
                  Business days
                </legend>
                <div className="flex flex-wrap gap-4">
                  {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(
                    (day, index) => (
                      <label
                        key={day}
                        className="flex items-center gap-2 text-xs"
                      >
                        <DraftCheckbox
                          draftKey={`settings:sla:day:${index + 1}`}
                          name="business_days"
                          value={index + 1}
                          serverChecked={policy.business_days.includes(
                            index + 1,
                          )}
                        />
                        {day}
                      </label>
                    ),
                  )}
                </div>
              </fieldset>
              <div className="grid gap-4 sm:grid-cols-2">
                {SLA_TARGET_FIELDS.map((field) => (
                  <label key={field} className="space-y-1 text-xs capitalize">
                    {field.replaceAll("_", " ")}
                    <DraftInput
                      type="number"
                      min={1}
                      max={525600}
                      required
                      name={field}
                      draftKey={`settings:sla:${field}`}
                      serverValue={policy[field]}
                      className={inputClass}
                    />
                  </label>
                ))}
              </div>
              {canManage && (
                <button type="submit" className={buttonClass}>
                  {pending ? "Saving…" : "Save SLA policy"}
                </button>
              )}
            </fieldset>
          </form>
        )}
        {!canManage && (
          <p className="mt-3 text-xs text-zinc-500">
            Workspace owners and administrators can change this policy.
          </p>
        )}
      </section>
      <section
        id="settings-webhooks"
        hidden={tab !== "webhooks"}
        className="space-y-5"
      >
        {!canManage ? (
          <p className="text-sm text-zinc-500">
            Workspace owners and administrators manage webhooks.
          </p>
        ) : (
          <>
            <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
              <h2 className="text-sm font-semibold">
                {editing ? "Edit webhook endpoint" : "Add webhook endpoint"}
              </h2>
              <form
                key={editingId || "new"}
                onSubmit={(event) => {
                  event.preventDefault();
                  const form = event.currentTarget;
                  const data = new FormData(form);
                  run(
                    async () => {
                      const result = await saveWebhookAction(
                        slug,
                        orgId,
                        editingId,
                        data,
                      );
                      if (result.success) {
                        form.reset();
                        setEditingId(null);
                      }
                      return result;
                    },
                    editingId
                      ? "Webhook endpoint saved."
                      : "Webhook endpoint created.",
                    `settings:webhook:${editingId || "new"}:`,
                  );
                }}
                className="mt-4 space-y-4"
              >
                <fieldset disabled={pending} className="space-y-4">
                  <label className="block space-y-1 text-xs">
                    HTTPS endpoint
                    <DraftInput
                      type="url"
                      name="url"
                      draftKey={`settings:webhook:${editingId || "new"}:url`}
                      serverValue={editing?.url || ""}
                      required
                      placeholder="https://example.com/webhooks/tenantflow"
                      className={inputClass}
                    />
                  </label>
                  <label className="block space-y-1 text-xs">
                    Description
                    <DraftInput
                      name="description"
                      draftKey={`settings:webhook:${editingId || "new"}:description`}
                      serverValue={editing?.description || ""}
                      maxLength={200}
                      className={inputClass}
                    />
                  </label>
                  <fieldset>
                    <legend className="mb-2 text-xs font-medium">Events</legend>
                    <div className="flex flex-wrap gap-4">
                      {EVENTS.map((event) => (
                        <label
                          key={event}
                          className="flex items-center gap-2 text-xs"
                        >
                          <DraftCheckbox
                            draftKey={`settings:webhook:${editingId || "new"}:event:${event}`}
                            name="events"
                            value={event}
                            serverChecked={
                              editing ? editing.events.includes(event) : true
                            }
                          />
                          {event}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <button type="submit" className={buttonClass}>
                    {editing ? "Save endpoint" : "Add endpoint"}
                  </button>
                  {editingId && (
                    <button
                      type="button"
                      className="ml-3 text-xs"
                      onClick={() => setEditingId(null)}
                    >
                      Cancel edit
                    </button>
                  )}
                </fieldset>
              </form>
            </div>
            <div className="space-y-3">
              {!webhooks.length && (
                <p className="text-sm text-zinc-500">
                  No webhook endpoints configured.
                </p>
              )}
              {webhooks.map((webhook) => (
                <article
                  key={webhook.id}
                  className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="break-all text-sm font-medium">
                      {webhook.description || webhook.url}
                    </h3>
                    <span className="text-xs text-zinc-500">
                      {webhook.is_active ? "Active" : "Disabled"}
                    </span>
                  </div>
                  {webhook.description && (
                    <p className="mt-1 break-all text-xs text-zinc-500">
                      {webhook.url}
                    </p>
                  )}
                  <p className="mt-2 break-words text-xs text-zinc-500">
                    {webhook.events.join(", ")}
                  </p>
                  <details className="my-3 text-xs">
                    <summary className="cursor-pointer">Signing secret</summary>
                    <code className="mt-2 block break-all select-all">
                      {webhook.secret}
                    </code>
                    <p className="mt-2 text-zinc-500">
                      Verify X-TenantFlow-Signature against the raw request body
                      using HMAC-SHA256. Deduplicate requests using
                      X-TenantFlow-Delivery.
                    </p>
                  </details>
                  <div className="flex gap-4">
                    <button
                      type="button"
                      disabled={pending}
                      className="text-xs text-indigo-600"
                      onClick={() => setEditingId(webhook.id)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        run(
                          () =>
                            updateWebhookAction(
                              slug,
                              orgId,
                              webhook.id,
                              webhook.is_active ? "disable" : "enable",
                            ),
                          "Webhook updated.",
                        )
                      }
                      className="text-xs text-indigo-600"
                    >
                      {webhook.is_active ? "Disable" : "Enable"}
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => setDeleteId(webhook.id)}
                      className="text-xs text-red-600"
                    >
                      Delete
                    </button>
                  </div>
                </article>
              ))}
            </div>
            <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
              <h2 className="text-sm font-semibold">Recent deliveries</h2>
              {!deliveries.length && (
                <p className="mt-3 text-xs text-zinc-500">No deliveries yet.</p>
              )}
              <ul className="mt-3 divide-y divide-zinc-100 dark:divide-zinc-800">
                {deliveries.map((delivery) => (
                  <li key={delivery.id} className="space-y-1 py-3 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <strong>{delivery.event_type}</strong>
                      <span>
                        {delivery.status} · {delivery.attempts}/
                        {delivery.max_attempts} attempts
                      </span>
                    </div>
                    <p className="break-all text-zinc-500">
                      {webhooks.find(
                        (webhook) => webhook.id === delivery.webhook_id,
                      )?.url || delivery.webhook_id}
                    </p>
                    {delivery.last_error && (
                      <p className="text-red-600">{delivery.last_error}</p>
                    )}
                    {delivery.next_retry_at && (
                      <p className="text-zinc-500">
                        Retry after{" "}
                        {new Date(delivery.next_retry_at).toLocaleString()}
                      </p>
                    )}
                    {delivery.status === "failed" && (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() =>
                          run(
                            () =>
                              retryWebhookDeliveryAction(
                                slug,
                                orgId,
                                delivery.id,
                              ),
                            "Delivery queued for retry.",
                          )
                        }
                        className="text-indigo-600"
                      >
                        Retry delivery
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </section>
      <ConfirmModal
        isOpen={!!deleteId}
        isLoading={pending}
        title="Delete webhook endpoint?"
        description="The endpoint and its delivery history will be deleted."
        confirmText="Delete endpoint"
        onClose={() => setDeleteId(null)}
        onConfirm={() =>
          run(
            () => updateWebhookAction(slug, orgId, deleteId!, "delete"),
            "Webhook deleted.",
          )
        }
      />
    </div>
  );
}
