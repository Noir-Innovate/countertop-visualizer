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

  const lineColumns =
    "id, name, slug, organization_id, line_kind, supabase_folder, logo_url, primary_color, accent_color, background_color";

  type LineRow = {
    id: string;
    name: string;
    slug: string;
    organization_id: string;
    line_kind: "internal" | "external";
    supabase_folder: string;
    logo_url: string | null;
    primary_color: string;
    accent_color: string;
    background_color: string;
  };

  const [assignedRes, adminOrgsRes] = await Promise.all([
    service
      .from("salesperson_line_assignments")
      .select(`material_line_id, material_lines!inner(${lineColumns})`)
      .eq("profile_id", profileId),
    service
      .from("organization_members")
      .select("organization_id, role")
      .eq("profile_id", profileId)
      .in("role", ["owner", "admin"]),
  ]);

  const byLineId = new Map<string, LineRow>();

  if (!assignedRes.error && assignedRes.data) {
    for (const row of assignedRes.data as unknown as Array<{
      material_lines: LineRow | null;
    }>) {
      if (row.material_lines) byLineId.set(row.material_lines.id, row.material_lines);
    }
  }

  const adminOrgIds = (adminOrgsRes.data || []).map((m) => m.organization_id);
  if (adminOrgIds.length > 0) {
    const { data: internalLines } = await service
      .from("material_lines")
      .select(lineColumns)
      .in("organization_id", adminOrgIds)
      .eq("line_kind", "internal");
    for (const line of (internalLines as LineRow[] | null) || []) {
      byLineId.set(line.id, line);
    }
  }

  const orgIds = Array.from(
    new Set(Array.from(byLineId.values()).map((l) => l.organization_id)),
  );
  const orgNameById = new Map<string, string>();
  if (orgIds.length > 0) {
    const { data: orgs } = await service
      .from("organizations")
      .select("id, name")
      .in("id", orgIds);
    for (const o of orgs || []) orgNameById.set(o.id, o.name);
  }

  return Array.from(byLineId.values()).map((l) => ({
    id: l.id,
    name: l.name,
    slug: l.slug,
    organization_id: l.organization_id,
    organization_name: orgNameById.get(l.organization_id) || "",
    line_kind: l.line_kind,
    supabase_folder: l.supabase_folder,
    logo_url: l.logo_url,
    primary_color: l.primary_color,
    accent_color: l.accent_color,
    background_color: l.background_color,
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
