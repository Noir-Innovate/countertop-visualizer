import test from "node:test";
import assert from "node:assert/strict";
import { parseCsv } from "@/lib/csv";

test("parses basic rows with normalised headers", () => {
  const { headers, rows } = parseCsv(
    "Company,Contact Name,Email\nAcme,Jane Doe,jane@acme.com\n",
  );
  assert.deepEqual(headers, ["company", "contact_name", "email"]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].email, "jane@acme.com");
  assert.equal(rows[0].contact_name, "Jane Doe");
});

test("quoted field with comma and escaped quotes", () => {
  const { rows } = parseCsv(
    'name,note\n"Doe, Jane","she said ""hi"""\n',
  );
  assert.equal(rows[0].name, "Doe, Jane");
  assert.equal(rows[0].note, 'she said "hi"');
});

test("quoted field with embedded newline", () => {
  const { rows } = parseCsv('a,b\n"line1\nline2",x\n');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].a, "line1\nline2");
  assert.equal(rows[0].b, "x");
});

test("handles CRLF and a missing trailing newline", () => {
  const { rows } = parseCsv("a,b\r\n1,2\r\n3,4");
  assert.equal(rows.length, 2);
  assert.equal(rows[1].a, "3");
  assert.equal(rows[1].b, "4");
});

test("short rows pad missing columns; blank lines dropped", () => {
  const { rows } = parseCsv("a,b,c\n1,2\n\n4,5,6\n");
  assert.equal(rows.length, 2);
  assert.equal(rows[0].c, "");
  assert.equal(rows[1].c, "6");
});
