import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface Body {
  organizationId?: string;
  stage: string;
  // Stripe error fields, all optional because shapes vary.
  message?: string;
  code?: string;
  decline_code?: string;
  type?: string;
  payment_method_id?: string;
  setup_intent_id?: string;
  raw?: unknown;
}

// Pure side-channel: the embedded trial form posts here when Stripe rejects
// the card so we get the full error in server logs. The client's user-facing
// message comes from Stripe directly; this exists so we can debug after the
// fact without asking the customer to read DevTools.
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Body;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  console.error("[trial-form] Stripe rejection", {
    stage: body.stage,
    organizationId: body.organizationId ?? null,
    userId: user?.id ?? null,
    email: user?.email ?? null,
    type: body.type ?? null,
    code: body.code ?? null,
    decline_code: body.decline_code ?? null,
    message: body.message ?? null,
    payment_method_id: body.payment_method_id ?? null,
    setup_intent_id: body.setup_intent_id ?? null,
    raw: body.raw ?? null,
  });

  return NextResponse.json({ ok: true });
}
