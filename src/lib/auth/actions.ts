"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function signOutAction() {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  if (error) return { error: "Unable to sign out. Try again." };
  revalidatePath("/", "layout");
  return { success: true };
}
