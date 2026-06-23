// Visibility rules for the dashboard top-bar, kept as pure functions so they
// can be unit-tested without rendering the React nav.

export interface NavProfile {
  is_super_admin?: boolean;
}

export interface NavOrganization {
  role: string;
}

/**
 * Whether the organization switcher dropdown should appear in the top bar.
 *
 * Hidden for salesperson-only users — every membership is `sales_person` — who
 * navigate via the dedicated "Sales" button instead. Super admins always keep
 * the switcher, as do owners/admins (including admins of multiple orgs).
 */
export function shouldShowOrgSwitcher(
  profile: NavProfile | null,
  organizations: NavOrganization[],
): boolean {
  if (organizations.length === 0) return false;
  if (profile?.is_super_admin) return true;
  return !organizations.every((o) => o.role === "sales_person");
}
