"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { safeRedirectPath } from "@/lib/utils";
import { getAppBaseUrl } from "@/lib/invitations/invitation-utils";

export type AuthFormState = {
  error?: string;
  message?: string;
  fields?: { email?: string; fullName?: string };
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function login(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = readString(formData, "email").toLowerCase();
  const password = formData.get("password");
  const next = safeRedirectPath(readString(formData, "next"));

  if (!EMAIL_RE.test(email) || typeof password !== "string" || !password) {
    return { error: "Enter a valid email and password.", fields: { email } };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Generic message to avoid leaking which accounts exist.
    return { error: "Invalid email or password.", fields: { email } };
  }

  revalidatePath("/", "layout");
  redirect(next);
}

export async function signup(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const fullName = readString(formData, "fullName");
  const email = readString(formData, "email").toLowerCase();
  const password = formData.get("password");
  const next = safeRedirectPath(readString(formData, "next"));
  const fields = { email, fullName };

  if (!fullName || fullName.length > 120) {
    return { error: "Enter your full name.", fields };
  }
  if (!EMAIL_RE.test(email)) {
    return { error: "Enter a valid email address.", fields };
  }
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    return {
      error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
      fields,
    };
  }

  const headerList = await headers();
  const appBaseUrl = getAppBaseUrl(headerList);
  const callbackUrl = new URL("/auth/callback", appBaseUrl);
  if (next && next !== "/") {
    callbackUrl.searchParams.set("next", next);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // Consumed by public.handle_new_user() to populate public.profiles.
      data: { full_name: fullName },
      emailRedirectTo: callbackUrl.toString(),
    },
  });

  if (error) {
    return { error: error.message, fields };
  }

  // Email confirmation enabled: no session until the link is clicked.
  if (!data.session) {
    return {
      message: "Check your email for a confirmation link to finish signing up.",
    };
  }

  revalidatePath("/", "layout");
  redirect(next);
}
