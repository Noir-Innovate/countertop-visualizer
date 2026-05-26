import fs from "node:fs";
import path from "node:path";
import { ensureEnvLoaded, serviceClient } from "./db";

export interface SeedData {
  orgId: string;
  orgSlug: string;
  materialLineId: string;
  materialLineSlug: string;
  userA: { id: string; email: string };
  userB: { id: string; email: string };
  password: string;
  createdAt: string;
}

const SEED_FILE = path.resolve(process.cwd(), "e2e/.seed.json");
const PASSWORD = "E2eTestPass!1";

export async function seed(): Promise<SeedData> {
  ensureEnvLoaded();
  const db = serviceClient();
  const ts = Date.now();
  const orgSlug = `e2e-org-${ts}`;
  const lineSlug = `e2e-line-${ts}`;
  const emailA = `e2e-sales-a-${ts}@example.test`;
  const emailB = `e2e-sales-b-${ts}@example.test`;

  // 1. Organization
  const { data: org, error: orgErr } = await db
    .from("organizations")
    .insert({ name: `E2E Org ${ts}`, slug: orgSlug })
    .select("id")
    .single();
  if (orgErr || !org) throw new Error(`seed org: ${orgErr?.message}`);

  // 2. Internal material line
  const { data: line, error: lineErr } = await db
    .from("material_lines")
    .insert({
      organization_id: org.id,
      name: `E2E Line ${ts}`,
      slug: lineSlug,
      line_kind: "internal",
      supabase_folder: `e2e/${lineSlug}`,
      primary_color: "#2563eb",
      accent_color: "#1e40af",
      background_color: "#ffffff",
    })
    .select("id")
    .single();
  if (lineErr || !line) throw new Error(`seed line: ${lineErr?.message}`);

  // 3. Two salesperson users
  async function createUser(email: string) {
    const { data, error } = await db.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
    });
    if (error || !data.user) throw new Error(`create user ${email}: ${error?.message}`);
    return { id: data.user.id, email };
  }
  const userA = await createUser(emailA);
  const userB = await createUser(emailB);

  // 4. Profiles (ensure they exist; trigger may not be set up for service-role inserts)
  await db
    .from("profiles")
    .upsert(
      [
        { id: userA.id, full_name: `E2E Sales A ${ts}` },
        { id: userB.id, full_name: `E2E Sales B ${ts}` },
      ],
      { onConflict: "id" },
    );

  // 5. Membership + line assignments
  await db.from("organization_members").insert([
    { profile_id: userA.id, organization_id: org.id, role: "sales_person" },
    { profile_id: userB.id, organization_id: org.id, role: "sales_person" },
  ]);
  await db.from("salesperson_line_assignments").insert([
    {
      profile_id: userA.id,
      material_line_id: line.id,
      organization_id: org.id,
    },
    {
      profile_id: userB.id,
      material_line_id: line.id,
      organization_id: org.id,
    },
  ]);

  const seedData: SeedData = {
    orgId: org.id,
    orgSlug,
    materialLineId: line.id,
    materialLineSlug: lineSlug,
    userA,
    userB,
    password: PASSWORD,
    createdAt: new Date().toISOString(),
  };

  fs.mkdirSync(path.dirname(SEED_FILE), { recursive: true });
  fs.writeFileSync(SEED_FILE, JSON.stringify(seedData, null, 2));
  return seedData;
}

export async function cleanup(orgId: string, userAId?: string, userBId?: string) {
  ensureEnvLoaded();
  const db = serviceClient();

  // Cascade kills assignments + members + invitations + lines.
  await db.from("organizations").delete().eq("id", orgId);

  // Auth users aren't covered by org cascade.
  if (userAId) await db.auth.admin.deleteUser(userAId).catch(() => {});
  if (userBId) await db.auth.admin.deleteUser(userBId).catch(() => {});
}

export function readSeed(): SeedData {
  if (!fs.existsSync(SEED_FILE)) {
    throw new Error("e2e/.seed.json not found — run `npm run test:e2e:seed` first");
  }
  return JSON.parse(fs.readFileSync(SEED_FILE, "utf8")) as SeedData;
}

// Allow running this file standalone: `tsx e2e/support/seed.ts`
if (process.argv[1] && process.argv[1].endsWith("seed.ts")) {
  seed()
    .then((s) => {
      console.log(`Seeded org ${s.orgId} with users ${s.userA.email}, ${s.userB.email}`);
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
