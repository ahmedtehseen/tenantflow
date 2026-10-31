"use client";

import { useActionState } from "react";
import { signup, type AuthFormState } from "../actions";
import { Field, FormAlert, SubmitButton } from "../_components/form-controls";

export function SignupForm() {
  const [state, formAction] = useActionState<AuthFormState, FormData>(signup, {});

  if (state.message) {
    return <FormAlert tone="success">{state.message}</FormAlert>;
  }

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state.error && <FormAlert tone="error">{state.error}</FormAlert>}
      <Field
        label="Full name"
        id="fullName"
        name="fullName"
        type="text"
        autoComplete="name"
        required
        maxLength={120}
        defaultValue={state.fields?.fullName}
        placeholder="Jane Doe"
      />
      <Field
        label="Work email"
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
        autoComplete="new-password"
        required
        minLength={8}
        aria-describedby="password-hint"
      />
      <p id="password-hint" className="-mt-2 text-xs text-zinc-500 dark:text-zinc-400">
        At least 8 characters.
      </p>
      <SubmitButton pendingLabel="Creating account…">Create account</SubmitButton>
    </form>
  );
}
