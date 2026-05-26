import { test, expect } from "@playwright/test";
import { signIn } from "./support/auth";
import { readSeed } from "./support/seed";
import { serviceClient } from "./support/db";

// 1x1 transparent PNG so the thumbnail URL resolves to a real image.
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

test("returning to a job shows previously generated images", async ({ page }) => {
  const seed = readSeed();
  const db = serviceClient();

  await signIn(page, seed.userA.email, seed.password);

  // --- Create a job and capture its session id ---
  await page.getByRole("button", { name: /new job/i }).first().click();
  const address = `789 Run St ${Date.now()}`;
  await page.getByLabel("Address").fill(address);
  const [createResp] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().endsWith("/api/sales/jobs") && r.request().method() === "POST",
    ),
    page.getByRole("button", { name: /save job/i }).click(),
  ]);
  const job = (await createResp.json()).job;
  expect(job.v2_session_id).toBeTruthy();

  // --- Seed a generated_images row + storage object as if the visualizer had run ---
  const storagePath = `generated-images/${job.v2_session_id}/e2e-${Date.now()}.png`;
  const pngBuffer = Buffer.from(TINY_PNG_BASE64, "base64");
  const { error: uploadErr } = await db.storage
    .from("public-assets")
    .upload(storagePath, pngBuffer, {
      contentType: "image/png",
      upsert: true,
    });
  if (uploadErr) throw new Error(`upload failed: ${uploadErr.message}`);

  const { error: insErr } = await db.from("generated_images").insert({
    session_id: job.v2_session_id,
    material_line_id: seed.materialLineId,
    material_category: "Countertops",
    kitchen_image_path: storagePath,
    input_image_path: storagePath,
    output_image_path: storagePath,
    generation_order: 1,
  });
  if (insErr) throw new Error(`insert generation: ${insErr.message}`);

  // --- API: the generations endpoint returns the row, linked correctly ---
  const apiResp = await page.request.get(`/api/sales/jobs/${job.id}/generations`);
  expect(apiResp.status()).toBe(200);
  const { generations } = await apiResp.json();
  expect(generations).toHaveLength(1);
  expect(generations[0].outputImageUrl).toContain(storagePath);

  // --- UI: navigate away and back; the "Previous runs" strip shows up ---
  await page.goto("/sales");
  await page.goto(`/sales/${seed.materialLineId}`);
  await page.getByText(address).first().click();
  await expect(page.getByText(/previous runs/i)).toBeVisible();
  await expect(page.getByRole("img").first()).toBeVisible();

  // Cleanup
  await db.from("generated_images").delete().eq("session_id", job.v2_session_id);
  await db.storage.from("public-assets").remove([storagePath]);
  await db.from("leads").delete().eq("id", job.id);
});
