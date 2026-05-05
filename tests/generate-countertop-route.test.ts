import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

// Validation paths in the route should return BEFORE any GenAI call,
// so we can exercise them without mocking @google/genai.
import { POST } from "@/app/api/generate-countertop/route";

const SUPABASE_HOST = "abc123.supabase.co";

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/generate-countertop", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("POST: 400 when kitchenImage missing", async () => {
  const res = await POST(
    makeRequest({
      slabImageUrl: `https://${SUPABASE_HOST}/x.png`,
      slabId: "s",
      slabName: "n",
      slabDescription: "d",
    }),
  );
  assert.equal(res.status, 400);
  const json = await res.json();
  assert.equal(json.error, "Kitchen image is required");
});

test("POST: 400 when slabImage and slabImageUrl both missing", async () => {
  const res = await POST(
    makeRequest({
      kitchenImage: "data:image/jpeg;base64,AAAA",
      slabId: "s",
      slabName: "n",
      slabDescription: "d",
    }),
  );
  assert.equal(res.status, 400);
  const json = await res.json();
  assert.equal(json.error, "Slab image is required");
});

test("POST: 400 when slabImageUrl is not https", async () => {
  const res = await POST(
    makeRequest({
      kitchenImage: "data:image/jpeg;base64,AAAA",
      slabImageUrl: `http://${SUPABASE_HOST}/x.png`,
      slabId: "s",
      slabName: "n",
      slabDescription: "d",
    }),
  );
  assert.equal(res.status, 400);
  const json = await res.json();
  assert.equal(json.error, "slabImageUrl must be https");
});

test("POST: 400 when slabImageUrl is malformed", async () => {
  const res = await POST(
    makeRequest({
      kitchenImage: "data:image/jpeg;base64,AAAA",
      slabImageUrl: "not a url",
      slabId: "s",
      slabName: "n",
      slabDescription: "d",
    }),
  );
  assert.equal(res.status, 400);
  const json = await res.json();
  assert.equal(json.error, "Invalid slabImageUrl");
});
