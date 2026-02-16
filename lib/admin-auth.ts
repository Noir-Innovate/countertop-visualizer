import { createClient } from "@/lib/supabase/server";

/**
 * Returns the current user's profile if they are a super_admin; otherwise null.
 * Use in admin API routes to gate access.
 */
export async function requireSuperAdmin(): Promise<{
  userId: string;
  profile: { id: string; is_super_admin: boolean };
} | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, is_super_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_super_admin) return null;
  return { userId: user.id, profile };
}
