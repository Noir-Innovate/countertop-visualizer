// PayPal Payouts API client.
//
// Docs: https://developer.paypal.com/docs/api/payments.payouts-batch/v1/
// Auth flow: client_credentials → bearer token → POST /v1/payments/payouts.

const DEFAULT_API_BASE = "https://api-m.paypal.com";

export interface PayoutItemInput {
  recipientEmail: string;
  amountCents: number;
  senderItemId: string;
  note?: string;
}

export interface PayoutBatchResult {
  batchId: string;
  batchStatus: string;
  raw: unknown;
}

function getApiBase(): string {
  return process.env.PAYPAL_API_BASE ?? DEFAULT_API_BASE;
}

function getCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("paypal_credentials_missing");
  }
  return { clientId, clientSecret };
}

let cachedToken: { token: string; expiresAt: number } | null = null;

export async function getPayPalAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }

  const { clientId, clientSecret } = getCredentials();
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const res = await fetch(`${getApiBase()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`paypal_oauth_failed: ${res.status} ${body}`);
  }

  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    token: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  };
  return cachedToken.token;
}

function centsToUsd(cents: number): string {
  return (cents / 100).toFixed(2);
}

export async function submitPayoutBatch(
  items: PayoutItemInput[],
  emailSubject = "Your affiliate payout",
): Promise<PayoutBatchResult> {
  if (items.length === 0) {
    throw new Error("paypal_payout_no_items");
  }

  const token = await getPayPalAccessToken();
  const senderBatchId = `batch_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  const body = {
    sender_batch_header: {
      sender_batch_id: senderBatchId,
      email_subject: emailSubject,
    },
    items: items.map((item) => ({
      recipient_type: "EMAIL",
      receiver: item.recipientEmail,
      sender_item_id: item.senderItemId,
      amount: {
        value: centsToUsd(item.amountCents),
        currency: "USD",
      },
      note: item.note ?? "Thanks for the referrals!",
    })),
  };

  const res = await fetch(`${getApiBase()}/v1/payments/payouts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const json = (await res.json().catch(() => ({}))) as {
    batch_header?: { payout_batch_id?: string; batch_status?: string };
    name?: string;
    message?: string;
  };

  if (!res.ok || !json.batch_header?.payout_batch_id) {
    throw new Error(
      `paypal_payout_failed: ${res.status} ${json.name ?? ""} ${json.message ?? ""}`.trim(),
    );
  }

  return {
    batchId: json.batch_header.payout_batch_id,
    batchStatus: json.batch_header.batch_status ?? "PENDING",
    raw: json,
  };
}
