import { createServiceClient } from "@/lib/supabase/server";

export type OnboardingStep =
  | "needs_org"
  | "needs_billing"
  | "needs_website"
  | "needs_wizard"
  | "done";

export interface OnboardingState {
  step: OnboardingStep;
  scrapeId: string | null;
}

// Minimal supabase shape used by these helpers; widened to `any` returns to
// avoid leaking the @supabase/supabase-js generated types across module
// boundaries (the existing tests use the same hand-rolled mock pattern).
export interface SupabaseLike {
  from: (table: string) => unknown;
}

async function getClient(client?: SupabaseLike): Promise<SupabaseLike> {
  if (client) return client;
  return (await createServiceClient()) as unknown as SupabaseLike;
}

/**
 * Determine the next onboarding step for a given org.
 *
 * Rules (in order):
 *   - If the org's billing account isn't in active|trialing|past_due → needs_billing.
 *   - Else if no internal material line exists yet AND no scrape row exists → needs_website.
 *   - Else if a scrape row exists but no internal line yet → needs_wizard (resume).
 *   - Else → done.
 */
export async function getOnboardingNextStep(
  organizationId: string,
  client?: SupabaseLike,
): Promise<OnboardingState> {
  const service = (await getClient(client)) as any;

  const { data: billing } = await service
    .from("organization_billing_accounts")
    .select("internal_plan_status")
    .eq("organization_id", organizationId)
    .maybeSingle();

  const billingActive = ["active", "trialing", "past_due"].includes(
    billing?.internal_plan_status ?? "",
  );

  if (!billingActive) {
    return { step: "needs_billing", scrapeId: null };
  }

  const { count: internalLineCount } = await service
    .from("material_lines")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("line_kind", "internal");

  if ((internalLineCount ?? 0) > 0) {
    return { step: "done", scrapeId: null };
  }

  const { data: latestScrape } = await service
    .from("org_onboarding_scrapes")
    .select("id, status")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // A failed/cancelled scrape should not pin the user on the wizard — they
  // need to be able to re-enter a different URL.
  if (!latestScrape || latestScrape.status === "failed") {
    return { step: "needs_website", scrapeId: null };
  }

  return { step: "needs_wizard", scrapeId: latestScrape.id };
}

/**
 * Map an onboarding state to the URL the user should land on for that step.
 */
export function onboardingStepUrl(
  organizationId: string,
  state: OnboardingState,
): string {
  switch (state.step) {
    case "needs_billing":
      return `/onboarding/${organizationId}/trial`;
    case "needs_website":
      return `/onboarding/${organizationId}/website`;
    case "needs_wizard":
      return state.scrapeId
        ? `/onboarding/${organizationId}/wizard?scrapeId=${encodeURIComponent(state.scrapeId)}`
        : `/onboarding/${organizationId}/website`;
    case "needs_org":
      return `/dashboard/organizations/new`;
    case "done":
    default:
      return `/dashboard/organizations/${organizationId}`;
  }
}

export interface UserOnboardingEntry {
  url: string;
  organizationId: string | null;
  step: OnboardingStep;
}

/**
 * Compute the right landing URL for a freshly-authenticated user.
 *
 *   - 0 orgs → /dashboard/organizations/new (needs_org).
 *   - exactly 1 org & not done → onboardingStepUrl for that org.
 *   - exactly 1 org & done → that org's dashboard.
 *   - 2+ orgs → null (caller should render the org list).
 */
export async function getUserOnboardingEntry(
  userId: string,
  client?: SupabaseLike,
): Promise<UserOnboardingEntry | null> {
  const service = (await getClient(client)) as any;
  const { data: memberships } = await service
    .from("organization_members")
    .select("organization_id")
    .eq("profile_id", userId);

  const orgIds = (memberships ?? [])
    .map((m: { organization_id: string | null }) => m.organization_id)
    .filter((id: string | null): id is string => Boolean(id));

  if (orgIds.length === 0) {
    return {
      url: "/dashboard/organizations/new",
      organizationId: null,
      step: "needs_org",
    };
  }

  if (orgIds.length > 1) {
    return null;
  }

  const orgId = orgIds[0];
  const state = await getOnboardingNextStep(orgId, client);
  return {
    url: onboardingStepUrl(orgId, state),
    organizationId: orgId,
    step: state.step,
  };
}
