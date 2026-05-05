import test from "node:test";
import assert from "node:assert/strict";
import { resolveSlabImage } from "@/lib/slab-image";

const SUPABASE_HOST = "abc123.supabase.co";
const HTTPS_ORIGIN = `https://${SUPABASE_HOST}`;
const allowed = new Set([HTTPS_ORIGIN]);

const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

function makeFetch(impl: (url: string) => Response | Promise<Response>) {
  return async (input: RequestInfo | URL): Promise<Response> => {
    const url = typeof input === "string" ? input : input.toString();
    return impl(url);
  };
}

const noFetch = (async () => {
  throw new Error("should not fetch");
}) as typeof fetch;

test("resolveSlabImage: fetches an allowed https URL and returns base64 + mime", async () => {
  let fetched: string | null = null;
  const fetchImpl = makeFetch((url) => {
    fetched = url;
    return new Response(PNG_BYTES, {
      status: 200,
      headers: { "content-type": "image/png" },
    });
  });

  const result = await resolveSlabImage(
    undefined,
    `${HTTPS_ORIGIN}/storage/v1/object/public/public-assets/foo/slab.png`,
    { allowedOrigins: allowed, fetchImpl: fetchImpl as typeof fetch },
  );

  assert.equal(
    fetched,
    `${HTTPS_ORIGIN}/storage/v1/object/public/public-assets/foo/slab.png`,
  );
  assert.ok(!("error" in result));
  if ("error" in result) return;
  assert.equal(result.mimeType, "image/png");
  assert.equal(result.data, PNG_BYTES.toString("base64"));
});

test("resolveSlabImage: strips charset/params from content-type", async () => {
  const fetchImpl = makeFetch(
    () =>
      new Response(PNG_BYTES, {
        status: 200,
        headers: { "content-type": "image/jpeg; charset=binary" },
      }),
  );

  const result = await resolveSlabImage(undefined, `${HTTPS_ORIGIN}/x.jpg`, {
    allowedOrigins: allowed,
    fetchImpl: fetchImpl as typeof fetch,
  });

  assert.ok(!("error" in result));
  if ("error" in result) return;
  assert.equal(result.mimeType, "image/jpeg");
});

test("resolveSlabImage: defaults mime to image/jpeg when header missing", async () => {
  const fetchImpl = makeFetch(
    () => new Response(PNG_BYTES, { status: 200 }),
  );

  const result = await resolveSlabImage(undefined, `${HTTPS_ORIGIN}/x`, {
    allowedOrigins: allowed,
    fetchImpl: fetchImpl as typeof fetch,
  });

  assert.ok(!("error" in result));
  if ("error" in result) return;
  assert.equal(result.mimeType, "image/jpeg");
});

test("resolveSlabImage: rejects malformed URL", async () => {
  const result = await resolveSlabImage(undefined, "not a url", {
    allowedOrigins: allowed,
    fetchImpl: noFetch,
  });
  assert.deepEqual(result, { error: "Invalid slabImageUrl" });
});

test("resolveSlabImage: rejects http on a non-local host", async () => {
  const result = await resolveSlabImage(
    undefined,
    `http://${SUPABASE_HOST}/x.png`,
    { allowedOrigins: allowed, fetchImpl: noFetch },
  );
  assert.deepEqual(result, { error: "slabImageUrl must be https" });
});

test("resolveSlabImage: rejects disallowed https origin when allowlist non-empty", async () => {
  const result = await resolveSlabImage(
    undefined,
    "https://evil.example.com/x.png",
    { allowedOrigins: allowed, fetchImpl: noFetch },
  );
  assert.deepEqual(result, { error: "slabImageUrl host not allowed" });
});

test("resolveSlabImage: empty allowlist permits any https host", async () => {
  const fetchImpl = makeFetch(
    () =>
      new Response(PNG_BYTES, {
        status: 200,
        headers: { "content-type": "image/png" },
      }),
  );

  const result = await resolveSlabImage(
    undefined,
    "https://anywhere.example.com/x.png",
    { allowedOrigins: new Set(), fetchImpl: fetchImpl as typeof fetch },
  );

  assert.ok(!("error" in result));
});

