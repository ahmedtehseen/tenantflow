"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Building2,
  Check,
  ChevronsUpDown,
  Plus,
  Shield,
  ShieldAlert,
  User,
} from "lucide-react";
import type { OrgRole } from "@/types/database";

interface TenantOrg {
  id: string;
  name: string;
  slug: string;
  role: OrgRole;
}

interface TenantSwitcherProps {
  currentOrg: {
    id: string;
    name: string;
    slug: string;
  };
  currentRole: OrgRole;
  organizations: TenantOrg[];
}

export function TenantSwitcher({
  currentOrg,
  currentRole,
  organizations,
}: TenantSwitcherProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Close dropdown on outside click or Escape key
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const getRoleBadge = (role: OrgRole) => {
    switch (role) {
      case "owner":
        return (
          <span className="inline-flex items-center gap-1 rounded bg-indigo-50 px-1.5 py-0.5 text-[11px] font-medium text-indigo-700 dark:bg-indigo-950/70 dark:text-indigo-300">
            <ShieldAlert className="size-3" />
            Owner
          </span>
        );
      case "admin":
        return (
          <span className="inline-flex items-center gap-1 rounded bg-sky-50 px-1.5 py-0.5 text-[11px] font-medium text-sky-700 dark:bg-sky-950/70 dark:text-sky-300">
            <Shield className="size-3" />
            Admin
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
            <User className="size-3" />
            Member
          </span>
        );
    }
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-2.5 rounded-xl border border-zinc-200/80 bg-white px-3 py-1.5 text-left shadow-2xs hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800/80 transition cursor-pointer"
        aria-expanded={open}
        aria-haspopup="true"
      >
        <div className="flex size-7 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 shrink-0">
          <Building2 className="size-4" />
        </div>
        <div className="flex flex-col min-w-0 pr-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-xs font-semibold text-zinc-900 dark:text-zinc-100 max-w-[140px] sm:max-w-[200px]">
              {currentOrg.name}
            </span>
            {getRoleBadge(currentRole)}
          </div>
          <span className="font-mono text-[11px] text-zinc-400 truncate">
            {currentOrg.slug}
          </span>
        </div>
        <ChevronsUpDown className="size-3.5 text-zinc-400 shrink-0 ml-auto" />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-2 w-72 rounded-2xl border border-zinc-200 bg-white p-2 shadow-xl dark:border-zinc-800 dark:bg-zinc-900 animate-in fade-in zoom-in-95 duration-100">
          <div className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
            Switch Organization
          </div>

          <div className="max-h-60 overflow-y-auto space-y-1 py-1">
            {organizations.map((org) => {
              const isActive = org.id === currentOrg.id;
              return (
                <button
                  key={org.id}
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    if (!isActive) {
                      router.push(`/org/${org.slug}`);
                    }
                  }}
                  className={`flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-xs transition cursor-pointer ${
                    isActive
                      ? "bg-zinc-100 font-semibold text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50"
                      : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-100"
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="flex size-6 items-center justify-center rounded-md bg-zinc-200/60 dark:bg-zinc-700/60 text-zinc-600 dark:text-zinc-300 shrink-0">
                      <Building2 className="size-3.5" />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="truncate">{org.name}</span>
                      <span className="font-mono text-[10px] text-zinc-400">
                        {org.slug}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    {getRoleBadge(org.role)}
                    {isActive && <Check className="size-3.5 text-indigo-600" />}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-1 border-t border-zinc-100 pt-1 dark:border-zinc-800">
            <Link
              href="/org/new"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded-xl px-2.5 py-2 text-xs font-medium text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-950/50 transition"
            >
              <Plus className="size-4" />
              <span>Create New Organization</span>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

