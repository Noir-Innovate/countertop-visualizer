import test from "node:test";
import assert from "node:assert/strict";
import { exceedsCaps, startOfUtcDayIso } from "@/lib/send-rate-limit";

const caps = { dailyCap: 10, hourlyCap: 8 };

test("commercial send is blocked at the daily ceiling", () => {
  assert.equal(
    exceedsCaps({
      messageClass: "commercial",
      dailyCount: 10,
      hourlyCountForAddress: 0,
      ...caps,
    }).blocked,
    true,
  );
  assert.equal(
    exceedsCaps({
      messageClass: "commercial",
      dailyCount: 9,
      hourlyCountForAddress: 0,
      ...caps,
    }).blocked,
    false,
  );
});

test("commercial send is blocked at the per-address hourly cap", () => {
  assert.equal(
    exceedsCaps({
      messageClass: "commercial",
      dailyCount: 0,
      hourlyCountForAddress: 8,
      ...caps,
    }).blocked,
    true,
  );
});

test("transactional send is never blocked by a ramp cap", () => {
  const decision = exceedsCaps({
    messageClass: "transactional",
    dailyCount: 9999,
    hourlyCountForAddress: 9999,
    ...caps,
  });
  assert.equal(decision.blocked, false);
});

test("startOfUtcDayIso returns midnight UTC of the given day", () => {
  const iso = startOfUtcDayIso(new Date("2026-09-22T15:30:00Z"));
  assert.equal(iso, "2026-09-22T00:00:00.000Z");
});