test("resolveSlabImage: allows http://localhost in dev", async () => {
  let fetched: string | null = null;
  const fetchImpl = makeFetch((url) => {
    fetched = url;
    return new Response(PNG_BYTES, {
      status: 200,
      headers: { "content-type": "image/png" },
    });
  });

  const result = await resolveSlabImage(
    undefined,
    "http://localhost:54321/storage/v1/object/public/x.png",
    {
      allowedOrigins: new Set([HTTPS_ORIGIN]),
      fetchImpl: fetchImpl as typeof fetch,
    },
  );

  assert.equal(fetched, "http://localhost:54321/storage/v1/object/public/x.png");
  assert.ok(!("error" in result));
});

test("resolveSlabImage: allows http://127.0.0.1 in dev", async () => {
  const fetchImpl = makeFetch(
    () =>
      new Response(PNG_BYTES, {
        status: 200,
        headers: { "content-type": "image/png" },
      }),
  );

  const result = await resolveSlabImage(
    undefined,
    "http://127.0.0.1:54321/x.png",
    {
      allowedOrigins: new Set([HTTPS_ORIGIN]),
      fetchImpl: fetchImpl as typeof fetch,
    },
  );

  assert.ok(!("error" in result));
});

test("resolveSlabImage: allows http when the configured origin is http (e.g. local Supabase)", async () => {
  const fetchImpl = makeFetch(
    () =>
      new Response(PNG_BYTES, {
        status: 200,
        headers: { "content-type": "image/png" },
      }),
  );

  const result = await resolveSlabImage(
    undefined,
    "http://supabase-kong.internal:8000/x.png",
    {
      allowedOrigins: new Set(["http://supabase-kong.internal:8000"]),
      fetchImpl: fetchImpl as typeof fetch,
    },
  );

  assert.ok(!("error" in result));
});

test("resolveSlabImage: surfaces non-2xx fetch as error", async () => {
  const fetchImpl = makeFetch(() => new Response("nope", { status: 404 }));

  const result = await resolveSlabImage(
    undefined,
    `${HTTPS_ORIGIN}/missing.png`,
    { allowedOrigins: allowed, fetchImpl: fetchImpl as typeof fetch },
  );
  assert.deepEqual(result, { error: "Failed to fetch slab image (404)" });
});

test("resolveSlabImage: back-compat — accepts data URL slabImage", async () => {
  const dataUrl = `data:image/png;base64,${PNG_BYTES.toString("base64")}`;
  const result = await resolveSlabImage(dataUrl, undefined, {
    allowedOrigins: allowed,
    fetchImpl: noFetch,
  });

  assert.ok(!("error" in result));
  if ("error" in result) return;
  assert.equal(result.mimeType, "image/png");
  assert.equal(result.data, PNG_BYTES.toString("base64"));
});

test("resolveSlabImage: back-compat — bare base64 defaults to image/jpeg", async () => {
  const bare = PNG_BYTES.toString("base64");
  const result = await resolveSlabImage(bare, undefined, {
    allowedOrigins: allowed,
    fetchImpl: noFetch,
  });

  assert.ok(!("error" in result));
  if ("error" in result) return;
  assert.equal(result.mimeType, "image/jpeg");
  assert.equal(result.data, bare);
});

test("resolveSlabImage: prefers slabImageUrl when both provided", async () => {
  let fetched = false;
  const fetchImpl = makeFetch(() => {
    fetched = true;
    return new Response(PNG_BYTES, {
      status: 200,
      headers: { "content-type": "image/png" },
    });
  });

  const result = await resolveSlabImage(
    "data:image/jpeg;base64,AAAA",
    `${HTTPS_ORIGIN}/x.png`,
    { allowedOrigins: allowed, fetchImpl: fetchImpl as typeof fetch },
  );

  assert.ok(fetched, "should have fetched the URL, not used the data URL");
  assert.ok(!("error" in result));
  if ("error" in result) return;
  assert.equal(result.mimeType, "image/png");
});

test("resolveSlabImage: errors when neither slabImage nor slabImageUrl provided", async () => {
  const result = await resolveSlabImage(undefined, undefined);
  assert.deepEqual(result, { error: "Slab image is required" });
});
