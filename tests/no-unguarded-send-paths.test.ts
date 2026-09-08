import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

/**
 * OD-2 bypass guard.
 *
 * The suppression check lives in exactly one place: `sendEmail` in
 * lib/resend.ts, which is the only function permitted to touch the Resend SDK.
 * Every other email helper delegates to it, so every send inherits the guard.
 *
 * This test does NOT check that the guard works (that's email-suppression.test).
 * It fails when someone adds a NEW send path that reaches for the Resend SDK
 * directly — the exact mistake that would silently skip suppression. If you are
 * adding an email path, route it through sendEmail; do not construct a Resend
 * client or call `.emails.send` anywhere else.
 */

const ROOT = join(__dirname, "..");
const SCAN_DIRS = ["lib", "app"];
const ALLOWED_FILE = join("lib", "resend.ts"); // the single guarded choke point

// Direct Resend SDK usage: constructing a client, or sending through one.
const RESEND_SDK = /new\s+Resend\s*\(|\.emails\.send\s*\(/;

function walk(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
}

test("Resend SDK is only touched by the guarded sendEmail choke point", () => {
  const files: string[] = [];
  for (const d of SCAN_DIRS) walk(join(ROOT, d), files);

  const offenders: string[] = [];
  for (const file of files) {
    const rel = relative(ROOT, file).split(sep).join("/");
    if (rel === ALLOWED_FILE.split(sep).join("/")) continue;
    if (RESEND_SDK.test(readFileSync(file, "utf8"))) {
      offenders.push(rel);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `New unguarded email send path(s) found. Route email through sendEmail() in ` +
      `lib/resend.ts so the suppression guard runs. Offending files:\n  ` +
      offenders.join("\n  "),
  );
});
