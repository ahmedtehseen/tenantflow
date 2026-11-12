"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Markdown from "react-markdown";
import { createClient } from "@/lib/supabase/client";
import { renderMentionTokens } from "@/lib/comments/mention-utils";
import { saveCommentAction, deleteCommentAction } from "../../comments-actions";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import type { MemberOption } from "../../_components/ticket-list";
import type { OrgRole, TicketComment } from "@/types/database";

export function TicketComments({
  orgId,
  orgSlug,
  ticketId,
  userId,
  role,
  members,
}: {
  orgId: string;
  orgSlug: string;
  ticketId: string;
  userId: string;
  role: OrgRole;
  members: MemberOption[];
}) {
  const [comments, setComments] = useState<TicketComment[]>([]);
  const [content, setContent] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [pending, startTransition] = useTransition();
  const [caret, setCaret] = useState(0);
  const input = useRef<HTMLTextAreaElement>(null);
  const reload = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    const client = createClient();
    let disposed = false;
    let request = 0;
    async function refresh() {
      const current = ++request;
      const result = await client
        .from("ticket_comments")
        .select("*")
        .eq("organization_id", orgId)
        .eq("ticket_id", ticketId)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true });
      if (disposed || current !== request) return;
      setLoading(false);
      if (result.error) setError("Unable to load discussion. Try refreshing.");
      else setComments(result.data || []);
    }
    reload.current = refresh;
    const channel = client
      .channel(`comments:ticket:${ticketId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "ticket_comments",
          filter: `ticket_id=eq.${ticketId}`,
        },
        refresh,
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "ticket_comments",
          filter: `ticket_id=eq.${ticketId}`,
        },
        refresh,
      )
      // DELETE payloads only include primary keys under RLS. Re-fetch our scoped discussion.
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "ticket_comments" },
        refresh,
      );
    async function subscribe() {
      await client.realtime.setAuth();
      if (disposed) return;
      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") void refresh();
      });
    }
    void subscribe().catch(() => {
      if (!disposed)
        setError("Live discussion unavailable. Refresh to try again.");
    });
    void refresh();
    const timer = setInterval(refresh, 60000);
    return () => {
      disposed = true;
      clearInterval(timer);
      void client.removeChannel(channel);
    };
  }, [orgId, ticketId]);

  const mention = content.slice(0, caret).match(/(?:^|\s)@([^@\[\]\n]*)$/);
  const suggestions = mention
    ? members
        .filter((member) =>
          (member.full_name || member.email)
            .toLowerCase()
            .includes(mention[1].toLowerCase()),
        )
        .slice(0, 6)
    : [];

  function insertMention(member: MemberOption) {
    const start = caret - (mention?.[1].length || 0) - 1;
    const name = (member.full_name || member.email).replace(/[\[\]\r\n]/g, " ");
    const token = `@[${name}](${member.user_id}) `;
    setContent(content.slice(0, start) + token + content.slice(caret));
    setCaret(start + token.length);
    requestAnimationFrame(() => {
      input.current?.focus();
      input.current?.setSelectionRange(
        start + token.length,
        start + token.length,
      );
    });
  }

  function save() {
    startTransition(async () => {
      try {
        const result = await saveCommentAction(
          orgSlug,
          orgId,
          ticketId,
          editingId,
          content,
        );
        if (result.error) {
          setError(result.error);
          return;
        }
        setContent("");
        setEditingId(null);
        setError("");
        await reload.current();
      } catch {
        setError("Unable to save comment. Your draft has been kept.");
      }
    });
  }

  return (
    <section
      aria-label="Ticket discussion"
      className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900 space-y-4"
    >
      <h2 className="text-sm font-semibold">Discussion</h2>
      {loading && (
        <p role="status" className="text-sm text-zinc-500">
          Loading discussion…
        </p>
      )}
      {!loading && !comments.length && (
        <p className="text-sm text-zinc-500">
          Start the discussion with your team.
        </p>
      )}
      <ol className="space-y-4">
        {comments.map((comment) => {
          const author = members.find(
            (member) => member.user_id === comment.author_id,
          );
          return (
            <li
              key={comment.id}
              className="border-b border-zinc-100 pb-4 dark:border-zinc-800"
            >
              <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                <strong className="text-zinc-800 dark:text-zinc-200">
                  {author?.full_name || author?.email || "Former member"}
                </strong>
                <time dateTime={comment.created_at}>
                  {new Date(comment.created_at).toLocaleString()}
                </time>
                {comment.is_edited && <span>Edited</span>}
                {comment.author_id === userId && (
                  <button
                    type="button"
                    disabled={pending}
                    className="text-indigo-600"
                    onClick={() => {
                      setEditingId(comment.id);
                      setContent(comment.content);
                      input.current?.focus();
                    }}
                  >
                    Edit
                  </button>
                )}
                {(comment.author_id === userId ||
                  role === "admin" ||
                  role === "owner") && (
                  <button
                    type="button"
                    disabled={pending}
                    className="text-red-600"
                    onClick={() => setDeletingId(comment.id)}
                  >
                    Delete
                  </button>
                )}
              </div>
              <div className="mt-2 break-words text-sm leading-relaxed [&_a]:text-indigo-600 [&_a]:underline [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_pre]:overflow-x-auto [&_pre]:bg-zinc-100 [&_pre]:p-3 dark:[&_pre]:bg-zinc-800 [&_p]:my-2">
                <Markdown skipHtml>
                  {renderMentionTokens(comment.content)}
                </Markdown>
              </div>
            </li>
          );
        })}
      </ol>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
        className="space-y-2"
      >
        <label htmlFor="comment-content" className="block text-xs font-medium">
          {editingId ? "Edit comment" : "Add a comment"}
        </label>
        <textarea
          ref={input}
          id="comment-content"
          required
          maxLength={10000}
          rows={3}
          value={content}
          disabled={pending}
          onChange={(event) => {
            setContent(event.target.value);
            setCaret(event.target.selectionStart);
          }}
          onSelect={(event) => setCaret(event.currentTarget.selectionStart)}
          aria-describedby="comment-help"
          className="w-full rounded-lg border border-zinc-300 bg-transparent p-3 text-sm dark:border-zinc-700"
        />
        <p id="comment-help" className="text-xs text-zinc-500">
          Markdown supported. Type @ to mention a teammate.
        </p>
        {suggestions.length > 0 && (
          <div
            aria-label="Mention suggestions"
            className="flex flex-wrap gap-2"
          >
            {suggestions.map((member) => (
              <button
                type="button"
                key={member.user_id}
                disabled={pending}
                onClick={() => insertMention(member)}
                className="rounded border border-zinc-200 px-2 py-1 text-xs dark:border-zinc-700"
              >
                @{member.full_name || member.email}
              </button>
            ))}
          </div>
        )}
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={pending || !content.trim()}
            className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
          >
            {pending ? "Saving…" : editingId ? "Save comment" : "Post comment"}
          </button>
          {editingId && (
            <button
              type="button"
              disabled={pending}
              className="text-xs"
              onClick={() => {
                setEditingId(null);
                setContent("");
              }}
            >
              Cancel edit
            </button>
          )}
        </div>
      </form>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <ConfirmModal
        isOpen={!!deletingId}
        isLoading={pending}
        title="Delete comment?"
        description="This comment will be removed from the discussion."
        confirmText="Delete comment"
        onClose={() => setDeletingId(null)}
        onConfirm={() => {
          startTransition(async () => {
            try {
              const result = await deleteCommentAction(
                orgSlug,
                orgId,
                ticketId,
                deletingId!,
              );
              if (result.error) {
                setError(result.error);
                return;
              }
              if (editingId === deletingId) {
                setEditingId(null);
                setContent("");
              }
              setDeletingId(null);
              setError("");
              await reload.current();
            } catch {
              setError("Unable to delete comment. Try again.");
            }
          });
        }}
      />
    </section>
  );
}
