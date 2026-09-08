import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { addSuppression } from "@/lib/email-suppression";
import { verifyUnsubscribeToken } from "@/lib/unsubscribe-token";

// OD-5 — one-click unsubscribe backing the List-Unsubscribe header (RFC 8058).
// Our emails are plain text with a reply-based opt-out and NO footer button;
// this endpoint exists so Gmail/Outlook's native "unsubscribe" affordance works.
//
// Scanner/prefetch safety: the state change happens ONLY on POST (RFC 8058
// One-Click sends `POST` with body `List-Unsubscribe=One-Click`). A GET has no
// side effect, so a mail-security bot that fetches the URL cannot unsubscribe a
// live prospect.
export const dynamic = "force-dynamic";

async function suppressFromToken(token: string | null): Promise<
  | { ok: true; email: string; alreadySuppressed: boolean }
  | { ok: false; status: number; message: string }
> {
  const email = verifyUnsubscribeToken(token);
  if (!email) {
    return { ok: false, status: 400, message: "Invalid or missing unsubscribe token." };
  }

  // Write suppression FIRST, before anything else. This is the whole point.
  const result = await addSuppression(email, "unsubscribed");
  if (!result.ok) {
    return { ok: false, status: 500, message: "Could not process unsubscribe. Please try again." };
  }

  // Best-effort: reflect the opt-out on matching prospect rows. Never let this
  // block or fail the suppression write above.
  try {
    const supabase = await createServiceClient();
    await supabase
      .from("prospects")
      .update({ status: "unsubscribed" })
      .eq("email", email);
  } catch {
    // ignore — suppression is the source of truth
  }

  return { ok: true, email, alreadySuppressed: result.alreadySuppressed };
}

export async function POST(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const outcome = await suppressFromToken(token);
  if (!outcome.ok) {
    return new NextResponse(outcome.message, { status: outcome.status });
  }
  // RFC 8058 expects a 200 on success.
  return new NextResponse("You have been unsubscribed and will receive no further emails.", {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

// GET renders a confirmation page with a POST form. No state change here, so
// prefetchers/scanners that only issue GET cannot unsubscribe anyone.
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  const valid = verifyUnsubscribeToken(token) !== null;

  const body = valid
    ? `<!doctype html><html><head><meta charset="utf-8">
       <meta name="viewport" content="width=device-width, initial-scale=1">
       <title>Unsubscribe</title></head>
       <body style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;color:#0f172a">
         <h1 style="font-size:1.25rem">Unsubscribe</h1>
         <p style="color:#475569">Click the button below to stop receiving emails from us.</p>
         <form method="POST" action="/api/unsubscribe?token=${encodeURIComponent(token)}">
           <input type="hidden" name="List-Unsubscribe" value="One-Click" />
           <button type="submit" style="background:#2563eb;color:#fff;border:0;border-radius:8px;padding:0.6rem 1.2rem;font-size:1rem;cursor:pointer">
             Unsubscribe
           </button>
         </form>
       </body></html>`
    : `<!doctype html><html><head><meta charset="utf-8"><title>Unsubscribe</title></head>
       <body style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem">
         <h1 style="font-size:1.25rem">Invalid link</h1>
         <p style="color:#475569">This unsubscribe link is invalid or expired.</p>
       </body></html>`;

  return new NextResponse(body, {
    status: valid ? 200 : 400,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
