import test from "node:test";
import assert from "node:assert/strict";
import { deriveMaterialLineName } from "@/lib/material-line-name";

test("falls back to the org name when there is no title", () => {
  assert.equal(deriveMaterialLineName(null, "Acme Stone"), "Acme Stone");
  assert.equal(deriveMaterialLineName("", "Acme Stone"), "Acme Stone");
});

test("uses the title verbatim when it is already short", () => {
  assert.equal(deriveMaterialLineName("ABC Stone", "Acme Stone"), "ABC Stone");
});

test("drops a leading generic 'Home' segment", () => {
  assert.equal(
    deriveMaterialLineName("Home | ABC Granite & Quartz", "Acme"),
    "ABC Granite & Quartz",
  );
});

test("picks the brand over a descriptive tagline (brand first)", () => {
  assert.equal(
    deriveMaterialLineName("ABC Stone - Countertops in Dallas, TX", "Acme"),
    "ABC Stone",
  );
});

test("picks the brand over a descriptive tagline (brand last)", () => {
  assert.equal(
    deriveMaterialLineName("Calacatta Countertops | ABC Stone", "Acme"),
    "ABC Stone",
  );
});

test("clamps an overly long brand segment to four words", () => {
  assert.equal(
    deriveMaterialLineName("The Very Best Premium Stone Co", "Acme"),
    "The Very Best Premium",
  );
});

test("falls back when the title is only generic segments", () => {
  assert.equal(deriveMaterialLineName("Home | Welcome", "Acme Stone"), "Acme Stone");
});

test("uses a placeholder when neither title nor org name is usable", () => {
  assert.equal(deriveMaterialLineName(null, "  "), "My Material Line");
});
