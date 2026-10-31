"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { login, type AuthFormState } from "../actions";
import { Field, FormAlert, SubmitButton } from "../_components/form-controls";

const CALLBACK_ERRORS: Record<string, string> = {
  auth_callback_failed:
    "That sign-in link is invalid or has expired. Please try again.",
};

export function LoginForm() {
  const searchParams = useSearchParams();
  const [state, formAction] = useActionState<AuthFormState, FormData>(login, {});

  const callbackError = CALLBACK_ERRORS[searchParams.get("error") ?? ""];
  const error = state.error ?? callbackError;

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <input type="hidden" name="next" value={searchParams.get("next") ?? ""} />
      {error && <FormAlert tone="error">{error}</FormAlert>}
      <Field
        label="Email"
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        required
        defaultValue={state.fields?.email}
        placeholder="you@company.com"
      />
      <Field
        label="Password"
        id="password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
      />
      <SubmitButton pendingLabel="Signing in…">Sign in</SubmitButton>
    </form>
  );
}
