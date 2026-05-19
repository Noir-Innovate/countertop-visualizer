import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptSecret } from "@/lib/crypto";
import {
  upsertContact,
  addNote,
  addTags,
  type GhlClient,
} from "@/lib/integrations/ghl";

type SkipReason =
  | "missing_org_or_line"
  | "material_line_not_found"
  | "line_toggle_off"
  | "no_integration"
  | "integration_disabled"
  | `token_decrypt_failed: ${string}`
  | `lead_fetch_failed: ${string}`;

export type PushResult =
  | { pushed: true; contactId: string }
  | { pushed: false; reason: SkipReason };

function splitName(full: string): { firstName?: string; lastName?: string } {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 0 || parts[0] === "") return {};
  if (parts.length === 1) return { firstName: parts[0] };
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

function appUrl(): string | null {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)
  );
}

interface LoadIntegrationResult {
  client: GhlClient;
  lineSlug: string;
  lineName: string;
}

async function loadGhlClient(
  supabase: SupabaseClient,
  organizationId: string,
  materialLineId: string,
): Promise<LoadIntegrationResult | { skip: SkipReason }> {
  const { data: line } = await supabase
    .from("material_lines")
    .select("id, name, slug, ghl_push_enabled")
    .eq("id", materialLineId)
    .single();
  if (!line) return { skip: "material_line_not_found" };
  if (!line.ghl_push_enabled) return { skip: "line_toggle_off" };

  const { data: integration } = await supabase
    .from("crm_integrations")
    .select("location_id, api_token, enabled")
    .eq("organization_id", organizationId)
    .eq("provider", "ghl")
    .maybeSingle();
  if (!integration) return { skip: "no_integration" };
  if (!integration.enabled) return { skip: "integration_disabled" };

  try {
    const token = decryptSecret(integration.api_token);
    return {
      client: { locationId: integration.location_id, token },
      lineSlug: line.slug,
      lineName: line.name,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    return { skip: `token_decrypt_failed: ${msg}` };
  }
}

// ---------- Lead flow ----------

interface PushLeadInput {
  supabase: SupabaseClient;
  leadId: string;
}

export async function pushLeadToGhl({
  supabase,
  leadId,
}: PushLeadInput): Promise<PushResult> {
  const { data: lead, error: leadErr } = await supabase
    .from("leads")
    .select("*")
    .eq("id", leadId)
    .single();
  if (leadErr || !lead) {
    return { pushed: false, reason: `lead_fetch_failed: ${leadErr?.message}` };
  }
  if (!lead.organization_id || !lead.material_line_id) {
    return { pushed: false, reason: "missing_org_or_line" };
  }

  const loaded = await loadGhlClient(
    supabase,
    lead.organization_id,
    lead.material_line_id,
  );
  if ("skip" in loaded) return { pushed: false, reason: loaded.skip };

  const { client, lineSlug, lineName } = loaded;
  const { firstName, lastName } = splitName(lead.name || "");
  const tags = ["countertop-visualizer", lineSlug].filter(Boolean);

  const upserted = await upsertContact(client, {
    email: lead.email || undefined,
    phone: lead.phone || undefined,
    firstName,
    lastName,
    address1: lead.address || undefined,
    source: lead.utm_source || "countertop-visualizer",
  });
  await addTags(client, upserted.contactId, tags);

  const lines: (string | null)[] = [
    "New lead from Countertop Visualizer",
    "",
    `Name: ${lead.name || "(none)"}`,
    `Email: ${lead.email || "(none)"}`,
    lead.phone ? `Phone: ${lead.phone}` : null,
    `Address: ${lead.address || "(none)"}`,
    "",
    `Material line: ${lineName}`,
    lead.selected_slab_id ? `Selected slab id: ${lead.selected_slab_id}` : null,
    lead.original_image_url ? `Before image: ${lead.original_image_url}` : null,
    lead.selected_image_url ? `After image: ${lead.selected_image_url}` : null,
  ];

  const utm = [
    lead.utm_source && `source=${lead.utm_source}`,
    lead.utm_medium && `medium=${lead.utm_medium}`,
    lead.utm_campaign && `campaign=${lead.utm_campaign}`,
    lead.utm_term && `term=${lead.utm_term}`,
    lead.utm_content && `content=${lead.utm_content}`,
    lead.referrer && `referrer=${lead.referrer}`,
  ].filter(Boolean);
  if (utm.length > 0) {
    lines.push("", `Attribution: ${utm.join(" | ")}`);
  }

  const base = appUrl();
  if (base) {
    lines.push(
      "",
      `View in dashboard: ${base}/dashboard/organizations/${lead.organization_id}/leads?lead=${leadId}`,
    );
  }

  await addNote(
    client,
    upserted.contactId,
    lines.filter((l): l is string => l !== null).join("\n"),
  );

  return { pushed: true, contactId: upserted.contactId };
}

// ---------- Free-resource flow ----------

export interface PushFreeResourceInput {
  supabase: SupabaseClient;
  organizationId: string;
  materialLineId: string;
  email: string;
  resourceTitle: string;
  resourceUrl?: string | null;
  utm?: {
    source?: string | null;
    medium?: string | null;
    campaign?: string | null;
    term?: string | null;
    content?: string | null;
    referrer?: string | null;
  };
}

export async function pushFreeResourceToGhl({
  supabase,
  organizationId,
  materialLineId,
  email,
  resourceTitle,
  resourceUrl,
  utm,
}: PushFreeResourceInput): Promise<PushResult> {
  const loaded = await loadGhlClient(supabase, organizationId, materialLineId);
  if ("skip" in loaded) return { pushed: false, reason: loaded.skip };

  const { client, lineSlug, lineName } = loaded;
  const tags = ["countertop-visualizer", "free-resource", lineSlug].filter(
    Boolean,
  );

  const upserted = await upsertContact(client, {
    email,
    source: utm?.source || "countertop-visualizer-free-resource",
  });
  await addTags(client, upserted.contactId, tags);

  const lines: (string | null)[] = [
    `Requested free resource: ${resourceTitle}`,
    "",
    `Email: ${email}`,
    `Material line: ${lineName}`,
    resourceUrl ? `Resource: ${resourceUrl}` : null,
  ];

  const utmLine = [
    utm?.source && `source=${utm.source}`,
    utm?.medium && `medium=${utm.medium}`,
    utm?.campaign && `campaign=${utm.campaign}`,
    utm?.term && `term=${utm.term}`,
    utm?.content && `content=${utm.content}`,
    utm?.referrer && `referrer=${utm.referrer}`,
  ].filter(Boolean);
  if (utmLine.length > 0) {
    lines.push("", `Attribution: ${utmLine.join(" | ")}`);
  }

  await addNote(
    client,
    upserted.contactId,
    lines.filter((l): l is string => l !== null).join("\n"),
  );

  return { pushed: true, contactId: upserted.contactId };
}
