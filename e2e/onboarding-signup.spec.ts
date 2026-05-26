import { test, expect } from "@playwright/test";
import { serviceClient } from "./support/db";

// Signup spec — exercises the actual /dashboard/signup form. Doesn't use the
// `testUser` fixture (that bypasses the UI by going through the admin API).
//
// Local Supabase has email confirmation disabled by default, so the post-
// signup redirect goes straight into the app. If confirmation is on in your
// env, this test will time out at the post-signup wait.

test.describe("Onboarding · Signup", () => {
  test("signing up with email/password lands on org-create", async ({
    page,
  }) => {
    const email = `e2e-signup-${Date.now()}@example.test`;
    const password = "E2eTestPass!1";
    const createdId: { id: string | null } = { id: null };

    try {
      await page.goto("/dashboard/signup");
      await page.getByLabel(/email/i).fill(email);
      await page.getByLabel(/password/i).fill(password);
      await page.getByRole("button", { name: /sign up/i }).click();

      // After signup the onboarding state machine should put us on the
      // create-organization page (the new user has no orgs yet).
      await page.waitForURL(/\/dashboard\/organizations\/new/, {
        timeout: 20_000,
      });
      await expect(
        page.getByRole("heading", { name: /create organization/i }),
      ).toBeVisible();

      // Resolve the user id for cleanup.
      const db = serviceClient();
      const { data } = await db
        .from("profiles")
        .select("id")
        .eq("email", email)
        .maybeSingle();
      createdId.id = (data?.id as string) ?? null;
    } finally {
      if (createdId.id) {
        const db = serviceClient();
        await db.auth.admin.deleteUser(createdId.id).catch(() => {});
      }
    }
  });
});
