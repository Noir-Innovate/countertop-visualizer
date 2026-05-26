import { createClient, createServiceClient } from "@/lib/supabase/server";

export interface AssignedLine {
  id: string;
  name: string;
  slug: string;
  organization_id: string;
  organization_name: string;
  line_kind: "internal" | "external";
  supabase_folder: string;
  logo_url: string | null;
  primary_color: string;
  accent_color: string;
  background_color: string;
}

/**
 * Returns the material lines a salesperson is explicitly assigned to.
 * Uses the service role to read across the join + material_lines + organizations
 * (assignments-by-profile RLS is permissive but the joined rows must also be
 * readable, and the service-role read keeps this single-query).
 */
export async function getAssignedLines(
  profileId: string,
): Promise<AssignedLine[]> {
  const service = await createServiceClient();
  const { data, error } = await service
    .from("salesperson_line_assignments")
    .select(
      `
      material_line_id,
      organization_id,
      material_lines!inner(
        id,
        name,
        slug,
        line_kind,
        supabase_folder,
        logo_url,
        primary_color,
        accent_color,
        background_color
      ),
      organizations!inner(id, name)
      `,
    )
    .eq("profile_id", profileId);

  if (error || !data) return [];

  type Row = {
    material_line_id: string;
    organization_id: string;
    material_lines: {
      id: string;
      name: string;
      slug: string;
      line_kind: "internal" | "external";
      supabase_folder: string;
      logo_url: string | null;
      primary_color: string;
      accent_color: string;
      background_color: string;
    } | null;
    organizations: { id: string; name: string } | null;
  };

  return (data as unknown as Row[])
    .filter((r) => r.material_lines && r.organizations)
    .map((r) => ({
      id: r.material_lines!.id,
      name: r.material_lines!.name,
      slug: r.material_lines!.slug,
      organization_id: r.organization_id,
      organization_name: r.organizations!.name,
      line_kind: r.material_lines!.line_kind,
      supabase_folder: r.material_lines!.supabase_folder,
      logo_url: r.material_lines!.logo_url,
      primary_color: r.material_lines!.primary_color,
      accent_color: r.material_lines!.accent_color,
      background_color: r.material_lines!.background_color,
    }));
}

/**
 * Returns true if the current user is assigned to this material line.
 * Owners/admins/super-admins are NOT covered here — this is for sales-portal
 * access checks specifically.
 */
export async function requireSalespersonAccess(
  materialLineId: string,
): Promise<{ profileId: string; organizationId: string } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("salesperson_line_assignments")
    .select("organization_id")
    .eq("profile_id", user.id)
    .eq("material_line_id", materialLineId)
    .maybeSingle();

  if (!data) return null;
  return { profileId: user.id, organizationId: data.organization_id };
}

/**
 * Returns true if the user has at least one organization_members row AND
 * every membership has role = 'sales_person'. Used to decide whether to
 * redirect away from /dashboard into /sales after login.
 */
export async function isSalespersonOnly(userId: string): Promise<boolean> {
  const service = await createServiceClient();
  const [{ data: profile }, { data: memberships }] = await Promise.all([
    service
      .from("profiles")
      .select("is_super_admin")
      .eq("id", userId)
      .maybeSingle(),
    service
      .from("organization_members")
      .select("role")
      .eq("profile_id", userId),
  ]);

  if (profile?.is_super_admin) return false;
  if (!memberships || memberships.length === 0) return false;
  return memberships.every((m) => m.role === "sales_person");
}
