"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";

interface Props {
  orgId: string;
  trialDays: number;
}

interface IntentResponse {
  clientSecret: string;
  publishableKey: string;
}

interface PromoState {
  status: "idle" | "validating" | "applied" | "invalid";
  description?: string;
  promotionCodeId?: string;
  error?: string;
}

const STRIPE_FONTS = [
  {
    cssSrc:
      "https://fonts.googleapis.com/css2?family=Libre+Franklin:wght@400;500;600;700&display=swap",
  },
];

// Map Stripe's terse error codes into something a customer can act on. The
// "processing_error" / "card_declined+duplicate_transaction" cases are the
// usual culprits when a tester reuses the same test card across many
// signups, which Stripe rate-limits in test mode.
function friendlyStripeMessage(err: {
  code?: string;
  decline_code?: string;
  type?: string;
  message?: string;
}): string {
  const code = err.code ?? "";
  const decline = err.decline_code ?? "";
  const base = err.message ?? "Stripe rejected the card.";

  if (code === "card_declined" && decline === "duplicate_transaction") {
    return "Stripe flagged this as a duplicate of a recent setup attempt. Wait a minute and try again, or use a different card.";
  }
  if (code === "card_declined") {
    return `Card declined${decline ? ` (${decline})` : ""}. Try a different card or contact your bank. — ${base}`;
  }
  if (code === "processing_error") {
    return `Stripe couldn't process this card right now. In test mode this often happens when the same test card is reused too quickly across new accounts — wait ~60 seconds, or try another test card (e.g. 4000 0566 5566 5556 / 5555 5555 5555 4444). — ${base}`;
  }
  if (code === "incomplete_number" || code === "invalid_number") {
    return "The card number is invalid.";
  }
  if (code === "expired_card") {
    return "That card is expired.";
  }
  if (code === "incorrect_cvc") {
    return "The card's security code (CVC) is incorrect.";
  }
  if (code === "setup_intent_authentication_failure") {
    return "We couldn't verify the card with your bank (3-D Secure failed). Try again or use another card.";
  }
  if (code) {
    return `${base} (Stripe code: ${code}${decline ? ` / ${decline}` : ""})`;
  }
  return base;
}

async function reportError(
  organizationId: string,
  stage: string,
  err: {
    code?: string;
    decline_code?: string;
    type?: string;
    message?: string;
    payment_method?: { id?: string };
    setup_intent?: { id?: string };
    setup_intent_id?: string;
  },
) {
  try {
    await fetch("/api/billing/trial/log-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId,
        stage,
        message: err.message,
        code: err.code,
        decline_code: err.decline_code,
        type: err.type,
        payment_method_id: err.payment_method?.id,
        setup_intent_id: err.setup_intent?.id ?? err.setup_intent_id,
        raw: err,
      }),
    });
  } catch {
    // best-effort
  }
}

export function EmbeddedTrialForm({ orgId, trialDays }: Props) {
  const [intent, setIntent] = useState<IntentResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    fetch("/api/billing/trial/intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId: orgId }),
    })
      .then(async (res) => {
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(body.error || "Failed to initialize trial setup");
          return;
        }
        setIntent(body);
        setStripePromise(loadStripe(body.publishableKey));
      })
      .catch(() => {
        if (!cancelled) setError("Failed to initialize trial setup");
      });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const appearance = useMemo(
    () => ({
      theme: "stripe" as const,
      variables: {
        fontFamily: '"Libre Franklin", system-ui, sans-serif',
        fontSizeBase: "16px",
        colorPrimary: "#2563eb",
        colorBackground: "#ffffff",
        colorText: "#0f172a",
        colorTextSecondary: "#64748b",
        colorTextPlaceholder: "#94a3b8",
        colorDanger: "#dc2626",
        borderRadius: "8px",
        spacingUnit: "4px",
      },
      rules: {
        ".Label": {
          fontWeight: "500",
          color: "#334155",
          marginBottom: "4px",
        },
        ".Input": {
          border: "1px solid #cbd5e1",
          padding: "12px",
          boxShadow: "none",
        },
        ".Input:focus": {
          border: "1px solid #2563eb",
          boxShadow: "0 0 0 3px rgba(37, 99, 235, 0.15)",
        },
        ".Tab": {
          border: "1px solid #cbd5e1",
          boxShadow: "none",
        },
        ".Tab--selected": {
          border: "1px solid #2563eb",
          boxShadow: "0 0 0 1px #2563eb",
        },
      },
    }),
    [],
  );

  if (error) {
    return (
      <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
        {error}
      </div>
    );
  }

  if (!intent || !stripePromise) {
    return (
      <div className="flex items-center gap-2 text-slate-500 text-sm">
        <span className="inline-block w-4 h-4 border-2 border-slate-300 border-t-blue-600 rounded-full animate-spin" />
        Loading secure payment form…
      </div>
    );
  }

  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret: intent.clientSecret,
        appearance,
        fonts: STRIPE_FONTS,
        loader: "auto",
      }}
    >
      <InnerForm orgId={orgId} trialDays={trialDays} />
    </Elements>
  );
}

