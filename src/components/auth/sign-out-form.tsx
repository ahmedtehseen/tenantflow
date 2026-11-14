"use client";

import { useState } from "react";
import { signOutAction } from "@/lib/auth/actions";

export function SignOutForm({ children }: { children: React.ReactNode }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      action={async () => {
        try {
          const result = await signOutAction();
          if (result.error) {
            setError(result.error);
            return;
          }
          // Clear all retained React routes and workspace memory after signing out.
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination
          window.location.assign("/");
        } catch {
          setError("Unable to sign out. Try again.");
        }
      }}
    >
      {children}
      {error && (
        <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </form>
  );
}
