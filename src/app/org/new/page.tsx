import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Building2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { CreateOrganizationForm } from "./organization-form";

async function AuthCheck({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return <>{children}</>;
}

export default function NewOrganizationPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-4 py-12 dark:bg-zinc-950">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center space-y-2">
          <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
            <Building2 className="size-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Create a new organization
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Set up an isolated multi-tenant workspace for your team and operations.
          </p>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
          <Suspense
            fallback={
              <div className="h-48 flex items-center justify-center text-sm text-zinc-400">
                Checking authentication...
              </div>
            }
          >
            <AuthCheck>
              <CreateOrganizationForm />
            </AuthCheck>
          </Suspense>
        </div>
      </div>
    </div>
  );
}

