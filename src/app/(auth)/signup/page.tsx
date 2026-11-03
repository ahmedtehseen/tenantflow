import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = {
  title: "Create account · TenantFlow",
};

export default function SignupPage() {
  return (
    <>
      <div className="mb-6 space-y-1">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          Create your account
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Get your team running on TenantFlow in minutes.
        </p>
      </div>
      {/* useSearchParams() is request-time data; keep it behind a boundary. */}
      <Suspense fallback={<div className="h-56" aria-hidden="true" />}>
        <SignupForm />
      </Suspense>
      <p className="mt-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
        Already have an account?{" "}
        <Link
          href="/login"
          className="font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
        >
          Sign in
        </Link>
      </p>
    </>
  );
}
