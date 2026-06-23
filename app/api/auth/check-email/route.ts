import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

// Authoritative "is this email already registered?" check used by the signup
// page before calling auth.signUp(). Supabase's signUp() silently no-ops for an
// existing email (returns an obfuscated user with empty `identities` and sends
// no confirmation email), which made signup look successful while nothing
// happened. We check the `profiles` table (kept in sync with auth.users via the
// email trigger in migration 019) so the result is reliable regardless of
// whether email confirmation is enabled.
export async function POST(request: NextRequest) {
  try {
    const { email } = (await request.json()) as { email?: string };

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    // Supabase normalizes auth emails to lowercase, and the profiles email
    // trigger (migration 019) copies that value, so an exact lowercase match is
    // reliable — and avoids treating user-supplied `%`/`_` as LIKE wildcards.
    const normalized = email.trim().toLowerCase();
    const supabase = await createServiceClient();

    const { data, error } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", normalized)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("check-email lookup failed:", error);
      // Fail open: let signUp proceed rather than blocking legitimate signups.
      return NextResponse.json({ exists: false });
    }

    return NextResponse.json({ exists: Boolean(data) });
  } catch (error) {
    console.error("check-email unexpected error:", error);
    return NextResponse.json({ exists: false });
  }
}