function InnerForm({
  orgId,
  trialDays,
}: {
  orgId: string;
  trialDays: number;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showPromo, setShowPromo] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [promo, setPromo] = useState<PromoState>({ status: "idle" });

  const applyPromo = async () => {
    if (!promoCode.trim()) return;
    setPromo({ status: "validating" });
    try {
      const res = await fetch("/api/billing/trial/promo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: promoCode.trim() }),
      });
      const body = await res.json();
      if (body.valid) {
        setPromo({
          status: "applied",
          description: body.description,
          promotionCodeId: body.promotionCodeId,
        });
      } else {
        setPromo({
          status: "invalid",
          error: body.error || "Invalid promotion code",
        });
      }
    } catch {
      setPromo({ status: "invalid", error: "Failed to validate code" });
    }
  };

  const removePromo = () => {
    setPromo({ status: "idle" });
    setPromoCode("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setSubmitting(true);
    setError(null);

    const { error: submitError } = await elements.submit();
    if (submitError) {
      console.error("[trial-form] elements.submit error", submitError);
      void reportError(orgId, "elements_submit", submitError);
      setError(friendlyStripeMessage(submitError));
      setSubmitting(false);
      return;
    }

    const { error: confirmError, setupIntent } = await stripe.confirmSetup({
      elements,
      redirect: "if_required",
      confirmParams: {
        return_url: `${window.location.origin}/onboarding/${orgId}/trial`,
      },
    });

    if (confirmError) {
      console.error("[trial-form] confirmSetup error", confirmError);
      void reportError(orgId, "confirm_setup", confirmError);
      setError(friendlyStripeMessage(confirmError));
      setSubmitting(false);
      return;
    }

    if (!setupIntent || setupIntent.status !== "succeeded") {
      console.error(
        "[trial-form] setupIntent did not succeed",
        setupIntent?.status,
        setupIntent,
      );
      void reportError(orgId, "setup_intent_not_succeeded", {
        message: `SetupIntent ended in status "${setupIntent?.status ?? "unknown"}".`,
        setup_intent_id: setupIntent?.id,
      });
      setError(
        `Payment method could not be saved (status: ${setupIntent?.status ?? "unknown"}). Please try again or use a different card.`,
      );
      setSubmitting(false);
      return;
    }

    try {
      const res = await fetch("/api/billing/trial/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: orgId,
          setupIntentId: setupIntent.id,
          promotionCodeId:
            promo.status === "applied" ? promo.promotionCodeId : undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error || "Failed to start trial");
      }
      router.push(`/onboarding/${orgId}/website`);
      router.refresh();
    } catch (err) {
      console.error("[trial-form] /api/billing/trial/confirm failed", err);
      void reportError(orgId, "trial_confirm_api", {
        message: err instanceof Error ? err.message : String(err),
      });
      setError(err instanceof Error ? err.message : "Failed to start trial");
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <PaymentElement options={{ layout: "tabs" }} />

      <div>
        {!showPromo && promo.status !== "applied" && (
          <button
            type="button"
            onClick={() => setShowPromo(true)}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            Have a promo code?
          </button>
        )}

        {showPromo && promo.status !== "applied" && (
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-700">
              Promo code
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value)}
                placeholder="WELCOME20"
                className="flex-1 px-4 py-3 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={promo.status === "validating"}
              />
              <button
                type="button"
                onClick={applyPromo}
                disabled={promo.status === "validating" || !promoCode.trim()}
                className="px-5 py-3 border border-slate-300 text-slate-700 font-medium rounded-lg hover:bg-slate-50 disabled:opacity-50"
              >
                {promo.status === "validating" ? "Checking…" : "Apply"}
              </button>
            </div>
            {promo.status === "invalid" && (
              <p className="text-sm text-red-600">{promo.error}</p>
            )}
          </div>
        )}

        {promo.status === "applied" && (
          <div className="flex items-center justify-between p-3 rounded-lg bg-emerald-50 border border-emerald-200">
            <div className="text-sm">
              <span className="font-semibold text-emerald-800">
                {promoCode.trim().toUpperCase()}
              </span>
              <span className="text-emerald-700 ml-2">
                — {promo.description}
              </span>
            </div>
            <button
              type="button"
              onClick={removePromo}
              className="text-xs text-emerald-700 hover:text-emerald-900 underline"
            >
              Remove
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={!stripe || !elements || submitting}
        className="w-full px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {submitting
          ? "Starting trial…"
          : `Start ${trialDays}-day free trial`}
      </button>

      <p className="text-xs text-slate-500 text-center">
        Your card won&apos;t be charged until the trial ends. Cancel anytime
        from billing settings.
      </p>
    </form>
  );
}
