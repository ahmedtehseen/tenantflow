"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Ticket,
  Users,
  Settings,
} from "lucide-react";

interface TenantNavProps {
  slug: string;
}

export function TenantNav({ slug }: TenantNavProps) {
  const pathname = usePathname();

  const links = [
    {
      name: "Overview",
      href: `/org/${slug}`,
      icon: LayoutDashboard,
      exact: true,
    },
    {
      name: "Tickets",
      href: `/org/${slug}/tickets`,
      icon: Ticket,
      exact: false,
    },
    {
      name: "Team & Members",
      href: `/org/${slug}/members`,
      icon: Users,
      exact: false,
    },
    {
      name: "Settings",
      href: `/org/${slug}/settings`,
      icon: Settings,
      exact: false,
    },
  ];

  return (
    <nav className="flex items-center gap-1">
      {links.map((link) => {
        const isActive = link.exact
          ? pathname === link.href
          : pathname.startsWith(link.href);

        const Icon = link.icon;

        return (
          <Link
            key={link.href}
            href={link.href}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              isActive
                ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50"
                : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/50 dark:hover:text-zinc-200"
            }`}
          >
            <Icon className="size-3.5" />
            <span>{link.name}</span>
          </Link>
        );
      })}
    </nav>
  );
}

