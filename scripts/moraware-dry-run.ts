/**
 * Moraware read-only dry run.
 *
 * Opens a session, issues read-only queries, prints what came back, and logs
 * out. It never writes to Moraware — the client refuses any command that is
 * not a *Query.
 *
 * Credentials come from the environment and are never written to disk:
 *
 *   MORAWARE_TENANT=acme \
 *   MORAWARE_USER=... \
 *   MORAWARE_PASSWORD=... \
 *   npx tsx scripts/moraware-dry-run.ts
 *
 * Use a dedicated integration account with the "Execute API Requests"
 * permission. Moraware is reported to permit one concurrent session per
 * account, so running this as a person can sign them out of their browser.
 */
import { MorawareClient, MorawareError } from "../lib/moraware/client";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name}. See the header of this file for usage.`);
    process.exit(1);
  }
  return value;
}

/** First N characters, with newlines collapsed, for readable logging. */
function preview(xml: string, chars = 1500): string {
  return xml.replace(/>\s+</g, "><").slice(0, chars);
}

async function main() {
  const client = new MorawareClient({
    tenant: required("MORAWARE_TENANT"),
    userName: required("MORAWARE_USER"),
    password: required("MORAWARE_PASSWORD"),
  });

  console.log("Logging in…");
  await client.login();
  console.log("Session established.\n");

  try {
    // Moraware's schema is not publicly documented, so the first run is
    // exploratory: issue each query bare and record the shape that comes back.
    const probes: { label: string; command: string; body?: string }[] = [
      { label: "Job phases (small, safe shape check)", command: "jobPhaseQuery" },
      { label: "Job statuses", command: "jobStatusQuery" },
      { label: "Accounts", command: "accountQuery" },
      { label: "Jobs", command: "jobQuery" },
    ];

    for (const probe of probes) {
      process.stdout.write(`── ${probe.label} (${probe.command})\n`);
      try {
        const xml = await client.query(probe.command, probe.body ?? "");
        const count = (xml.match(/<job\b|<account\b|<jobPhase\b/g) || []).length;
        console.log(`   ok — ${xml.length} bytes, ~${count} records`);
        console.log(`   ${preview(xml, 700)}\n`);
      } catch (err) {
        if (err instanceof MorawareError) {
          console.log(
            `   refused — [${err.code}] ${err.codeDescription}: ${err.message}\n`,
          );
        } else {
          throw err;
        }
      }
    }
  } finally {
    console.log("Logging out…");
    await client.logout();
    console.log("Session released.");
  }
}

main().catch((err) => {
  if (err instanceof MorawareError) {
    console.error(`Moraware error [${err.code}] ${err.codeDescription}`);
    console.error(err.message);
  } else {
    console.error(err);
  }
  process.exit(1);
});
