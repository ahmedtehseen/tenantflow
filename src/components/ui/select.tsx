import * as React from "react";
import { ChevronDown } from "lucide-react";

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  containerClassName?: string;
  iconClassName?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      className = "",
      containerClassName = "",
      iconClassName = "",
      children,
      disabled,
      ...props
    },
    ref,
  ) => {
    return (
      <div className={`relative inline-block ${containerClassName}`}>
        <select
          ref={ref}
          disabled={disabled}
          className={`appearance-none cursor-pointer rounded-lg border border-zinc-200 bg-white pl-3 pr-8 py-1.5 text-xs font-medium text-zinc-800 shadow-2xs outline-none transition hover:bg-zinc-50 focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600/20 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800/80 ${className}`}
          {...props}
        >
          {children}
        </select>
        <ChevronDown
          className={`pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 size-3.5 text-zinc-400 dark:text-zinc-500 ${
            disabled ? "opacity-50" : ""
          } ${iconClassName}`}
          aria-hidden="true"
        />
      </div>
    );
  },
);

Select.displayName = "Select";

