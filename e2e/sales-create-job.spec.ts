import { test, expect } from "@playwright/test";
import { signIn } from "./support/auth";
import { readSeed } from "./support/seed";
import { serviceClient } from "./support/db";

test("salesperson can create a new job", async ({ page }) => {
  const seed = readSeed();

  await signIn(page, seed.userA.email, seed.password);
  await expect(page).toHaveURL(new RegExp(`/sales/${seed.materialLineId}$`));

  // Open the New Job modal.
  await page.getByRole("button", { name: /new job/i }).first().click();

  // Fill the form (skip GPS; type the address directly).
  const address = `100 Test Lane ${Date.now()}`;
  await page.getByLabel("Address").fill(address);
  await page.getByLabel("Customer name").fill("E2E Customer A");
  await page.getByLabel("Email").fill("e2e-customer@example.test");

  // Capture the create response so we can assert status + body.
  const [createResponse] = await Promise.all([
    page.waitForResponse(
      (resp) =>
        resp.url().endsWith("/api/sales/jobs") && resp.request().method() === "POST",
    ),
    page.getByRole("button", { name: /save job/i }).click(),
  ]);
  expect(createResponse.status()).toBe(201);
  const created = await createResponse.json();
  expect(created.job.salesperson_id).toBe(seed.userA.id);
  expect(created.job.source).toBe("salesperson");
  expect(created.job.v2_session_id).toBeTruthy();

  // Sidebar should now show the address.
  await expect(page.getByText(address).first()).toBeVisible();

  // DB-side assertion: the row is persisted with the right ownership.
  const db = serviceClient();
  const { data: dbRow } = await db
    .from("leads")
    .select("id, salesperson_id, source, address, material_line_id")
    .eq("id", created.job.id)
    .single();
  expect(dbRow).toMatchObject({
    salesperson_id: seed.userA.id,
    source: "salesperson",
    address,
    material_line_id: seed.materialLineId,
  });

  // Cleanup so re-runs don't accumulate rows.
  await db.from("leads").delete().eq("id", created.job.id);
});
