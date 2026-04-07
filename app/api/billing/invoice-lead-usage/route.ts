import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient as createAuthedClient } from "@/lib/supabase/server";
import { getStripeServerClient } from "@/lib/stripe";
import { getPreviousMonthPeriod } from "@/lib/lead-invoicing";
import { runLeadUsageBillingService } from "@/lib/lead-billing-service";
import { fetchDedupedUninvoicedUsageForInvoicePeriod } from "@/lib/invoice-lead-usage-loader";

/**
 * Lead usage invoicing (Stripe). Vercel Cron is configured in `vercel.json` to
 * call GET `/api/billing/invoice-lead-usage` monthly; this file's GET handler
 * delegates to POST, so cron and manual POST use the same code path. Uninvoiced
 * rows are loaded via `fetchDedupedUninvoicedUsageForInvoicePeriod` (one billable
 * line per unique phone/email per period).
 */
function getHeaderSecret(request: NextRequest) {
  return request.headers.get("x-cron-secret");
}

function assertCronAccess(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  // In development, allow local runs without secret for easier manual testing.
  if (!expected && process.env.NODE_ENV !== "production") return true;
  const bearer = request.headers.get("authorization");
  const bearerToken = bearer?.startsWith("Bearer ") ? bearer.slice(7) : null;
  return Boolean(
    expected &&
    (getHeaderSecret(request) === expected || bearerToken === expected),
  );
}

async function assertManualAccess(organizationId: string) {
  const supabase = await createAuthedClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const [{ data: membership }, { data: profile }] = await Promise.all([
    supabase
      .from("organization_members")
      .select("role")
      .eq("profile_id", user.id)
      .eq("organization_id", organizationId)
      .single(),
    supabase
      .from("profiles")
      .select("is_super_admin")
      .eq("id", user.id)
      .single(),
  ]);

  return Boolean(
    profile?.is_super_admin ||
    (membership && ["owner", "admin"].includes(membership.role)),
  );
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const requestedOrganizationId =
    typeof body.organizationId === "string" ? body.organizationId : null;
  const hasCronAccess = assertCronAccess(request);

  if (!hasCronAccess) {
    if (!requestedOrganizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const hasManualAccess = await assertManualAccess(requestedOrganizationId);
    if (!hasManualAccess) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const stripe = getStripeServerClient();
  const supabase = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const requestedStart =
    typeof body.periodStartIso === "string" ? body.periodStartIso : null;
  const requestedEnd =
    typeof body.periodEndIso === "string" ? body.periodEndIso : null;
  const dryRun = Boolean(body.dryRun);

  const { startIso, endIso } =
    requestedStart && requestedEnd
      ? { startIso: requestedStart, endIso: requestedEnd }
      : getPreviousMonthPeriod(new Date());

  try {
    const result = await runLeadUsageBillingService(
      {
        loadBillingAccounts: async (organizationId) => {
          const query = supabase
            .from("organization_billing_accounts")
            .select("organization_id, stripe_customer_id")
            .not("stripe_customer_id", "is", null);
          if (organizationId) {
            query.eq("organization_id", organizationId);
          }
          const { data, error } = await query;
          if (error) throw new Error(error.message);
          return (data || []).map(
            (row: { organization_id: string; stripe_customer_id: string }) => ({
              organizationId: row.organization_id,
              stripeCustomerId: row.stripe_customer_id,
            }),
          );
        },
        loadUninvoicedUsageRows: async (
          organizationId,
          periodStartIso,
          periodEndIso,
        ) =>
          fetchDedupedUninvoicedUsageForInvoicePeriod(
            supabase,
            organizationId,
            periodStartIso,
            periodEndIso,
          ),
        createStripeInvoiceItem: async ({
          customerId,
          invoiceId,
          amountCents,
          description,
          organizationId,
          usageCount,
          periodStartIso,
          periodEndIso,
        }) => {
          await stripe.invoiceItems.create({
            customer: customerId,
            invoice: invoiceId,
            amount: amountCents,
            currency: "usd",
            description,
            metadata: {
              organizationId,
              usageCount: String(usageCount),
              periodStartIso,
              periodEndIso,
              chargeType: "lead_usage",
            },
          });
        },
        createStripeDraftInvoice: async ({
          customerId,
          organizationId,
          periodStartIso,
          periodEndIso,
        }) => {
          const draftInvoice = await stripe.invoices.create({
            customer: customerId,
            auto_advance: false,
            collection_method: "charge_automatically",
            metadata: {
              organizationId,
              periodStartIso,
              periodEndIso,
              chargeType: "lead_usage",
            },
          });
          return { invoiceId: draftInvoice.id };
        },
        finalizeStripeInvoice: async (invoiceId) => {
          const finalizedInvoice =
            await stripe.invoices.finalizeInvoice(invoiceId);
          const paidInvoice = await stripe.invoices.pay(finalizedInvoice.id);
          return {
            invoiceId: paidInvoice.id,
            invoiceStatus: paidInvoice.status,
            paidAtIso: paidInvoice.status_transitions?.paid_at
              ? new Date(
                  paidInvoice.status_transitions.paid_at * 1000,
                ).toISOString()
              : null,
          };
        },
        markUsageRowsInvoiced: async ({
          organizationId,
          periodStartIso,
          periodEndIso,
          invoiceId,
          invoicedAtIso,
          invoiceStatus,
          paidAtIso,
        }) => {
          const { error } = await supabase
            .from("organization_billing_usage")
            .update({
              stripe_invoice_id: invoiceId,
              invoiced_at: invoicedAtIso,
              stripe_invoice_status: invoiceStatus,
              stripe_invoice_paid_at: paidAtIso ?? null,
              invoice_period_start: periodStartIso,
              invoice_period_end: periodEndIso,
            })
            .eq("organization_id", organizationId)
            .is("invoiced_at", null)
            .gte("occurred_at", periodStartIso)
            .lt("occurred_at", periodEndIso);
          if (error) {
            throw new Error(`Failed to mark usage invoiced: ${error.message}`);
          }
        },
      },
      {
        periodStartIso: startIso,
        periodEndIso: endIso,
        dryRun,
        organizationId: requestedOrganizationId || undefined,
      },
    );

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invoicing failed" },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
