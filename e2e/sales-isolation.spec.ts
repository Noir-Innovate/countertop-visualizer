import { test, expect } from "@playwright/test";
import { signIn, signOut } from "./support/auth";
import { readSeed } from "./support/seed";
import { serviceClient } from "./support/db";

test("salespeople can't see each other's jobs", async ({ page }) => {
  const seed = readSeed();
  const db = serviceClient();

  // --- A signs in and creates a job ---
  await signIn(page, seed.userA.email, seed.password);
  await expect(page).toHaveURL(new RegExp(`/sales/${seed.materialLineId}$`));

  await page.getByRole("button", { name: /new job/i }).first().click();
  const addressA = `123 A Street ${Date.now()}`;
  await page.getByLabel("Address").fill(addressA);
  const [aCreate] = await Promise.all([
    page.waitForResponse(
      (resp) =>
        resp.url().endsWith("/api/sales/jobs") && resp.request().method() === "POST",
    ),
    page.getByRole("button", { name: /save job/i }).click(),
  ]);
  const aJob = (await aCreate.json()).job;

  // --- Swap to B ---
  await signOut(page);
  await signIn(page, seed.userB.email, seed.password);
  await expect(page).toHaveURL(new RegExp(`/sales/${seed.materialLineId}$`));

  await page.getByRole("button", { name: /new job/i }).first().click();
  const addressB = `456 B Avenue ${Date.now()}`;
  await page.getByLabel("Address").fill(addressB);
  const [bCreate] = await Promise.all([
    page.waitForResponse(
      (resp) =>
        resp.url().endsWith("/api/sales/jobs") && resp.request().method() === "POST",
    ),
    page.getByRole("button", { name: /save job/i }).click(),
  ]);
  const bJob = (await bCreate.json()).job;

  // --- UI assertion: B sees their own job and NOT A's ---
  await expect(page.getByText(addressB).first()).toBeVisible();
  await expect(page.getByText(addressA)).toHaveCount(0);

  // --- API assertion: list endpoint also hides A's job from B ---
  const listResp = await page.request.get(
    `/api/sales/jobs?materialLineId=${seed.materialLineId}`,
  );
  expect(listResp.status()).toBe(200);
  const { jobs } = await listResp.json();
  const ids = jobs.map((j: { id: string }) => j.id);
  expect(ids).toContain(bJob.id);
  expect(ids).not.toContain(aJob.id);

  // --- Paranoia: B can't PATCH A's job ---
  const patchResp = await page.request.patch(`/api/sales/jobs/${aJob.id}`, {
    data: { customerName: "hijack" },
  });
  expect(patchResp.status()).toBe(404);

  // Cleanup
  await db.from("leads").delete().in("id", [aJob.id, bJob.id]);
});
