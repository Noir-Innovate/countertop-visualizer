import { createServiceClient } from "@/lib/supabase/server";
import { normalizeEmail, type MessageClass } from "@/lib/email-suppression";

/**
 * OD-7b — warmup ramp enforcement, part of the shared send guard (sendEmail).
 *
 * The ramp is a whole-domain number. We enforce two caps against
 * outbound_send_log:
 *   - a daily domain-wide ceiling (across every from-address)
 *   - a per-address hourly rate (default 8/hour)
 *
 * Only COMMERCIAL sends are blocked by a cap — blocking a password reset because
 * the cold-campaign ramp is exhausted would be the same class of product bug as
 * suppression blocking transactional mail. Transactional sends are still logged,
 * so they count toward the domain total that gates commercial volume.
 *
 * The concrete ramp schedule arrives as a separate packet; until then the caps
 * are env-configurable with conservative defaults.
 */

export const DEFAULT_DAILY_CAP = 10;
export const DEFAULT_HOURLY_PER_ADDRESS_CAP = 8;

function capFromEnv(name: string, fallback: number): number {
  const v = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isSafeInteger(v) && v > 0 ? v : fallback;
}

export function dailyCap(): number {
  return capFromEnv("OUTBOUND_DAILY_SEND_CAP", DEFAULT_DAILY_CAP);
}
export function hourlyPerAddressCap(): number {
  return capFromEnv("OUTBOUND_HOURLY_PER_ADDRESS_CAP", DEFAULT_HOURLY_PER_ADDRESS_CAP);
}

export function startOfUtcDayIso(now: Date = new Date()): string {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  ).toISOString();
}

export interface CapDecisionInput {
  messageClass: MessageClass;
  dailyCount: number;
  hourlyCountForAddress: number;
  dailyCap: number;
  hourlyCap: number;
}

/**
 * Pure cap decision (unit testable without a DB). Transactional is never blocked
 * by a ramp cap.
 */
export function exceedsCaps(
  input: CapDecisionInput,
): { blocked: boolean; reason?: string } {
  if (input.messageClass !== "commercial") return { blocked: false };
  if (input.dailyCount >= input.dailyCap) {
    return {
      blocked: true,
      reason: `daily domain send cap reached (${input.dailyCount}/${input.dailyCap})`,
    };
  }
  if (input.hourlyCountForAddress >= input.hourlyCap) {
    return {
      blocked: true,
      reason: `hourly per-address send cap reached (${input.hourlyCountForAddress}/${input.hourlyCap})`,
    };
  }
  return { blocked: false };
}

/**
 * DB-backed cap check for a pending send. Fail-closed: a counting error throws
 * and the caller (sendEmail) turns it into a failed send rather than sending
 * blind past the ramp.
 */
export async function checkSendCaps(
  fromAddress: string,
  messageClass: MessageClass,
): Promise<{ blocked: boolean; reason?: string }> {
  // Transactional never hits the ramp cap; skip the queries entirely.
  if (messageClass !== "commercial") return { blocked: false };

  const supabase = await createServiceClient();
  const from = normalizeEmail(fromAddress);
  const dayStart = startOfUtcDayIso();
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const [dayRes, hourRes] = await Promise.all([
    supabase
      .from("outbound_send_log")
      .select("id", { count: "exact", head: true })
      .gte("sent_at", dayStart),
    supabase
      .from("outbound_send_log")
      .select("id", { count: "exact", head: true })
      .eq("from_address", from)
      .gte("sent_at", hourAgo),
  ]);
  if (dayRes.error) {
    throw new Error(`send-cap daily count failed: ${dayRes.error.message}`);
  }
  if (hourRes.error) {
    throw new Error(`send-cap hourly count failed: ${hourRes.error.message}`);
  }

  return exceedsCaps({
    messageClass,
    dailyCount: dayRes.count ?? 0,
    hourlyCountForAddress: hourRes.count ?? 0,
    dailyCap: dailyCap(),
    hourlyCap: hourlyPerAddressCap(),
  });
}

/**
 * Record delivered recipients (one row each) so the domain counter reflects
 * real volume. Best-effort: a logging failure must not fail an email that was
 * already accepted by Resend, but it is loud.
 */
export async function recordSends(
  fromAddress: string,
  toAddresses: string[],
  messageClass: MessageClass,
): Promise<void> {
  if (toAddresses.length === 0) return;
  const supabase = await createServiceClient();
  const from = normalizeEmail(fromAddress);
  const rows = toAddresses.map((to) => ({
    from_address: from,
    to_address: normalizeEmail(to),
    message_class: messageClass,
  }));
  const { error } = await supabase.from("outbound_send_log").insert(rows);
  if (error) {
    console.error("[email] failed to record outbound_send_log:", error.message);
  }
}
