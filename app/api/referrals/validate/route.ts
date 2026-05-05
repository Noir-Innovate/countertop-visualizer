import { NextRequest, NextResponse } from "next/server";
import { lookupReferrerByCode } from "@/lib/referrals";

// In-memory rate limit (10 req / min / IP). Resets on cold start; acceptable
// for v1 since the referral code endpoint is public and low-value to spam.
const RATE_LIMIT = 10;
const WINDOW_MS = 60_000;
const hits = new Map<string, { count: number; resetAt: number }>();

function rateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || entry.resetAt < now) {
    hits.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  entry.count += 1;
  return entry.count <= RATE_LIMIT;
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.json({ valid: false }, { status: 400 });
  }
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!rateLimit(ip)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const referrer = await lookupReferrerByCode(code);
  if (!referrer) {
    return NextResponse.json({ valid: false });
  }
  return NextResponse.json({
    valid: true,
    referrerName: referrer.displayName,
  });
}
