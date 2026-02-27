import { NextRequest, NextResponse } from "next/server";
import { POST as runLeadUsageInvoicing } from "@/app/api/billing/invoice-lead-usage/route";
import { getCurrentMonthPeriod } from "@/lib/lead-invoicing";

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "Test billing route is disabled in production" },
      { status: 404 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const organizationId =
    typeof body.organizationId === "string" ? body.organizationId : null;
  if (!organizationId) {
    return NextResponse.json(
      { error: "organizationId is required" },
      { status: 400 },
    );
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const currentMonthPeriod = getCurrentMonthPeriod(now);
  const periodStartIso =
    typeof body.periodStartIso === "string" && body.periodStartIso
      ? body.periodStartIso
      : currentMonthPeriod.startIso;
  const periodEndIso =
    typeof body.periodEndIso === "string" && body.periodEndIso
      ? body.periodEndIso
      : nowIso;
  const forwardedBody = JSON.stringify({
    organizationId,
    periodStartIso,
    periodEndIso,
    dryRun: Boolean(body.dryRun),
  });

  const forwardedRequest = new NextRequest(request.url, {
    method: "POST",
    headers: request.headers,
    body: forwardedBody,
  });

  return runLeadUsageInvoicing(forwardedRequest);
}
