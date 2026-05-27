import fs from "node:fs";
import path from "node:path";
import { cleanup, readSeed } from "./seed";

export default async function globalTeardown() {
  const seedFile = path.resolve(process.cwd(), "e2e/.seed.json");
  if (!fs.existsSync(seedFile)) {
    // Sales seed didn't run (or failed in globalSetup) — nothing to clean.
    return;
  }
  try {
    const data = readSeed();
    await cleanup(data.orgId, data.userA.id, data.userB.id);
    fs.unlinkSync(seedFile);
    console.log(`[e2e] cleaned up org ${data.orgId}`);
  } catch (e) {
    console.error("[e2e] teardown error:", e);
  }
}
