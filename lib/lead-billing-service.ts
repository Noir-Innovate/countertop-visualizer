import { buildLeadUsageInvoiceDescription } from "@/lib/lead-invoicing";

export interface BillingAccount {
  organizationId: string;
  stripeCustomerId: string;
}

export interface UsageRow {
  id: string;
  billedAmountCents: number;
}

export interface LeadBillingServiceDeps {
  loadBillingAccounts: (organizationId?: string) => Promise<BillingAccount[]>;
  loadUninvoicedUsageRows: (
    organizationId: string,
    periodStartIso: string,
    periodEndIso: string,
  ) => Promise<UsageRow[]>;
  createStripeInvoiceItem: (input: {
    customerId: string;
    invoiceId: string;
    amountCents: number;
    description: string;
    organizationId: string;
    usageCount: number;
    periodStartIso: string;
    periodEndIso: string;
  }) => Promise<void>;
  createStripeDraftInvoice: (input: {
    customerId: string;
    organizationId: string;
    periodStartIso: string;
    periodEndIso: string;
  }) => Promise<{ invoiceId: string }>;
  finalizeStripeInvoice: (invoiceId: string) => Promise<{
    invoiceId: string;
    invoiceStatus: string | null;
    paidAtIso?: string | null;
  }>;
  markUsageRowsInvoiced: (input: {
    organizationId: string;
    periodStartIso: string;
    periodEndIso: string;
    invoiceId: string;
    invoicedAtIso: string;
    invoiceStatus: string | null;
    paidAtIso?: string | null;
  }) => Promise<void>;
}

export interface LeadBillingRunParams {
  periodStartIso: string;
  periodEndIso: string;
  dryRun?: boolean;
  organizationId?: string;
}

export interface LeadBillingRunResultRow {
  organizationId: string;
  usageCount: number;
  amountCents: number;
  invoiceId?: string;
  skipped: boolean;
  reason?: string;
}

export async function runLeadUsageBillingService(
  deps: LeadBillingServiceDeps,
  params: LeadBillingRunParams,
) {
  const {
    periodStartIso,
    periodEndIso,
    dryRun = false,
    organizationId,
  } = params;
  const billingAccounts = await deps.loadBillingAccounts(organizationId);
  const results: LeadBillingRunResultRow[] = [];

  for (const account of billingAccounts) {
    const usageRows = await deps.loadUninvoicedUsageRows(
      account.organizationId,
      periodStartIso,
      periodEndIso,
    );
    const usageCount = usageRows.length;
    const amountCents = usageRows.reduce(
      (sum, row) => sum + (row.billedAmountCents || 0),
      0,
    );

    if (!usageCount || amountCents <= 0) {
      results.push({
        organizationId: account.organizationId,
        usageCount,
        amountCents,
        skipped: true,
        reason: "No uninvoiced usage for period",
      });
      continue;
    }

    if (dryRun) {
      results.push({
        organizationId: account.organizationId,
        usageCount,
        amountCents,
        skipped: true,
        reason: "dryRun",
      });
      continue;
    }

    const description = buildLeadUsageInvoiceDescription({
      usageCount,
      periodStartIso,
      periodEndIso,
    });

    const draftInvoice = await deps.createStripeDraftInvoice({
      customerId: account.stripeCustomerId,
      organizationId: account.organizationId,
      periodStartIso,
      periodEndIso,
    });

    await deps.createStripeInvoiceItem({
      customerId: account.stripeCustomerId,
      invoiceId: draftInvoice.invoiceId,
      amountCents,
      description,
      organizationId: account.organizationId,
      usageCount,
      periodStartIso,
      periodEndIso,
    });

    const finalized = await deps.finalizeStripeInvoice(draftInvoice.invoiceId);
    const invoicedAtIso = new Date().toISOString();

    await deps.markUsageRowsInvoiced({
      organizationId: account.organizationId,
      periodStartIso,
      periodEndIso,
      invoiceId: finalized.invoiceId,
      invoicedAtIso,
      invoiceStatus: finalized.invoiceStatus,
      paidAtIso: finalized.paidAtIso ?? null,
    });

    results.push({
      organizationId: account.organizationId,
      usageCount,
      amountCents,
      invoiceId: finalized.invoiceId,
      skipped: false,
    });
  }

  return {
    periodStartIso,
    periodEndIso,
    dryRun,
    results,
  };
}
