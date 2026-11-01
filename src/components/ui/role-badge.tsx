import { ShieldAlert, Shield, User } from "lucide-react";
import type { OrgRole } from "@/types/database";

interface RoleBadgeProps {
  role: OrgRole;
  className?: string;
}

export function RoleBadge({ role, className = "" }: RoleBadgeProps) {
  switch (role) {
    case "owner":
      return (
        <span
          className={`inline-flex items-center gap-1 rounded bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-950/70 dark:text-indigo-300 ${className}`}
        >
          <ShieldAlert className="size-3" />
          Owner
        </span>
      );
    case "admin":
      return (
        <span
          className={`inline-flex items-center gap-1 rounded bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700 dark:bg-sky-950/70 dark:text-sky-300 ${className}`}
        >
          <Shield className="size-3" />
          Admin
        </span>
      );
    default:
      return (
        <span
          className={`inline-flex items-center gap-1 rounded bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 ${className}`}
        >
          <User className="size-3" />
          Member
        </span>
      );
  }
}
