import { randomBytes } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";

const DEFAULT_COMMISSION_BPS = 4000; // 40%
const PAYING_STATUSES = new Set(["active", "trialing", "past_due"]);

export interface SupabaseLike {
  from: (table: string) => unknown;
}

async function getClient(client?: SupabaseLike): Promise<SupabaseLike> {
  if (client) return client;
  return (await createServiceClient()) as unknown as SupabaseLike;
}

export function getCommissionRateBps(): number {
  const raw = process.env.REFERRAL_COMMISSION_BPS;
  if (!raw) return DEFAULT_COMMISSION_BPS;
  const parsed = parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_COMMISSION_BPS;
  return parsed;
}

// Crockford-style base32 (no I/L/O/U) for human-readable, unambiguous codes.
const ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";

export function generateReferralCode(): string {
  const buf = randomBytes(8);
  let out = "";
  for (let i = 0; i < 8; i++) {
    out += ALPHABET[buf[i] % ALPHABET.length];
  }
  return out;
}

export async function isOrgPaying(
  organizationId: string,
  client?: SupabaseLike,
): Promise<boolean> {
  const service = (await getClient(client)) as any;
  const { data } = await service
    .from("organization_billing_accounts")
    .select("internal_plan_status")
    .eq("organization_id", organizationId)
    .maybeSingle();
  return data ? PAYING_STATUSES.has(data.internal_plan_status) : false;
}

/**
 * Mint (or fetch) a per-profile referral code. Anyone with an account can have
 * one — being a paying-org owner is no longer a prerequisite, since a person
 * may want to refer the product without running their own org.
 */
export async function ensureReferralCodeForProfile(
  profileId: string,
  client?: SupabaseLike,
): Promise<{ code: string }> {
  const service = (await getClient(client)) as any;
  const { data: existing } = await service
    .from("profile_referral_codes")
    .select("code")
    .eq("profile_id", profileId)
    .maybeSingle();
  if (existing?.code) return { code: existing.code };

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateReferralCode();
    const { data, error } = await service
      .from("profile_referral_codes")
      .insert({ profile_id: profileId, code })
      .select("code")
      .single();
    if (!error && data) return { code: data.code };
    // 23505 = unique violation (code collision or already exists for profile).
    if (error && error.code !== "23505") {
      throw new Error(error.message);
    }
    const { data: refetch } = await service
      .from("profile_referral_codes")
      .select("code")
      .eq("profile_id", profileId)
      .maybeSingle();
    if (refetch?.code) return { code: refetch.code };
  }
  throw new Error("Failed to mint referral code after retries");
}

/**
 * Resolve a code → the referring profile. Used by the public signup page to
 * show "you were invited by X".
 */
export async function lookupReferrerByCode(
  code: string,
  client?: SupabaseLike,
): Promise<{ profileId: string; displayName: string } | null> {
  const service = (await getClient(client)) as any;
  const { data } = await service
    .from("profile_referral_codes")
    .select("profile_id, profiles:profile_id(full_name, email)")
    .eq("code", code)
    .maybeSingle();
  if (!data) return null;
  const p = data.profiles as
    | { full_name?: string | null; email?: string | null }
    | { full_name?: string | null; email?: string | null }[]
    | null;
  const profile = Array.isArray(p) ? p[0] : p;
  const displayName =
    profile?.full_name?.trim() || profile?.email?.trim() || "another customer";
  return { profileId: data.profile_id, displayName };
}

/**
 * Record a pending referral. Called from the org-create route once we know
 * which org the referee just stood up.
 *
 * The relationship is: referrer (a person) → referee (an org + the person who
 * created it). Commissions are paid to the referrer profile; the referee org
 * is what we track for billing/activation/churn.
 */
export async function attributeReferral(
  input: {
    refereeOrgId: string;
    refereeProfileId: string;
    refereeEmail: string;
    code: string;
  },
  client?: SupabaseLike,
): Promise<{ referralId: string } | { error: string }> {
  const referrer = await lookupReferrerByCode(input.code, client);
  if (!referrer) return { error: "invalid_code" };
  if (referrer.profileId === input.refereeProfileId) {
    return { error: "self_referral" };
  }

  const service = (await getClient(client)) as any;

  // Anti-fraud: reject if the referee email matches the referrer profile's
  // own email (same person trying to refer themselves with two accounts).
  const { data: referrerProfile } = await service
    .from("profiles")
    .select("email")
    .eq("id", referrer.profileId)
    .maybeSingle();
  const refEmail = (referrerProfile?.email ?? "").toLowerCase();
  if (refEmail && refEmail === input.refereeEmail.toLowerCase()) {
    return { error: "same_email_as_referrer" };
  }

  const { data, error } = await service
    .from("referrals")
    .insert({
      referrer_profile_id: referrer.profileId,
      referee_organization_id: input.refereeOrgId,
      referee_profile_id: input.refereeProfileId,
      referee_email: input.refereeEmail,
      status: "pending",
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return { error: "already_referred" };
    return { error: error.message };
  }
  return { referralId: data.id };
}

export async function activateReferralForOrg(
  refereeOrgId: string,
  client?: SupabaseLike,
): Promise<void> {
  const service = (await getClient(client)) as any;
  await service
    .from("referrals")
    .update({ status: "active", activated_at: new Date().toISOString() })
    .eq("referee_organization_id", refereeOrgId)
    .eq("status", "pending");
}

export async function recordCommissionForInvoice(
  input: {
    refereeOrgId: string;
    stripeInvoiceId: string;
    invoiceAmountCents: number;
  },
  client?: SupabaseLike,
): Promise<void> {
  if (input.invoiceAmountCents <= 0) return;

  const service = (await getClient(client)) as any;
  const { data: referral } = await service
    .from("referrals")
    .select(
      "id, referrer_profile_id, referee_organization_id",
    )
    .eq("referee_organization_id", input.refereeOrgId)
    .maybeSingle();
  if (!referral || !referral.referrer_profile_id) return;

  const rateBps = getCommissionRateBps();
  const commissionCents = Math.floor(
    (input.invoiceAmountCents * rateBps) / 10000,
  );
  if (commissionCents <= 0) return;

  const { error } = await service.from("referral_commissions").insert({
    referral_id: referral.id,
    referrer_profile_id: referral.referrer_profile_id,
    referee_organization_id: referral.referee_organization_id,
    stripe_invoice_id: input.stripeInvoiceId,
    invoice_amount_cents: input.invoiceAmountCents,
    commission_amount_cents: commissionCents,
    commission_rate_bps: rateBps,
  });
  // 23505 = duplicate stripe_invoice_id — webhook replay, ignore.
  if (error && error.code !== "23505") {
    throw new Error(error.message);
  }
}

