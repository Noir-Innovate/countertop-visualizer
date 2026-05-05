import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PasswordChangeForm } from "./PasswordChangeForm";
import { EmailChangeForm } from "./EmailChangeForm";

export default async function SecurityPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/dashboard/login");

  const pendingEmail =
    (user as unknown as { new_email?: string | null }).new_email ?? null;

  return (
    <div className="space-y-6">
      <PasswordChangeForm />
      <EmailChangeForm
        currentEmail={user.email ?? ""}
        pendingEmail={pendingEmail}
      />
    </div>
  );
}
