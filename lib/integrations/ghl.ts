// GoHighLevel API v2 client.
// Docs: https://highlevel.stoplight.io/docs/integrations/

const BASE_URL = "https://services.leadconnectorhq.com";
const API_VERSION = "2021-07-28";

export interface GhlClient {
  locationId: string;
  token: string;
}

export interface GhlUpsertContactInput {
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  address1?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  source?: string;
  tags?: string[];
  customFields?: Array<{ key: string; field_value: string }>;
}

export interface GhlUpsertContactResult {
  contactId: string;
  created: boolean;
}

export class GhlError extends Error {
  status: number;
  body: string;
  constructor(message: string, status: number, body: string) {
    super(message);
    this.name = "GhlError";
    this.status = status;
    this.body = body;
  }
}

function headers(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Version: API_VERSION,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

async function parseError(res: Response): Promise<GhlError> {
  let body = "";
  try {
    body = await res.text();
  } catch {
    // ignore
  }
  const snippet = body.length > 500 ? body.slice(0, 500) + "…" : body;
  return new GhlError(
    `GHL request failed: ${res.status} ${res.statusText}${snippet ? ` — ${snippet}` : ""}`,
    res.status,
    body,
  );
}

export async function upsertContact(
  client: GhlClient,
  input: GhlUpsertContactInput,
): Promise<GhlUpsertContactResult> {
  const payload: Record<string, unknown> = {
    locationId: client.locationId,
  };
  if (input.email) payload.email = input.email;
  if (input.phone) payload.phone = input.phone;
  if (input.firstName) payload.firstName = input.firstName;
  if (input.lastName) payload.lastName = input.lastName;
  if (input.name) payload.name = input.name;
  if (input.address1) payload.address1 = input.address1;
  if (input.city) payload.city = input.city;
  if (input.state) payload.state = input.state;
  if (input.postalCode) payload.postalCode = input.postalCode;
  if (input.country) payload.country = input.country;
  if (input.source) payload.source = input.source;
  // NOTE: do NOT pass tags here. GHL's /contacts/upsert replaces the tag array
  // on matched contacts, wiping any tags the user added. Use addTags() instead,
  // which posts to /contacts/{id}/tags and merges additively.
  if (input.customFields && input.customFields.length > 0) {
    payload.customFields = input.customFields;
  }

  const res = await fetch(`${BASE_URL}/contacts/upsert`, {
    method: "POST",
    headers: headers(client.token),
    body: JSON.stringify(payload),
  });

  if (!res.ok) throw await parseError(res);

  const data = (await res.json()) as {
    contact?: { id?: string };
    new?: boolean;
  };
  const contactId = data?.contact?.id;
  if (!contactId) {
    throw new GhlError(
      "GHL upsert returned no contact id",
      res.status,
      JSON.stringify(data),
    );
  }
  return { contactId, created: data.new === true };
}

export async function addNote(
  client: GhlClient,
  contactId: string,
  body: string,
): Promise<void> {
  const res = await fetch(`${BASE_URL}/contacts/${contactId}/notes`, {
    method: "POST",
    headers: headers(client.token),
    body: JSON.stringify({ body, userId: undefined }),
  });
  if (!res.ok) throw await parseError(res);
}

// Adds tags to a contact without removing existing ones. Safe to call with
// tags the contact already has — GHL deduplicates.
export async function addTags(
  client: GhlClient,
  contactId: string,
  tags: string[],
): Promise<void> {
  const filtered = tags.filter((t) => t && t.trim().length > 0);
  if (filtered.length === 0) return;
  const res = await fetch(`${BASE_URL}/contacts/${contactId}/tags`, {
    method: "POST",
    headers: headers(client.token),
    body: JSON.stringify({ tags: filtered }),
  });
  if (!res.ok) throw await parseError(res);
}

export interface GhlTestResult {
  contactId: string;
  created: boolean;
}

export async function testConnection(client: GhlClient): Promise<GhlTestResult> {
  // Unique-ish email so re-tests upsert the same contact (no dupes piling up).
  const testEmail = `countertop-visualizer-test@${client.locationId}.cv-test.local`;
  const upserted = await upsertContact(client, {
    email: testEmail,
    firstName: "Countertop Visualizer",
    lastName: "Test",
    source: "countertop-visualizer",
  });
  await addTags(client, upserted.contactId, ["cv-test"]);
  await addNote(
    client,
    upserted.contactId,
    "Test note from Countertop Visualizer. Safe to delete this contact.",
  );
  return upserted;
}
