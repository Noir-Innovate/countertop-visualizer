import { test } from "node:test";
import assert from "node:assert/strict";
import { MorawareClient, MorawareError } from "../lib/moraware/client";

const config = {
  tenant: "example",
  userName: "u",
  password: "p",
};

function clientWithSession() {
  const client = new MorawareClient(config);
  // Stand in for a completed login without touching the network.
  (client as unknown as { sessionId: string }).sessionId = "SESSION";
  return client;
}

test("refuses every non-Query command, so a bug cannot mutate Moraware", async () => {
  const client = clientWithSession();
  const forbidden = [
    "jobCreate",
    "jobUpdate",
    "jobDelete",
    "accountCreate",
    "accountUpdate",
    "accountDelete",
    "jobActivityUpdate",
    "sessionLogout",
    "jobConvert",
  ];

  for (const command of forbidden) {
    await assert.rejects(
      () => client.query(command),
      (err: unknown) =>
        err instanceof MorawareError && /read-only/.test((err as Error).message),
      `${command} should have been refused`,
    );
  }
});

test("the guard runs before the session check, so it cannot be bypassed", async () => {
  const client = new MorawareClient(config); // never logged in
  await assert.rejects(
    () => client.query("jobDelete"),
    (err: unknown) =>
      err instanceof MorawareError && /read-only/.test((err as Error).message),
  );
});

test("query requires a session", async () => {
  const client = new MorawareClient(config);
  await assert.rejects(
    () => client.query("jobQuery"),
    (err: unknown) =>
      err instanceof MorawareError && /Not logged in/.test((err as Error).message),
  );
});

test("Query commands are allowed through to transport", async () => {
  const client = clientWithSession();
  let sent = "";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_url: string, init: { body: string }) => {
    sent = init.body;
    return new Response("<MorawareResponse><jobQuery/></MorawareResponse>", {
      status: 200,
    });
  }) as unknown as typeof fetch;

  try {
    await client.query("jobQuery", "<job id='1'/>");
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.match(sent, /<MorawareCommand version="5" sessionId="SESSION">/);
  assert.match(sent, /<jobQuery><job id='1'\/><\/jobQuery>/);
});

test("structured Moraware errors surface as MorawareError", async () => {
  const client = clientWithSession();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      '<error errorCode="4" errorCodeDescription="Invalid Request Document">' +
        "<description>Missing &lt;job&gt; element.</description></error>",
      { status: 200 },
    )) as unknown as typeof fetch;

  try {
    await assert.rejects(
      () => client.query("jobQuery"),
      (err: unknown) =>
        err instanceof MorawareError &&
        err.code === "4" &&
        err.codeDescription === "Invalid Request Document" &&
        /Missing <job> element/.test((err as Error).message),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("credentials are XML-escaped rather than breaking the envelope", async () => {
  const client = new MorawareClient({
    tenant: "example",
    userName: 'a"b&c',
    password: "<pw>",
  });
  let sent = "";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_url: string, init: { body: string }) => {
    sent = init.body;
    return new Response(
      '<MorawareResponse><sessionCreate><session id="S1"/></sessionCreate></MorawareResponse>',
      { status: 200 },
    );
  }) as unknown as typeof fetch;

  try {
    await client.login();
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.match(sent, /userName="a&quot;b&amp;c"/);
  assert.match(sent, /password="&lt;pw&gt;"/);
});
