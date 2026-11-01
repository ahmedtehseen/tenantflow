import {
  AlertCircle,
  ArrowUp,
  ArrowRight,
  ArrowDown,
} from "lucide-react";
import type { TicketPriority } from "@/types/database";

interface TicketPriorityBadgeProps {
  priority: TicketPriority;
}

export function TicketPriorityBadge({ priority }: TicketPriorityBadgeProps) {
  const getPriorityConfig = (p: TicketPriority) => {
    switch (p) {
      case "urgent":
        return {
          label: "Urgent",
          icon: AlertCircle,
          classes:
            "bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300 border-red-200 dark:border-red-900/60",
        };
      case "high":
        return {
          label: "High",
          icon: ArrowUp,
          classes:
            "bg-orange-50 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300 border-orange-200 dark:border-orange-900/60",
        };
      case "medium":
        return {
          label: "Medium",
          icon: ArrowRight,
          classes:
            "bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border-blue-200 dark:border-blue-900/60",
        };
      case "low":
        return {
          label: "Low",
          icon: ArrowDown,
          classes:
            "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700",
        };
    }
  };

  const config = getPriorityConfig(priority);
  const Icon = config.icon;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium ${config.classes}`}
    >
      <Icon className="size-3" />
      {config.label}
    </span>
  );
}

