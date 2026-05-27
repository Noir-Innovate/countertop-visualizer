import { test as base, type Page } from "@playwright/test";
import { serviceClient } from "./db";

export interface OnboardingUser {
  id: string;
  email: string;
  password: string;
}

export const ONBOARDING_PASSWORD = "E2eTestPass!1";

/**
 * Mints a brand-new user via the Supabase admin API. Email is unique per test
 * so specs can run repeatedly without colliding. The user has no org yet —
 * specs drive the onboarding flow themselves.
 */
export async function createOnboardingUser(): Promise<OnboardingUser> {
  const db = serviceClient();
  const id = Math.random().toString(36).slice(2, 10);
  const email = `e2e-onb-${Date.now()}-${id}@example.test`;
  const { data, error } = await db.auth.admin.createUser({
    email,
    password: ONBOARDING_PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(`createOnboardingUser: ${error?.message ?? "no user"}`);
  }
  await db
    .from("profiles")
    .upsert(
      { id: data.user.id, email, full_name: `E2E Onboarder ${id}` },
      { onConflict: "id" },
    );
  return { id: data.user.id, email, password: ONBOARDING_PASSWORD };
}

/**
 * Deletes any org owned by this user (cascading members, scrapes, billing
 * rows, material lines), then deletes the auth user.
 */
export async function deleteOnboardingUser(user: OnboardingUser) {
  const db = serviceClient();
  const { data: memberships } = await db
    .from("organization_members")
    .select("organization_id")
    .eq("profile_id", user.id);
  for (const m of memberships ?? []) {
    if (m.organization_id) {
      // analytics_events.organization_id has ON DELETE CASCADE — null it
      // first so the rows survive for funnel/dashboard inspection after
      // the test user is torn down.
      await db
        .from("analytics_events")
        .update({ organization_id: null })
        .eq("organization_id", m.organization_id);
      await db.from("organizations").delete().eq("id", m.organization_id);
    }
  }
  await db.auth.admin.deleteUser(user.id).catch(() => {});
}

/**
 * Creates an org through the UI and waits for the onboarding state machine
 * to land the user on the trial page. The state machine puts trial BEFORE
 * website (billing gate fires first), so this is the right entry point for
 * promo-code specs.
 */
export async function createOrgAndAdvanceToTrial(
  page: Page,
  orgName = "E2E Stone Co",
): Promise<{ orgId: string }> {
  await page.waitForURL(/\/dashboard\/organizations\/new/, { timeout: 15_000 });
  await page.getByLabel(/organization name/i).fill(orgName);
  await page.getByRole("button", { name: /create organization/i }).click();

  await page.waitForURL(/\/onboarding\/[0-9a-f-]+\/trial/, { timeout: 20_000 });
  const m = page.url().match(/\/onboarding\/([0-9a-f-]+)\/trial/);
  return { orgId: m![1] };
}

/**
 * Logs in via the /dashboard/login form and waits for the post-login bounce
 * to a non-login URL. Reused by all onboarding specs.
 */
export async function loginAs(page: Page, user: OnboardingUser) {
  await page.goto("/dashboard/login");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.includes("/dashboard/login"), {
      timeout: 15_000,
    }),
    page.getByRole("button", { name: /sign in/i }).click(),
  ]);
}

interface OnboardingFixtures {
  testUser: OnboardingUser;
}

// Playwright fixture: every test that imports this `test` gets a fresh user
// in `testUser`, auto-cleaned up after the test body.
export const test = base.extend<OnboardingFixtures>({
  testUser: async ({}, use) => {
    const user = await createOnboardingUser();
    try {
      await use(user);
    } finally {
      await deleteOnboardingUser(user);
    }
  },
});

export { expect } from "@playwright/test";
