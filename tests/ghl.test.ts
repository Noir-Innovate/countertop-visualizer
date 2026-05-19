import test from "node:test";
import assert from "node:assert/strict";
import {
  upsertContact,
  addNote,
  addTags,
  testConnection,
  GhlError,
  type GhlClient,
} from "@/lib/integrations/ghl";

type FetchCall = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
};

function installMockFetch(
  handler: (call: FetchCall) => {
    status: number;
    body: unknown;
  },
): { calls: FetchCall[]; restore: () => void } {
  const calls: FetchCall[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const headers: Record<string, string> = {};
    if (init?.headers) {
      const h = init.headers as Record<string, string>;
      for (const k of Object.keys(h)) headers[k] = h[k];
    }
    const call: FetchCall = {
      url,
      method: init?.method || "GET",
      headers,
      body: init?.body ? JSON.parse(init.body as string) : undefined,
    };
    calls.push(call);
    const res = handler(call);
    return new Response(
      typeof res.body === "string" ? res.body : JSON.stringify(res.body),
      {
        status: res.status,
        headers: { "Content-Type": "application/json" },
      },
    );
  }) as typeof fetch;
  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

const client: GhlClient = { locationId: "loc_123", token: "pit-test-token" };

test("upsertContact: sends correct payload and parses contactId", async () => {
  const { calls, restore } = installMockFetch(() => ({
    status: 200,
    body: { contact: { id: "ctc_abc" }, new: true },
  }));
  try {
    const result = await upsertContact(client, {
      email: "jane@example.com",
      firstName: "Jane",
      lastName: "Doe",
    });
    assert.equal(result.contactId, "ctc_abc");
    assert.equal(result.created, true);
    assert.equal(calls.length, 1);
    assert.equal(
      calls[0].url,
      "https://services.leadconnectorhq.com/contacts/upsert",
    );
    assert.equal(calls[0].method, "POST");
    assert.equal(calls[0].headers.Authorization, "Bearer pit-test-token");
    assert.equal(calls[0].headers.Version, "2021-07-28");
    const body = calls[0].body as Record<string, unknown>;
    assert.equal(body.locationId, "loc_123");
    assert.equal(body.email, "jane@example.com");
    // tags must NOT be in the upsert payload — GHL replaces existing tags.
    assert.equal(body.tags, undefined);
  } finally {
    restore();
  }
});

test("upsertContact: works with only phone", async () => {
  const { calls, restore } = installMockFetch(() => ({
    status: 200,
    body: { contact: { id: "ctc_phone" }, new: false },
  }));
  try {
    const result = await upsertContact(client, { phone: "+15551234567" });
    assert.equal(result.contactId, "ctc_phone");
    assert.equal(result.created, false);
    const body = calls[0].body as Record<string, unknown>;
    assert.equal(body.phone, "+15551234567");
    assert.equal(body.email, undefined);
  } finally {
    restore();
  }
});

test("upsertContact: throws GhlError on 401", async () => {
  const { restore } = installMockFetch(() => ({
    status: 401,
    body: { message: "Invalid token" },
  }));
  try {
    await assert.rejects(
      () => upsertContact(client, { email: "x@y.com" }),
      (err: unknown) => {
        assert.ok(err instanceof GhlError);
        assert.equal((err as GhlError).status, 401);
        return true;
      },
    );
  } finally {
    restore();
  }
});

test("addNote: posts to correct contact endpoint", async () => {
  const { calls, restore } = installMockFetch(() => ({
    status: 201,
    body: { id: "note_1" },
  }));
  try {
    await addNote(client, "ctc_abc", "hello world");
    assert.equal(
      calls[0].url,
      "https://services.leadconnectorhq.com/contacts/ctc_abc/notes",
    );
    const body = calls[0].body as Record<string, unknown>;
    assert.equal(body.body, "hello world");
  } finally {
    restore();
  }
});

test("addTags: posts to /tags endpoint additively (does not wipe existing)", async () => {
  const { calls, restore } = installMockFetch(() => ({
    status: 200,
    body: { ok: true },
  }));
  try {
    await addTags(client, "ctc_abc", ["countertop-visualizer", "acme-line"]);
    assert.equal(calls.length, 1);
    assert.equal(
      calls[0].url,
      "https://services.leadconnectorhq.com/contacts/ctc_abc/tags",
    );
    const body = calls[0].body as Record<string, unknown>;
    assert.deepEqual(body.tags, ["countertop-visualizer", "acme-line"]);
  } finally {
    restore();
  }
});

test("addTags: no-ops when given empty list", async () => {
  const { calls, restore } = installMockFetch(() => ({
    status: 200,
    body: {},
  }));
  try {
    await addTags(client, "ctc_abc", []);
    assert.equal(calls.length, 0);
  } finally {
    restore();
  }
});

test("testConnection: upserts (no tags), adds cv-test tag, then attaches note", async () => {
  const { calls, restore } = installMockFetch((call) => {
    if (call.url.endsWith("/contacts/upsert")) {
      return { status: 200, body: { contact: { id: "ctc_test" }, new: true } };
    }
    return { status: 201, body: { id: "note_test" } };
  });
  try {
    const result = await testConnection(client);
    assert.equal(result.contactId, "ctc_test");
    assert.equal(calls.length, 3);
    assert.match(calls[0].url, /\/contacts\/upsert$/);
    assert.match(calls[1].url, /\/contacts\/ctc_test\/tags$/);
    assert.match(calls[2].url, /\/contacts\/ctc_test\/notes$/);
    const upsertBody = calls[0].body as Record<string, unknown>;
    assert.equal(upsertBody.tags, undefined);
    const tagsBody = calls[1].body as Record<string, unknown>;
    assert.deepEqual(tagsBody.tags, ["cv-test"]);
  } finally {
    restore();
  }
});
