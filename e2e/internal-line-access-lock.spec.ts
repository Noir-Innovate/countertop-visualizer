import { test, expect } from "@playwright/test";
import { signIn } from "./support/auth";
import { ensureEnvLoaded, serviceClient } from "./support/db";

/**
 * Covers the internal-line "access lock" feature:
 *  - proxy.ts: a LOCKED internal line forwards `/` and `/internal` to the
 *    authenticated `/sales` portal (an unauthenticated visitor therefore ends
 *    up at /dashboard/login?next=/sales).
 *  - proxy.ts: an UNLOCKED internal line stays public at `/internal`.
 *  - settings UI: the "Require sign-in" checkbox shows only for internal lines
 *    and persists `access_locked`.
 *
 * The spec seeds its own org/lines/owner so it never collides with the shared
 * sales seed, and tears everything down in afterAll.
 */

const PASSWORD = "E2eTestPass!1";
const ts = Date.now();

function appDomain(): string {
  ensureEnvLoaded();
  // e.g. "192.168.1.11.nip.io:3001" — the public host suffix the proxy uses to
  // resolve a material line from its slug subdomain.
  const domain = process.env.NEXT_PUBLIC_APP_DOMAIN;
  if (!domain) {
    throw new Error("NEXT_PUBLIC_APP_DOMAIN must be set for the proxy specs");
  }
  return domain;
}

function publicBase(slug: string): string {
  return `http://${slug}.${appDomain()}`;
}

const seeded = {
  orgId: "",
  ownerId: "",
  ownerEmail: `e2e-lock-owner-${ts}@example.test`,
  // Three internal lines (locked, unlocked, settings-target) + one external.
  lockedSlug: `e2e-lock-locked-${ts}`,
  unlockedSlug: `e2e-lock-unlocked-${ts}`,
  internalLineId: "",
  internalSlug: `e2e-lock-internal-${ts}`,
  externalLineId: "",
  externalSlug: `e2e-lock-external-${ts}`,
};

test.beforeAll(async () => {
  const db = serviceClient();

  const { data: org, error: orgErr } = await db
    .from("organizations")
    .insert({ name: `E2E Lock Org ${ts}`, slug: `e2e-lock-org-${ts}` })
    .select("id")
    .single();
  if (orgErr || !org) throw new Error(`seed org: ${orgErr?.message}`);
  seeded.orgId = org.id;

  // Internal lines require an active internal plan (DB trigger from migration
  // 039), so stand up a billing account first.
  const { error: billingErr } = await db
    .from("organization_billing_accounts")
    .insert({ organization_id: org.id, internal_plan_status: "active" });
  if (billingErr) throw new Error(`seed billing: ${billingErr.message}`);

  const baseLine = (
    slug: string,
    kind: "internal" | "external",
    accessLocked: boolean,
  ) => ({
    organization_id: org.id,
    name: `E2E ${kind} ${slug}`,
    slug,
    line_kind: kind,
    access_locked: accessLocked,
    supabase_folder: `e2e/${slug}`,
    primary_color: "#2563eb",
    accent_color: "#1e40af",
    background_color: "#ffffff",
  });

  const { data: lines, error: lineErr } = await db
    .from("material_lines")
    .insert([
      baseLine(seeded.lockedSlug, "internal", true),
      baseLine(seeded.unlockedSlug, "internal", false),
      baseLine(seeded.internalSlug, "internal", false),
      baseLine(seeded.externalSlug, "external", false),
    ])
    .select("id, slug");
  if (lineErr || !lines) throw new Error(`seed lines: ${lineErr?.message}`);

  for (const l of lines) {
    if (l.slug === seeded.internalSlug) seeded.internalLineId = l.id;
    if (l.slug === seeded.externalSlug) seeded.externalLineId = l.id;
  }

  // Owner user (so the settings UI route is reachable + RLS-updatable).
  const { data: created, error: userErr } = await db.auth.admin.createUser({
    email: seeded.ownerEmail,
    password: PASSWORD,
    email_confirm: true,
  });
  if (userErr || !created.user) {
    throw new Error(`create owner: ${userErr?.message}`);
  }
  seeded.ownerId = created.user.id;

  await db
    .from("profiles")
    .upsert({ id: seeded.ownerId, full_name: `E2E Lock Owner ${ts}` }, {
      onConflict: "id",
    });
  await db.from("organization_members").insert({
    profile_id: seeded.ownerId,
    organization_id: org.id,
    role: "owner",
  });
});

test.afterAll(async () => {
  const db = serviceClient();
  // Cascade removes lines + members.
  if (seeded.orgId) await db.from("organizations").delete().eq("id", seeded.orgId);
  if (seeded.ownerId) {
    await db.auth.admin.deleteUser(seeded.ownerId).catch(() => {});
  }
});

test("locked internal line forwards an anonymous visitor to /sales login", async ({
  page,
}) => {
  // Root of the locked line → /sales → (auth gate) → login with next=/sales.
  await page.goto(`${publicBase(seeded.lockedSlug)}/`);
  await expect(page).toHaveURL(/\/dashboard\/login/);
  expect(decodeURIComponent(page.url())).toContain("next=/sales");

  // The legacy /internal path is locked down the same way.
  await page.goto(`${publicBase(seeded.lockedSlug)}/internal`);
  await expect(page).toHaveURL(/\/dashboard\/login/);
});

test("unlocked internal line stays public at /internal", async ({ page }) => {
  await page.goto(`${publicBase(seeded.unlockedSlug)}/`);
  await expect(page).toHaveURL(/\/internal(\/|$|\?)/);
  // Crucially, it did NOT bounce to the sales login.
  expect(page.url()).not.toContain("/dashboard/login");
});

test("settings checkbox shows for internal lines, toggles access_locked", async ({
  page,
}) => {
  const db = serviceClient();
  await signIn(page, seeded.ownerEmail, PASSWORD);

  await page.goto(
    `/dashboard/organizations/${seeded.orgId}/material-lines/internal/${seeded.internalLineId}/settings`,
  );

  const checkbox = page.locator("#accessLocked");
  await expect(checkbox).toBeVisible();
  await expect(checkbox).not.toBeChecked();

  await checkbox.check();
  await page.getByRole("button", { name: /save settings/i }).click();
  await expect(page.getByText(/settings saved successfully/i)).toBeVisible();

  // Persisted to the DB.
  const { data } = await db
    .from("material_lines")
    .select("access_locked")
    .eq("id", seeded.internalLineId)
    .single();
  expect(data?.access_locked).toBe(true);
});

test("settings checkbox is hidden for external lines", async ({ page }) => {
  await signIn(page, seeded.ownerEmail, PASSWORD);

  await page.goto(
    `/dashboard/organizations/${seeded.orgId}/material-lines/${seeded.externalLineId}/settings`,
  );

  // Wait for the form to render, then confirm the lock control is absent.
  await expect(page.getByText("Material Line Type")).toBeVisible();
  await expect(page.locator("#accessLocked")).toHaveCount(0);
});
