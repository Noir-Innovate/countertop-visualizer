/**
 * Moraware WRITE-grammar probe.
 *
 * Recovers the `activityCreate` grammar the same way the jobQuery grammar was
 * recovered — from the server's own schema validator. It sends an intentionally
 * EMPTY activityCreate so the validator rejects it and describes what it
 * expected, WITHOUT creating anything. Read the printed error, then fill in the
 * real body in MorawareClient.createJobActivity().
 *
 * Safe to run, but: confirm afterwards in the Moraware UI that no stray activity
 * was created. If the server ever accepts an empty create, stop and inspect.
 *
 * Usage:
 *   MORAWARE_TENANT=asf MORAWARE_USER=... MORAWARE_PASSWORD=... \
 *     npx tsx scripts/moraware-write-probe.ts
 */
import { MorawareClient, MorawareError } from "../lib/moraware/client";

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing required env ${name}`);
    process.exit(1);
  }
  return v;
}

async function main(): Promise<void> {
  const client = new MorawareClient({
    tenant: required("MORAWARE_TENANT"),
    userName: required("MORAWARE_USER"),
    password: required("MORAWARE_PASSWORD"),
  });

  await client.login();
  console.log(
    "Logged in. Probing activityCreate with an EMPTY body so the validator reveals the grammar...\n",
  );
  try {
    const res = await client.write("activityCreate", "");
    console.log(
      "UNEXPECTED: the server accepted an empty activityCreate. Check the UI for a\n" +
        "stray activity and do NOT trust this until reviewed. Raw response:\n",
      res,
    );
  } catch (e) {
    if (e instanceof MorawareError) {
      console.log("Validator rejected it (expected). This describes the grammar:");
      console.log("  errorCode:            ", e.code);
      console.log("  errorCodeDescription: ", e.codeDescription);
      console.log("  detail:               ", e.message);
    } else {
      console.log("Non-Moraware error:", e);
    }
  } finally {
    await client.logout();
    console.log("\nLogged out.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
