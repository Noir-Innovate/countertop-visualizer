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

/**
 * Returns true if the current user is a super admin. Use to bypass org-scoped
 * access checks (e.g. dashboard, organizations, material lines).
 */
export async function isSuperAdmin(): Promise<boolean> {
  const admin = await requireSuperAdmin();
  return admin !== null;
}

/**
 * Returns org access info for the current user. Super admins have access to
 * all organizations. Regular users need membership.
 */
export async function getOrgAccess(organizationId: string): Promise<{
  allowed: boolean;
  role: string;
} | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: profile }, { data: membership }] = await Promise.all([
    supabase
      .from("profiles")
      .select("is_super_admin")
      .eq("id", user.id)
      .single(),
    supabase
      .from("organization_members")
      .select("role")
      .eq("profile_id", user.id)
      .eq("organization_id", organizationId)
      .single(),
  ]);

  if (profile?.is_super_admin) {
    return { allowed: true, role: "super_admin" };
  }
  if (membership?.role) {
    return { allowed: true, role: membership.role };
  }
  return null;
}

/**
 * Returns material line access info. Resolves org via material line, then
 * uses getOrgAccess. Super admins have access to all material lines.
 */
export async function getMaterialLineAccess(materialLineId: string): Promise<{
  allowed: boolean;
  role: string;
  organizationId: string;
} | null> {
  const { createServiceClient } = await import("@/lib/supabase/server");
  const service = await createServiceClient();
  const { data: materialLine } = await service
    .from("material_lines")
    .select("organization_id")
    .eq("id", materialLineId)
    .single();

  if (!materialLine?.organization_id) return null;

  const orgAccess = await getOrgAccess(materialLine.organization_id);
  if (!orgAccess?.allowed) return null;

  return {
    allowed: true,
    role: orgAccess.role,
    organizationId: materialLine.organization_id,
  };
}
