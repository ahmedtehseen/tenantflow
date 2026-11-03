"use client";

import type { PresenceUser, OrgRole } from "@/types/database";

export interface PresenceAvatarsProps {
  users?: PresenceUser[];
  className?: string;
}

function getAvatarRoleStyle(role: OrgRole): string {
  switch (role) {
    case "owner":
      return "bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-200";
    case "admin":
      return "bg-indigo-100 text-indigo-800 dark:bg-indigo-950/80 dark:text-indigo-200";
    case "member":
    default:
      return "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
  }
}

export function PresenceAvatars({ users = [], className = "" }: PresenceAvatarsProps) {
  const visibleUsers = users.slice(0, 4);
  const overflowCount = users.length > 4 ? users.length - 4 : 0;

  return (
    <div
      className={`flex items-center gap-2 ${className}`}
      role="region"
      aria-label="Active workspace users"
    >
      {/* Green pulse indicator for live connectivity */}
      <div
        className="flex items-center gap-1.5"
        title={users.length > 0 ? "Realtime presence active" : "Connecting presence..."}
      >
        <span className="relative flex size-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
        </span>
      </div>

      {/* Avatar Stack */}
      {users.length > 0 ? (
        <div className="flex -space-x-1.5 overflow-hidden items-center">
          {visibleUsers.map((user) => {
            const displayName = user.fullName || user.email || "User";
            const tooltip = `${displayName} (${user.role})`;
            const initial = displayName.trim().charAt(0).toUpperCase() || "?";
            const roleStyle = getAvatarRoleStyle(user.role);

            return (
              <div
                key={user.userId}
                title={tooltip}
                aria-label={tooltip}
                className={`relative inline-flex size-6 items-center justify-center rounded-full text-[11px] font-semibold ring-2 ring-white dark:ring-zinc-900 shadow-2xs select-none ${roleStyle}`}
              >
                {user.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={user.avatarUrl}
                    alt={displayName}
                    className="size-full rounded-full object-cover"
                  />
                ) : (
                  <span>{initial}</span>
                )}
              </div>
            );
          })}

          {overflowCount > 0 && (
            <div
              title={`${overflowCount} more online`}
              aria-label={`${overflowCount} more online`}
              className="relative inline-flex size-6 items-center justify-center rounded-full bg-zinc-200 text-[10px] font-bold text-zinc-700 ring-2 ring-white dark:bg-zinc-700 dark:text-zinc-200 dark:ring-zinc-900 select-none shadow-2xs"
            >
              +{overflowCount}
            </div>
          )}
        </div>
      ) : (
        <span className="text-[11px] text-zinc-400 dark:text-zinc-500">Live</span>
      )}
    </div>
  );
}
